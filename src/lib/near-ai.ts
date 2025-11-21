// NEAR AI Cloud API client
// Provides streaming chat completion compatible with Server-Sent Events
// Endpoint: https://cloud-api.near.ai/v1/chat/completions
// Captures chat id from response headers (e.g. x-chat-id) and accumulates streamed text.

export interface ChatMessage {
  role: string;
  content: string;
}

export interface StreamChatCompletionParams {
  messages: ChatMessage[];
  apiKey: string;
  model?: string;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

export interface StreamChatCompletionResult {
  response: Response;
  chatId: string | null;
  requestBody: unknown;
  responseText: string;
}

const DEFAULT_MODEL = "openai/gpt-oss-120b";

// Utility: parse SSE chunks into events; returns array of data payload strings
function parseSSE(buffer: string): string[] {
  const events: string[] = [];
  const parts = buffer.split(/\n\n/); // events separated by blank line
  for (const part of parts) {
    if (!part.trim()) continue;
    // Each line may start with 'data: '
    const dataLines = part
      .split(/\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.replace(/^data:\s?/, ""));
    if (dataLines.length) {
      events.push(dataLines.join("\n"));
    }
  }
  return events;
}

// Try to capture a chat id from the response JSON payload in addition to headers.
// NEAR AI may return this as `chat_id`, `chatId`, or reuse the OpenAI-style `id`.
function extractChatId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const candidates = [
    obj["chat_id"],
    obj["chatId"],
    obj["id"],
    (obj["response"] as Record<string, unknown> | undefined)?.["chat_id"],
    (obj["response"] as Record<string, unknown> | undefined)?.["id"],
    (obj["choices"] as Array<Record<string, unknown>> | undefined)?.[0]?.["id"]
  ];
  const found = candidates.find(
    (c): c is string => typeof c === "string" && c.trim().length > 0
  );
  return found || null;
}

// Stream chat completion from NEAR AI Cloud API
export async function streamChatCompletion(
  params: StreamChatCompletionParams
): Promise<StreamChatCompletionResult> {
  const { messages, apiKey, model = DEFAULT_MODEL, onToken, signal } = params;

  const requestBody = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true
    // Additional fields (temperature, tools, etc.) can be added later.
  };

  const resp = await fetch("https://cloud-api.near.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody),
    signal
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `NEAR AI streaming request failed: ${resp.status} ${resp.statusText} ${text}`
    );
  }

  // Attempt to locate chat id header
  let chatId: string | null = null;
  const chatIdHeader =
    resp.headers.get("x-chat-id") || resp.headers.get("chat-id");
  if (chatIdHeader) {
    chatId = chatIdHeader;
  } else {
    // Additional fallbacks: some deployments may surface an id via different headers
    const headerFallback =
      resp.headers.get("x-request-id") || resp.headers.get("request-id");
    if (headerFallback) {
      chatId = headerFallback;
    }
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let responseText = "";
  let sseBuffer = "";
  let done = false;

  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) {
      done = true;
      break;
    }
    if (!value) continue;
    const chunk = decoder.decode(value, { stream: true });
    sseBuffer += chunk;
    // Process complete events
    const events = parseSSE(sseBuffer);
    // Keep remainder (last part may be incomplete if not ending with \n\n)
    const lastDoubleNewlineIndex = sseBuffer.lastIndexOf("\n\n");
    if (lastDoubleNewlineIndex !== -1) {
      sseBuffer = sseBuffer.slice(lastDoubleNewlineIndex + 2);
    }
    for (const ev of events) {
      if (ev === "[DONE]") continue;
      try {
        const json = JSON.parse(ev);
        if (!chatId) {
          const extracted = extractChatId(json);
          if (extracted) {
            chatId = extracted;
          }
        }
        // OpenAI-like delta structure support
        const deltaContent = json?.choices?.[0]?.delta?.content;
        if (typeof deltaContent === "string" && deltaContent.length) {
          responseText += deltaContent;
          onToken?.(deltaContent);
        }
        // Anthropic-like content block support (if format differs)
        const contentBlock = json?.content?.[0]?.text;
        if (typeof contentBlock === "string" && contentBlock.length) {
          responseText += contentBlock;
          onToken?.(contentBlock);
        }
      } catch (_e) {
        // Non-JSON event; ignore
      }
    }
  }

  return {
    response: resp,
    chatId,
    requestBody,
    responseText
  };
}
