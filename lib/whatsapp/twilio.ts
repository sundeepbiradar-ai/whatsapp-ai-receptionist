import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { DomainError } from "@/lib/domain/errors";

const e164Pattern = /^\+[1-9]\d{7,14}$/;
const maxTextLength = 4096;

/**
 * Twilio's documented signature algorithm: sort the POST form params, append
 * each key+value directly onto the exact webhook URL Twilio invoked, HMAC-SHA1
 * with the Auth Token, then base64. https://www.twilio.com/docs/usage/security
 */
export function computeTwilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null,
  authToken: string | null
): boolean {
  if (!signatureHeader || !authToken) return false;
  const expected = Buffer.from(computeTwilioSignature(url, params, authToken), "utf8");
  const supplied = Buffer.from(signatureHeader, "utf8");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

/**
 * Vercel terminates TLS and proxies to the app, so `request.url` can report an
 * internal scheme/host. Twilio signs the externally visible URL, so the
 * forwarded proto/host (set by the platform, not the caller-controlled body)
 * must be used to reconstruct it.
 */
export function resolveExternalWebhookUrl(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");
  return `${protocol}://${host}${requestUrl.pathname}${requestUrl.search}`;
}

export function parseTwilioFormBody(rawBody: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    params[key] = value;
  }
  return params;
}

function normalizeWhatsAppAddress(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const stripped = value.trim().replace(/^whatsapp:/i, "").trim();
  return e164Pattern.test(stripped) ? stripped : null;
}

export type TwilioInboundMessageEvent = {
  kind: "message";
  provider: "twilio_whatsapp_sandbox";
  organizationId: string;
  configId: string;
  phoneNumberId: string;
  businessAccountId: string;
  providerMessageId: string;
  senderPhone: string;
  recipientPhoneNumberId: string;
  timestamp: string;
  messageType: "text";
  text: string;
};

export type ResolvedTwilioSandboxConfig = {
  configId: string;
  organizationId: string;
  phoneNumberId: string;
  businessAccountId: string;
};

/** Normalizes the destination address only; used before any config lookup. */
export function extractTwilioDestination(params: Record<string, string>): string | null {
  return normalizeWhatsAppAddress(params["To"]);
}

/**
 * Normalizes Twilio's verified form payload into the same inbound-message
 * shape the existing pipeline already persists. Only called after the
 * request's signature has been verified against the resolved configuration.
 */
export function normalizeTwilioInboundMessage(
  params: Record<string, string>,
  config: ResolvedTwilioSandboxConfig
): TwilioInboundMessageEvent {
  const messageSid = params["MessageSid"]?.trim();
  const senderPhone = normalizeWhatsAppAddress(params["From"]);
  const recipientPhoneNumberId = normalizeWhatsAppAddress(params["To"]);
  const text = params["Body"]?.trim();

  if (
    !messageSid ||
    !senderPhone ||
    !recipientPhoneNumberId ||
    recipientPhoneNumberId !== config.phoneNumberId ||
    !text ||
    text.length > maxTextLength
  ) {
    throw new DomainError(
      "whatsapp_pipeline_input_invalid",
      "The Twilio WhatsApp webhook payload is invalid."
    );
  }

  return {
    kind: "message",
    provider: "twilio_whatsapp_sandbox",
    organizationId: config.organizationId,
    configId: config.configId,
    phoneNumberId: config.phoneNumberId,
    businessAccountId: config.businessAccountId,
    providerMessageId: messageSid,
    senderPhone,
    recipientPhoneNumberId,
    timestamp: new Date().toISOString(),
    messageType: "text",
    text,
  };
}
