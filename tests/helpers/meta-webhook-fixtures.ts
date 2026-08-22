import { createHmac } from "node:crypto";

/**
 * Synthetic Meta WhatsApp Cloud API webhook fixtures for the test harness.
 *
 * Every value here is fabricated for tests: no real phone numbers, access
 * tokens, app secrets, verify tokens or WhatsApp Business Account IDs. Real
 * Meta inbound webhooks carry the sender as digits-only wa_id in
 * messages[].from (no "+"); the fixtures reproduce that shape faithfully.
 */
export const metaHarnessFixture = {
  /** Synthetic stand-in for a Meta phone_number_id (not a real id). */
  phoneNumberId: "test-meta-phone-number-id",
  /** Synthetic display number for the receiving business line (digits, Meta style). */
  displayPhoneNumber: "15550002222",
  /** Synthetic WhatsApp Business Account id. */
  businessAccountId: "test-waba-id",
  /** Synthetic app secret used to seed the test configuration (never a real secret). */
  appSecret: "test-only-meta-app-secret",
  /** Synthetic access token used to seed the test configuration (never a real token). */
  accessToken: "test-only-meta-access-token",
  /** Synthetic sender wa_id (Meta sends digits only, matching real webhook shape). */
  senderWaId: "15550001111",
  senderName: "Test Sender",
  /** 2030-01-01T00:00:00Z — fixed, deterministic, synthetic timestamp. */
  messageTimestamp: "1893456000",
  defaultMessageId: "wamid.TEST_MESSAGE_001",
  defaultText: "I would like to book an appointment tomorrow.",
} as const;

export type MetaTextMessageOverrides = {
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  businessAccountId?: string;
  waId?: string;
  senderName?: string;
  messageId?: string;
  timestamp?: string;
  text?: string;
};

/** A realistic Meta WhatsApp Cloud API inbound text-message webhook body. */
export function buildMetaTextWebhookPayload(
  overrides: MetaTextMessageOverrides = {}
): Record<string, unknown> {
  const phoneNumberId = overrides.phoneNumberId ?? metaHarnessFixture.phoneNumberId;
  const displayPhoneNumber = overrides.displayPhoneNumber ?? metaHarnessFixture.displayPhoneNumber;
  const businessAccountId = overrides.businessAccountId ?? metaHarnessFixture.businessAccountId;
  const waId = overrides.waId ?? metaHarnessFixture.senderWaId;
  const senderName = overrides.senderName ?? metaHarnessFixture.senderName;

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: businessAccountId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: displayPhoneNumber,
                phone_number_id: phoneNumberId,
              },
              contacts: [{ profile: { name: senderName }, wa_id: waId }],
              messages: [
                {
                  from: waId,
                  id: overrides.messageId ?? metaHarnessFixture.defaultMessageId,
                  timestamp: overrides.timestamp ?? metaHarnessFixture.messageTimestamp,
                  type: "text",
                  text: { body: overrides.text ?? metaHarnessFixture.defaultText },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/** A realistic Meta webhook body carrying a non-text (image) message. */
export function buildMetaImageWebhookPayload(
  overrides: MetaTextMessageOverrides = {}
): Record<string, unknown> {
  const waId = overrides.waId ?? metaHarnessFixture.senderWaId;
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: overrides.businessAccountId ?? metaHarnessFixture.businessAccountId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number:
                  overrides.displayPhoneNumber ?? metaHarnessFixture.displayPhoneNumber,
                phone_number_id: overrides.phoneNumberId ?? metaHarnessFixture.phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: overrides.senderName ?? metaHarnessFixture.senderName },
                  wa_id: waId,
                },
              ],
              messages: [
                {
                  from: waId,
                  id: overrides.messageId ?? "wamid.TEST_IMAGE_001",
                  timestamp: overrides.timestamp ?? metaHarnessFixture.messageTimestamp,
                  type: "image",
                  image: {
                    id: "test-media-id",
                    mime_type: "image/jpeg",
                    sha256: "test-sha256",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/**
 * Computes the x-hub-signature-256 header value exactly as Meta would for the
 * given raw body and app secret. Test-only convenience so tests can hand the
 * harness a genuinely verifiable signature when exercising the route level.
 */
export function signMetaPayload(rawBody: string | Uint8Array, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}
