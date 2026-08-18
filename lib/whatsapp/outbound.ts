import "server-only";

import { DomainError } from "@/lib/domain/errors";
import { WhatsAppProviderError } from "@/lib/whatsapp/failures";
import {
  metaWhatsAppProvider,
  resolveWhatsAppConfigForOrganization,
} from "@/lib/whatsapp/configuration";

const metaGraphApiVersion = "v20.0";
const maxTextLength = 4096;
const e164Pattern = /^\+[1-9]\d{7,14}$/;
const maxRetryAfterSeconds = 3600;

// Causes that prove the request never reached the provider, so a retry cannot
// duplicate an end-user message. Anything else is treated as ambiguous.
const connectPhaseCauseCodes = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export type SendWhatsAppTextInput = {
  organizationId: string;
  to: string;
  text: string;
};

export type SentWhatsAppMessage = {
  provider: typeof metaWhatsAppProvider;
  providerMessageId: string;
  recipient: string;
};

type MetaSendResponse = {
  messages?: Array<{ id?: unknown }>;
};

function validateInput(input: SendWhatsAppTextInput): {
  organizationId: string;
  to: string;
  text: string;
} {
  const organizationId = input.organizationId.trim();
  const to = input.to.trim();
  const text = input.text.trim();
  if (!organizationId) {
    throw new DomainError(
      "whatsapp_configuration_unavailable",
      "WhatsApp provider configuration is unavailable."
    );
  }
  if (!e164Pattern.test(to)) {
    throw new DomainError("whatsapp_destination_invalid", "The WhatsApp destination is invalid.");
  }
  if (!text || text.length > maxTextLength) {
    throw new DomainError("whatsapp_message_invalid", "The WhatsApp message text is invalid.");
  }
  return { organizationId, to, text };
}

function parseProviderResponse(value: unknown, recipient: string): SentWhatsAppMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(
      "whatsapp_provider_response_invalid",
      "The WhatsApp provider response is invalid."
    );
  }
  const response = value as MetaSendResponse;
  const providerMessageId = response.messages?.[0]?.id;
  if (typeof providerMessageId !== "string" || !providerMessageId) {
    throw new DomainError(
      "whatsapp_provider_response_invalid",
      "The WhatsApp provider response is invalid."
    );
  }
  return { provider: metaWhatsAppProvider, providerMessageId, recipient };
}

function parseRetryAfterSeconds(header: string | null): number | null {
  if (!header) return null;
  const value = header.trim();
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds >= 0
      ? Math.min(seconds, maxRetryAfterSeconds)
      : null;
  }
  const target = Date.parse(value);
  if (Number.isNaN(target)) return null;
  const seconds = Math.ceil((target - Date.now()) / 1000);
  return seconds > 0 ? Math.min(seconds, maxRetryAfterSeconds) : 0;
}

function transportFailure(error: unknown): WhatsAppProviderError {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const causeCode = typeof cause?.code === "string" ? cause.code : null;
  if (causeCode && connectPhaseCauseCodes.has(causeCode)) {
    return new WhatsAppProviderError(
      "whatsapp_provider_unreachable",
      "The WhatsApp provider could not be reached."
    );
  }
  return new WhatsAppProviderError(
    "whatsapp_provider_network_failure",
    "The WhatsApp provider request outcome is unknown."
  );
}

export async function sendWhatsAppText(input: SendWhatsAppTextInput): Promise<SentWhatsAppMessage> {
  const { organizationId, to, text } = validateInput(input);
  const config = await resolveWhatsAppConfigForOrganization(organizationId, metaWhatsAppProvider);
  if (!config || !config.accessToken) {
    throw new DomainError(
      "whatsapp_configuration_unavailable",
      "WhatsApp provider configuration is unavailable."
    );
  }

  const url = `https://graph.facebook.com/${metaGraphApiVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });
  } catch (error) {
    throw transportFailure(error);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new WhatsAppProviderError(
        "whatsapp_provider_rate_limited",
        "The WhatsApp provider rate limited the message.",
        parseRetryAfterSeconds(response.headers.get("retry-after"))
      );
    }
    if (response.status >= 500) {
      throw new WhatsAppProviderError(
        "whatsapp_provider_unavailable",
        "The WhatsApp provider is temporarily unavailable."
      );
    }
    throw new DomainError(
      "whatsapp_provider_rejected",
      "The WhatsApp provider rejected the message."
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DomainError(
      "whatsapp_provider_response_invalid",
      "The WhatsApp provider response is invalid."
    );
  }
  return parseProviderResponse(payload, to);
}
