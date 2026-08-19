import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { DomainError } from "@/lib/domain/errors";
import type { ResolvedWhatsAppConfig } from "@/lib/whatsapp/configuration";

const signaturePattern = /^sha256=([0-9a-f]{64})$/i;

export type WhatsAppInboundMessageEvent = {
  kind: "message";
  provider: "meta_whatsapp_cloud" | "twilio_whatsapp_sandbox";
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

export type WhatsAppStatusEvent = {
  kind: "status";
  provider: "meta_whatsapp_cloud";
  organizationId: string;
  configId: string;
  phoneNumberId: string;
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  errorCode: string | null;
  errorMessage: string | null;
};

export type NormalizedWhatsAppEvent = WhatsAppInboundMessageEvent | WhatsAppStatusEvent;

export function verifyWebhookToken(
  expectedToken: string | null,
  suppliedToken: string | null
): boolean {
  if (!expectedToken || !suppliedToken) return false;
  const expectedDigest = createHash("sha256").update(expectedToken, "utf8").digest();
  const suppliedDigest = createHash("sha256").update(suppliedToken, "utf8").digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

export function verifyMetaWebhookSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  appSecret: string | null
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const match = signaturePattern.exec(signatureHeader.trim());
  if (!match?.[1]) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const supplied = Buffer.from(match[1], "hex");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

export function parseWebhookJson(rawBody: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(rawBody)) as unknown;
  } catch {
    throw new DomainError("whatsapp_payload_invalid", "The WhatsApp webhook payload is invalid.");
  }
}

export function extractPhoneNumberId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || typeof change !== "object" || Array.isArray(change)) continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const metadata = (value as { metadata?: unknown }).metadata;
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) continue;
      const phoneNumberId = (metadata as { phone_number_id?: unknown }).phone_number_id;
      if (typeof phoneNumberId === "string" && phoneNumberId.trim().length > 0)
        return phoneNumberId;
    }
  }
  return null;
}

function normalizeProviderTimestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new DomainError(
      "whatsapp_pipeline_input_invalid",
      "The WhatsApp event timestamp is invalid."
    );
  }
  const timestamp = Number(value);
  const date = new Date(timestamp * 1000);
  if (!Number.isSafeInteger(timestamp) || Number.isNaN(date.getTime())) {
    throw new DomainError(
      "whatsapp_pipeline_input_invalid",
      "The WhatsApp event timestamp is invalid."
    );
  }
  return date.toISOString();
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const maxStatusErrorMessageLength = 500;

function normalizeStatusError(value: unknown): {
  errorCode: string | null;
  errorMessage: string | null;
} {
  const first = Array.isArray(value) ? objectValue(value[0]) : null;
  if (!first) return { errorCode: null, errorMessage: null };
  const rawCode = first["code"];
  const code =
    typeof rawCode === "string" && rawCode.trim()
      ? rawCode.trim()
      : typeof rawCode === "number" && Number.isFinite(rawCode)
        ? String(rawCode)
        : null;
  const detail = objectValue(first["error_data"])?.["details"];
  const rawMessage = [first["title"], first["message"], detail].find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0
  );
  return {
    errorCode: code,
    errorMessage: rawMessage ? rawMessage.trim().slice(0, maxStatusErrorMessageLength) : null,
  };
}

export function normalizeMetaWebhookEvents(
  payload: unknown,
  config: ResolvedWhatsAppConfig
): NormalizedWhatsAppEvent[] {
  const envelope = objectValue(payload);
  if (!envelope || !Array.isArray(envelope["entry"])) {
    throw new DomainError(
      "whatsapp_pipeline_input_invalid",
      "The WhatsApp event envelope is invalid."
    );
  }
  const events: NormalizedWhatsAppEvent[] = [];
  for (const entryValue of envelope["entry"]) {
    const entry = objectValue(entryValue);
    if (!entry || !Array.isArray(entry["changes"])) continue;
    for (const changeValue of entry["changes"]) {
      const change = objectValue(changeValue);
      const value = objectValue(change?.["value"]);
      if (!value) continue;
      const metadata = objectValue(value["metadata"]);
      const recipientPhoneNumberId = metadata?.["phone_number_id"];
      if (typeof recipientPhoneNumberId !== "string") continue;
      if (recipientPhoneNumberId !== config.phoneNumberId) {
        throw new DomainError(
          "whatsapp_tenant_mismatch",
          "The WhatsApp event configuration does not match the receiving number."
        );
      }

      if (Array.isArray(value["messages"])) {
        for (const messageValue of value["messages"]) {
          const message = objectValue(messageValue);
          if (!message || message["type"] !== "text") continue;
          const text = objectValue(message["text"]);
          if (
            typeof message["id"] !== "string" ||
            typeof message["from"] !== "string" ||
            typeof text?.["body"] !== "string" ||
            !message["id"] ||
            !message["from"] ||
            !text["body"].trim()
          ) {
            throw new DomainError(
              "whatsapp_pipeline_input_invalid",
              "The WhatsApp text message is invalid."
            );
          }
          events.push({
            kind: "message",
            provider: "meta_whatsapp_cloud",
            organizationId: config.organizationId,
            configId: config.configId,
            phoneNumberId: config.phoneNumberId,
            businessAccountId: config.businessAccountId,
            providerMessageId: message["id"],
            senderPhone: message["from"],
            recipientPhoneNumberId,
            timestamp: normalizeProviderTimestamp(message["timestamp"]),
            messageType: "text",
            text: text["body"],
          });
        }
      }

      if (Array.isArray(value["statuses"])) {
        for (const statusValue of value["statuses"]) {
          const status = objectValue(statusValue);
          if (
            !status ||
            !["sent", "delivered", "read", "failed"].includes(String(status["status"]))
          )
            continue;
          if (typeof status["id"] !== "string" || !status["id"]) {
            throw new DomainError(
              "whatsapp_pipeline_input_invalid",
              "The WhatsApp status event is invalid."
            );
          }
          events.push({
            kind: "status",
            provider: "meta_whatsapp_cloud",
            organizationId: config.organizationId,
            configId: config.configId,
            phoneNumberId: config.phoneNumberId,
            providerMessageId: status["id"],
            status: status["status"] as WhatsAppStatusEvent["status"],
            timestamp: normalizeProviderTimestamp(status["timestamp"]),
            ...normalizeStatusError(status["errors"]),
          });
        }
      }
    }
  }
  return events;
}
