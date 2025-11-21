import { Modal } from "@/components/modal/Modal";
import { Shield } from "@phosphor-icons/react";
import type { MessageMetadata } from "@/types/verification";

interface VerificationModalProps {
  open: boolean;
  onClose: () => void;
  metadata: MessageMetadata | null;
  messageId: string | null;
}

export function VerificationModal({
  open,
  onClose,
  metadata,
  messageId
}: VerificationModalProps) {
  const verification = metadata?.verification;
  if (!open || !metadata || !verification) return null;

  const renderField = (
    label: string,
    value?: string | number,
    copyable = false
  ) => {
    if (value === undefined || value === null || value === "") return null;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
          {copyable && (
            <button
              type="button"
              className="text-[11px] rounded border border-neutral-300 dark:border-neutral-700 px-2 py-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              onClick={() => navigator.clipboard.writeText(String(value))}
            >
              Copy
            </button>
          )}
        </div>
        <div className="w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/60 px-3 py-2 text-xs font-mono break-all">
          {String(value)}
        </div>
      </div>
    );
  };

  const statusPill = (() => {
    const status = metadata.verificationStatus ?? "pending";
    const color =
      status === "verified"
        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-200 border-emerald-500/40"
        : status === "failed"
          ? "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/40"
          : "bg-amber-500/20 text-amber-700 dark:text-amber-200 border-amber-500/40";
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${color}`}
      >
        <Shield size={14} />
        {status}
      </span>
    );
  })();

  return (
    <Modal isOpen={open} onClose={onClose} className="w-[90vw] max-w-3xl">
      <div className="space-y-5 p-5 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-xs uppercase text-neutral-500 dark:text-neutral-400">
              Verification
            </p>
            <div className="flex items-center gap-3">
              {statusPill}
              <span className="text-sm text-neutral-600 dark:text-neutral-300">
                Model: {verification.model}
              </span>
            </div>
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-300 flex flex-col gap-2">
            <div className="flex justify-between gap-4">
              <span className="font-semibold uppercase">Message ID</span>
              <span className="font-mono">{messageId}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-semibold uppercase">Chat ID</span>
              <span className="font-mono">{verification.chatId}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-semibold uppercase">Verified At</span>
              <span className="font-mono">
                {verification.fetchedAt
                  ? new Date(verification.fetchedAt).toLocaleString()
                  : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderField("Request hash", verification.requestHash, true)}
          {renderField("Response hash", verification.responseHash, true)}
          {renderField(
            "Signed payload",
            verification.signature?.text || verification.signature?.signedHash,
            true
          )}
          {renderField(
            "Signature (ECDSA)",
            verification.signature?.signature,
            true
          )}
          {renderField(
            "Signing address",
            verification.signature?.signing_address ??
              verification.signature?.signerPublicKey,
            true
          )}
          {renderField(
            "Attestation signer",
            verification.attestation?.gateway_attestation?.signing_address ||
              verification.attestation?.signing_address,
            true
          )}
        </div>

        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/60 p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Attestation summary
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-neutral-800 dark:text-neutral-200">
            {renderField(
              "Intel quote present",
              verification.attestation?.gateway_attestation?.intel_quote
                ? "yes"
                : verification.attestation?.intel_quote
                  ? "yes"
                  : "no"
            )}
            {renderField(
              "Signing algo",
              verification.attestation?.gateway_attestation?.signing_algo ||
                verification.attestation?.signing_algo
            )}
            {renderField(
              "Request nonce",
              verification.attestation?.gateway_attestation?.request_nonce ||
                verification.attestation?.request_nonce,
              true
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
