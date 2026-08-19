import "server-only";

import { DomainError } from "@/lib/domain/errors";
import { WhatsAppProviderError } from "@/lib/whatsapp/failures";
import {
  resolveWhatsAppConfigForOrganization,
  twilioWhatsAppSandboxProvider,
} from "@/lib/whatsapp/configuration";

const maxTextLength = 4096;
const e164Pattern = /^\+[1-9]\d{7,14}$/;

export type SendTwilioSandboxTextInput = {
  organizationId: string;
  to: string;
  text: string;
};

export type SentTwilioSandboxMessage = {
  provider: typeof twilioWhatsAppSandboxProvider;
  providerMessageId: string;
  recipient: string;
};

type TwilioSendResponse = { sid?: unknown };
type TwilioErrorResponse = { code?: unknown; message?: unknown };

async function readErrorDiagnostics(
  response: Response,
  sensitiveValues: string[]
): Promise<{ twilioCode?: number; twilioMessage?: string }> {
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    const errorResponse = value as TwilioErrorResponse;
    const twilioCode =
      typeof errorResponse.code === "number" && Number.isFinite(errorResponse.code)
        ? errorResponse.code
        : undefined;
    let twilioMessage =
      typeof errorResponse.message === "string" && errorResponse.message
        ? errorResponse.message
        : undefined;
    for (const sensitiveValue of sensitiveValues) {
      if (twilioMessage && sensitiveValue) {
        twilioMessage = twilioMessage.split(sensitiveValue).join("[REDACTED]");
      }
    }
    return { twilioCode, twilioMessage };
  } catch {
    return {};
  }
}

function validateInput(input: SendTwilioSandboxTextInput): {
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

function parseProviderResponse(value: unknown, recipient: string): SentTwilioSandboxMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(
      "whatsapp_provider_response_invalid",
      "The WhatsApp provider response is invalid."
    );
  }
  const response = value as TwilioSendResponse;
  if (typeof response.sid !== "string" || !response.sid) {
    throw new DomainError(
      "whatsapp_provider_response_invalid",
      "The WhatsApp provider response is invalid."
    );
  }
  return { provider: twilioWhatsAppSandboxProvider, providerMessageId: response.sid, recipient };
}

function transportFailure(): WhatsAppProviderError {
  return new WhatsAppProviderError(
    "whatsapp_provider_network_failure",
    "The WhatsApp provider request outcome is unknown."
  );
}

/**
 * Sandbox-only outbound send via Twilio's REST API. The account SID and auth
 * token both come from the organization's resolved twilio_whatsapp_sandbox
 * configuration (Vault-backed access token); no separate environment secret
 * is introduced. This is a first-implementation adapter: it performs a single
 * attempt with no queued retry semantics.
 */
export async function sendTwilioSandboxText(
  input: SendTwilioSandboxTextInput
): Promise<SentTwilioSandboxMessage> {
  const { organizationId, to, text } = validateInput(input);
  const config = await resolveWhatsAppConfigForOrganization(organizationId, twilioWhatsAppSandboxProvider);
  if (!config || !config.accessToken) {
    throw new DomainError(
      "whatsapp_configuration_unavailable",
      "WhatsApp provider configuration is unavailable."
    );
  }

  const accountSid = config.businessAccountId;
  const authToken = config.accessToken;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const body = new URLSearchParams({
    From: `whatsapp:${config.phoneNumberId}`,
    To: `whatsapp:${to}`,
    Body: text,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch {
    throw transportFailure();
  }

  if (!response.ok) {
    const diagnostics = await readErrorDiagnostics(response, [
      authToken,
      accountSid,
      config.phoneNumberId,
      to,
      text,
    ]);
    console.error("twilio_whatsapp_outbound_rejected", {
      status: response.status,
      twilioCode: diagnostics.twilioCode,
      twilioMessage: diagnostics.twilioMessage,
    });
    if (response.status === 429) {
      throw new WhatsAppProviderError(
        "whatsapp_provider_rate_limited",
        "The WhatsApp provider rate limited the message."
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
