// Types derived from expected NEAR AI verification schema.
// Adjust as per official NEAR AI documentation when available.

export interface NrasResult {
  success: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface NrasJwtClaims {
  iss: string; // issuer
  sub: string; // subject (e.g. model or TEE enclave id)
  iat: number; // issued at (unix timestamp)
  exp: number; // expiration (unix timestamp)
  nbf?: number; // not before
  jti?: string; // JWT id
  enclave_measurement?: string;
  tee?: string; // e.g. AMD-SEV, SGX, etc.
  hw_version?: string;
  [key: string]: unknown; // future claims
}

export interface SignatureResponse {
  chatId?: string;
  model: string;
  signature: string; // base64 / hex encoded signature
  signedHash?: string; // hash that was signed (legacy)
  text?: string; // concatenated request/response hash "req:res"
  signerPublicKey?: string; // optional public key (legacy)
  signing_address?: string; // ecdsa signing address
  algorithm?: string; // e.g. secp256k1, ed25519
  signing_algo?: string; // e.g. ecdsa
  timestamp?: string; // ISO timestamp
  nrasResult?: NrasResult;
}

export interface AttestationResponse {
  model: string;
  attestationDocument?: string; // raw attestation document (e.g. AWS Nitro, SGX quote)
  jwt?: string; // JWT containing attestation claims
  claims?: NrasJwtClaims; // Parsed claims if available
  enclaveIdentity?: string; // optional identity / measurement
  signing_address?: string; // TEE public key
  nvidia_payload?: Record<string, unknown>; // NRAS payload
  intel_quote?: string; // Intel TDX quote
  all_attestations?: Array<Record<string, unknown>>; // multi-node
  nrasResult?: NrasResult;
}

export interface VerificationData {
  chatId: string;
  model: string;
  requestHash: string;
  responseHash: string;
  signature?: SignatureResponse;
  attestation?: AttestationResponse;
  verified: boolean; // true when signature + attestation validated
  fetchedAt?: string; // ISO timestamp when verification completed
  error?: string; // error detail if failed
}

export interface MessageMetadata {
  createdAt: string;
  verification?: VerificationData;
  verificationStatus?: "pending" | "verified" | "failed";
}
