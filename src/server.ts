import { routeAgentRequest, type Schedule } from "agents";

import { getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  type StreamTextOnFinishCallback,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ToolSet,
  type UIMessage
} from "ai";
// NEAR AI integration
import { streamChatCompletion } from "./lib/near-ai";
import { verificationService } from "./lib/verification-service";
import type { VerificationData, MessageMetadata } from "./types/verification";
import { computeHash } from "./lib/verification";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
// import { env } from "cloudflare:workers";

// Models available on NEAR AI Cloud:
// https://cloud.near.ai/models
//
// - deepseek-ai/DeepSeek-V3.1
// - openai/gpt-oss-120b
// - Qwen/Qwen3-30B-A3B-Instruct-2507
const NEAR_MODEL = "openai/gpt-oss-120b";

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Override default saveMessages to avoid re-invoking onChatMessage.
   * The base class triggers onChatMessage after persisting, which causes
   * the model to respond again with the same history (infinite loop).
   * Here we only persist and broadcast the updated messages.
   */
  async saveMessages(messages: UIMessage[]) {
    this.messages = messages;
    await this.persistMessages(messages);
  }

  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };
    // Expose chat agent globally for verification polling endpoint.
    (globalThis as any).__lastChatAgent = this;

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        // Prepare messages for NEAR AI (flatten parts to simple role/content pairs)
        const nearMessages = processedMessages.map((m) => ({
          role: m.role,
          content: m.parts
            .filter((p) => p.type === "text")
            .map((p: any) => p.text)
            .join("\n")
        }));

        const apiKey = process.env.NEARAI_CLOUD_API_KEY || "";
        if (!apiKey) {
          console.error("NEARAI_CLOUD_API_KEY is missing.");
        } else {
          console.log("API key found, starting stream...");
        }

        let streamedText = "";
        console.log("Calling streamChatCompletion with model:", NEAR_MODEL);
        let chatId: string | null = null;
        let requestBody: any = null;
        const messageId = generateId();

        try {
          const result = await streamChatCompletion({
            messages: [
              {
                role: "system",
                content: `You are a helpful AI assistant powered by NEAR AI Cloud with private, verifiable inference.\n\n${getSchedulePrompt({ date: new Date() })}\n\nIf the user asks to schedule a task, use the schedule tool to schedule the task.`
              },
              ...nearMessages
            ],
            apiKey,
            model: NEAR_MODEL,
            onToken: (token) => {
              streamedText += token;
              // Write token to the data stream
              writer.write({
                type: "text-delta",
                delta: token,
                id: messageId
              });
            }
          });
          chatId = result.chatId;
          requestBody = result.requestBody;
          console.log(
            "Stream completed. Text length:",
            streamedText.length,
            "chatId:",
            chatId
          );

          // Signal end of text stream
          writer.write({
            type: "finish"
          });
        } catch (error) {
          console.error("Stream error:", error);
          throw error;
        }
        // Store initial message with pending verification
        const pendingMetadata: MessageMetadata = {
          createdAt: new Date().toISOString(),
          verificationStatus: "pending",
          verification: {
            chatId: chatId || "",
            model: NEAR_MODEL,
            requestHash: "", // placeholders until computed in service
            responseHash: "",
            verified: false
          }
        };

        await this.saveMessages([
          ...this.messages,
          {
            id: messageId,
            role: "assistant",
            parts: [
              {
                type: "text",
                text: streamedText
              }
            ],
            metadata: pendingMetadata
          }
        ]);

        console.log("Verification pending...", { messageId, chatId });

        // Kick off async verification task (non-blocking)
        if (chatId && apiKey) {
          (async () => {
            const verificationTimeoutMs = 30000; // fail fast instead of stuck pending
            try {
              const data: VerificationData = await Promise.race([
                verificationService.verifyMessage({
                  chatId,
                  requestBody,
                  responseText: streamedText,
                  model: NEAR_MODEL,
                  apiKey
                }),
                new Promise<never>((_, reject) =>
                  setTimeout(
                    () => reject(new Error("verification-timeout")),
                    verificationTimeoutMs
                  )
                )
              ]);
              // Update message metadata with verification results
              const updatedMessages = this.messages.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      metadata: {
                        ...((m.metadata as any) || {}),
                        verification: data,
                        verificationStatus: data.verified
                          ? "verified"
                          : "failed"
                      }
                    }
                  : m
              );
              await this.saveMessages(updatedMessages);
              console.log(
                data.verified ? "Verification complete" : "Verification failed",
                data
              );
            } catch (e) {
              let requestHash = "";
              let responseHash = "";
              try {
                requestHash = await computeHash(
                  JSON.stringify(requestBody) + "\n\n"
                );
                responseHash = await computeHash(streamedText + "\n\n");
              } catch (_hashErr) {
                // ignore hash calculation failure
              }
              const updatedMessages = this.messages.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      metadata: {
                        ...((m.metadata as any) || {}),
                        verification: {
                          ...((m.metadata as any)?.verification || {}),
                          error: String(e),
                          verified: false,
                          fetchedAt: new Date().toISOString(),
                          chatId: chatId || "",
                          model: NEAR_MODEL,
                          requestHash,
                          responseHash
                        },
                        verificationStatus: "failed"
                      }
                    }
                  : m
              );
              await this.saveMessages(updatedMessages);
              console.error("Verification error", e);
            }
          })();
        }

        // Notify finish callback early with pending status
        (onFinish as any)?.({
          response: {
            messages: [
              {
                id: messageId,
                role: "assistant",
                content: streamedText
              }
            ]
          },
          verification: pendingMetadata.verification
        });
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date().toISOString()
        }
      }
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/check-near-ai-key") {
      const hasNearAIKey = !!process.env.NEARAI_CLOUD_API_KEY;
      return Response.json({ success: hasNearAIKey });
    }
    // Verification status endpoint
    if (url.pathname.startsWith("/api/verification/")) {
      const messageId = url.pathname.split("/api/verification/")[1];
      // Attempt to find message in agent state (routeAgentRequest will populate messages before this handler? If not, status may be unknown)
      // For simplicity, return minimal status by scanning current Chat instance messages if available.
      // We rely on routeAgentRequest for chat operations, so here we create a lightweight response.
      const chatAgent = (globalThis as any).__lastChatAgent as Chat | undefined;
      if (chatAgent) {
        const msg = chatAgent.messages.find((m) => m.id === messageId);
        if (msg) {
          return Response.json({
            messageId,
            verificationStatus:
              (msg.metadata as any)?.verificationStatus || "unknown",
            verification: (msg.metadata as any)?.verification || null
          });
        }
      }
      return Response.json({ messageId, verificationStatus: "unknown" });
    }
    if (!process.env.NEARAI_CLOUD_API_KEY) {
      console.error(
        "NEARAI_CLOUD_API_KEY is not set. Set it locally in .dev.vars, and use `wrangler secret put NEARAI_CLOUD_API_KEY` to upload it to production"
      );
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
