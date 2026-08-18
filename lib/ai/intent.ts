import { z } from "zod";

export const intents = [
  "book_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "query_appointment",
  "general_question",
  "greeting",
  "unknown",
] as const;

export type Intent = (typeof intents)[number];

export const intentSchema = z.enum(intents);

/** The only shape the model is permitted to return. */
export const modelIntentSchema = z
  .object({ intent: intentSchema, reason: z.string().trim().max(200).optional() })
  .strict();

export type IntentReason =
  | "classified"
  | "empty_input"
  | "input_too_long"
  | "low_signal"
  | "no_inbound_message"
  | "schema_mismatch"
  | "malformed_output"
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "provider_unauthorized"
  | "configuration_invalid";

export type IntentResult = {
  intent: Intent;
  requiresClarification: boolean;
  reason: IntentReason;
};

export const maximumMessageLength = 2000;

export function isLowSignal(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return true;
  return !/[\p{L}\p{N}]/u.test(trimmed);
}

export function unknownResult(reason: IntentReason): IntentResult {
  return { intent: "unknown", requiresClarification: true, reason };
}

export function toIntentResult(intent: Intent): IntentResult {
  return { intent, requiresClarification: intent === "unknown", reason: "classified" };
}

export function parseModelIntent(raw: string): IntentResult {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return unknownResult("malformed_output");
  }
  const parsed = modelIntentSchema.safeParse(value);
  return parsed.success ? toIntentResult(parsed.data.intent) : unknownResult("schema_mismatch");
}
