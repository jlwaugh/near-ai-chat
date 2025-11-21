import { computeHash, fetchSignature, fetchAttestation } from "./verification";
import type {
  VerificationData,
  SignatureResponse,
  AttestationResponse
} from "../types/verification";
import { ethers } from "ethers";

// Basic signature validation helper (best-effort; adjust with official spec)
function validateSignature(
  sig: SignatureResponse | undefined,
  expectedHash: string
): boolean {
  if (!sig) return false;
  // NEAR AI returns "text" in the form `${reqHash}:${resHash}`
  const signedPayload = sig.text || sig.signedHash || expectedHash;
  // ECDSA verification using signing_address (preferred)
  try {
    const recovered = ethers.verifyMessage(
      signedPayload,
      sig.signature as `0x${string}`
    );
    const expectedAddr =
      sig.signing_address || sig.signerPublicKey || sig.signerPublicKey;
    if (expectedAddr && recovered.toLowerCase() === expectedAddr.toLowerCase()) {
      return true;
    }
  } catch (_e) {
    // ignore
  }
  return false;
}

export class VerificationService {
  async verifyMessage(params: {
    chatId: string;
    requestBody: unknown;
    responseText: string;
    model: string;
    apiKey: string;
  }): Promise<VerificationData> {
    const { chatId, requestBody, responseText, model, apiKey } = params;
    // Hashes include trailing \n\n per instructions, but provider text may omit them
    const requestHashWithNewlines = await computeHash(
      JSON.stringify(requestBody) + "\n\n"
    );
    const requestHashNoNewlines = await computeHash(JSON.stringify(requestBody));
    const responseHashWithNewlines = await computeHash(responseText + "\n\n");
    const responseHashNoNewlines = await computeHash(responseText);

    let requestHash = requestHashWithNewlines;
    let responseHash = responseHashWithNewlines;

    let signature: SignatureResponse | undefined;
    let attestation: AttestationResponse | undefined;
    let error: string | undefined;

    try {
      signature = await fetchSignature(chatId, model, apiKey);
    } catch (e) {
      error = `signature-fetch-failed: ${String(e)}`;
    }
    try {
      attestation = await fetchAttestation(model, apiKey);
    } catch (e) {
      error = error
        ? `${error}; attestation-fetch-failed: ${String(e)}`
        : `attestation-fetch-failed: ${String(e)}`;
    }

    // If the provider returned hashes, prefer matching combo; otherwise fall back to ours.
    if (signature?.text) {
      const parts = signature.text.split(":");
      if (parts.length === 2) {
        const [sigReq, sigRes] = parts;
        const matchesWith =
          sigReq === requestHashWithNewlines &&
          sigRes === responseHashWithNewlines;
        const matchesWithout =
          sigReq === requestHashNoNewlines &&
          sigRes === responseHashNoNewlines;

        if (matchesWith) {
          requestHash = requestHashWithNewlines;
          responseHash = responseHashWithNewlines;
        } else if (matchesWithout) {
          requestHash = requestHashNoNewlines;
          responseHash = responseHashNoNewlines;
        } else {
          // fall back to provider-reported hashes
          requestHash = sigReq;
          responseHash = sigRes;
        }
      }
    }

    const concatenated = `${requestHash}:${responseHash}`;
    const verified = validateSignature(signature, concatenated) && !!attestation;

    return {
      chatId,
      model,
      requestHash,
      responseHash,
      signature,
      attestation,
      verified,
      fetchedAt: new Date().toISOString(),
      error
    };
  }
}

export const verificationService = new VerificationService();
