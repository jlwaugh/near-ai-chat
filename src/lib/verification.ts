import type {
  AttestationResponse,
  SignatureResponse,
  VerificationData
} from "../types/verification";

// Compute SHA-256 hash of data string (including provided trailing \n\n if caller adds it)
export async function computeHash(data: string): Promise<string> {
  const enc = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface BackoffConfig {
  attempts: number;
  delays: number[]; // ms
}

const backoff: BackoffConfig = {
  attempts: 5,
  delays: [5000, 10000, 15000, 20000, 30000]
};

// Fetch signature with exponential backoff.
// NOTE: Endpoint paths are assumptions and may need adjustment per official docs.
export async function fetchSignature(
  chatId: string,
  model: string,
  apiKey: string
): Promise<SignatureResponse> {
  let lastError: unknown;
  for (let i = 0; i < backoff.attempts; i++) {
    try {
      const res = await fetch(
        `https://cloud-api.near.ai/v1/signature/${encodeURIComponent(
          chatId
        )}?model=${encodeURIComponent(model)}&signing_algo=ecdsa`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        }
      );
      if (!res.ok) {
        throw new Error(`Signature fetch failed: ${res.status}`);
      }
      const data = (await res.json()) as SignatureResponse;
      return data;
    } catch (e) {
      lastError = e;
      if (i < backoff.attempts - 1) {
        await new Promise((r) => setTimeout(r, backoff.delays[i]));
        continue;
      }
    }
  }
  throw new Error(
    `Failed to fetch signature after retries: ${String(lastError)}`
  );
}

export async function fetchAttestation(
  model: string,
  apiKey: string
): Promise<AttestationResponse> {
  let lastError: unknown;
  for (let i = 0; i < backoff.attempts; i++) {
    try {
      const res = await fetch(
        `https://cloud-api.near.ai/v1/attestation/report?model=${encodeURIComponent(
          model
        )}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        }
      );
      if (!res.ok) {
        throw new Error(`Attestation fetch failed: ${res.status}`);
      }
      const data = (await res.json()) as AttestationResponse;
      return data;
    } catch (e) {
      lastError = e;
      if (i < backoff.attempts - 1) {
        await new Promise((r) => setTimeout(r, backoff.delays[i]));
        continue;
      }
    }
  }
  throw new Error(
    `Failed to fetch attestation after retries: ${String(lastError)}`
  );
}

// Build a verification data aggregate object (helper, optional future use)
export function buildVerificationData(args: {
  chatId: string | null;
  model: string;
  requestHash: string;
  responseHash: string;
  signature?: SignatureResponse;
  attestation?: AttestationResponse;
}): VerificationData {
  return {
    chatId: args.chatId ?? "",
    model: args.model,
    requestHash: args.requestHash,
    responseHash: args.responseHash,
    signature: args.signature,
    attestation: args.attestation,
    verified: false
  };
}
