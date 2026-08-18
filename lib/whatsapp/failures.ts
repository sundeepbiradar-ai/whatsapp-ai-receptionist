import { DomainError, type DomainErrorCode } from "@/lib/domain/errors";

/**
 * `ambiguous` means the provider may have accepted the message. Those outcomes
 * are never retried automatically because the WhatsApp Cloud API offers no
 * client idempotency key for text sends.
 */
export type WhatsAppFailureClass = "retryable" | "ambiguous" | "permanent";

export class WhatsAppProviderError extends DomainError {
  readonly retryAfterSeconds: number | null;

  constructor(code: DomainErrorCode, message: string, retryAfterSeconds: number | null = null) {
    super(code, message);
    this.name = "WhatsAppProviderError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const retryableCodes = new Set<DomainErrorCode>([
  "whatsapp_provider_rate_limited",
  "whatsapp_provider_unavailable",
  "whatsapp_provider_unreachable",
]);

const ambiguousCodes = new Set<DomainErrorCode>([
  "whatsapp_provider_network_failure",
  "whatsapp_provider_response_invalid",
  "whatsapp_message_unconfirmed",
]);

export function classifyWhatsAppFailure(code: DomainErrorCode): WhatsAppFailureClass {
  if (retryableCodes.has(code)) return "retryable";
  if (ambiguousCodes.has(code)) return "ambiguous";
  return "permanent";
}

export function whatsAppRetryAfterSeconds(error: unknown): number | null {
  return error instanceof WhatsAppProviderError ? error.retryAfterSeconds : null;
}
