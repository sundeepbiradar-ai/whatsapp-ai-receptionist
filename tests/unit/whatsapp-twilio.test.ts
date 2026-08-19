import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  computeTwilioSignature,
  extractTwilioDestination,
  normalizeTwilioInboundMessage,
  parseTwilioFormBody,
  resolveExternalWebhookUrl,
  verifyTwilioSignature,
} from "@/lib/whatsapp/twilio";

const authToken = "fake-twilio-auth-token";
const url = "https://example.vercel.app/api/whatsapp/twilio/webhook";
const params = {
  MessageSid: "SM123",
  From: "whatsapp:+14155550123",
  To: "whatsapp:+14155238886",
  Body: "Hello",
};

function twilioReferenceSignature(targetUrl: string, targetParams: Record<string, string>): string {
  let data = targetUrl;
  for (const key of Object.keys(targetParams).sort()) data += key + targetParams[key];
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

describe("computeTwilioSignature / verifyTwilioSignature", () => {
  it("matches Twilio's documented sorted-param HMAC-SHA1 algorithm", () => {
    expect(computeTwilioSignature(url, params, authToken)).toBe(
      twilioReferenceSignature(url, params)
    );
  });

  it("accepts a valid signature and rejects missing, wrong, or tampered ones", () => {
    const signature = computeTwilioSignature(url, params, authToken);
    expect(verifyTwilioSignature(url, params, signature, authToken)).toBe(true);
    expect(verifyTwilioSignature(url, params, null, authToken)).toBe(false);
    expect(verifyTwilioSignature(url, params, signature, null)).toBe(false);
    expect(verifyTwilioSignature(url, params, signature, "wrong-token")).toBe(false);
    expect(verifyTwilioSignature(url, { ...params, Body: "changed" }, signature, authToken)).toBe(
      false
    );
    expect(verifyTwilioSignature(`${url}/other`, params, signature, authToken)).toBe(false);
  });
});

describe("resolveExternalWebhookUrl", () => {
  it("prefers Vercel forwarded proto/host over the internal request URL", () => {
    const request = new Request("http://127.0.0.1:3000/api/whatsapp/twilio/webhook", {
      method: "POST",
      headers: { "x-forwarded-proto": "https", "x-forwarded-host": "example.vercel.app" },
    });
    expect(resolveExternalWebhookUrl(request)).toBe(
      "https://example.vercel.app/api/whatsapp/twilio/webhook"
    );
  });

  it("falls back to the request URL when no forwarded headers are present", () => {
    const request = new Request("https://localhost/api/whatsapp/twilio/webhook");
    expect(resolveExternalWebhookUrl(request)).toBe(
      "https://localhost/api/whatsapp/twilio/webhook"
    );
  });
});

describe("parseTwilioFormBody / extractTwilioDestination", () => {
  it("parses a application/x-www-form-urlencoded body", () => {
    const body = new URLSearchParams(params).toString();
    expect(parseTwilioFormBody(body)).toEqual(params);
  });

  it("normalizes a whatsapp: destination to E.164 and rejects invalid ones", () => {
    expect(extractTwilioDestination(params)).toBe("+14155238886");
    expect(extractTwilioDestination({ To: "not-a-number" })).toBeNull();
    expect(extractTwilioDestination({})).toBeNull();
  });
});

describe("normalizeTwilioInboundMessage", () => {
  const resolvedConfig = {
    configId: "config-1",
    organizationId: "organization-1",
    phoneNumberId: "+14155238886",
    businessAccountId: "ACfaketestaccountsid",
  };

  it("normalizes a valid payload into the shared inbound-message shape", () => {
    const event = normalizeTwilioInboundMessage(params, resolvedConfig);
    expect(event).toMatchObject({
      kind: "message",
      provider: "twilio_whatsapp_sandbox",
      organizationId: "organization-1",
      configId: "config-1",
      phoneNumberId: "+14155238886",
      providerMessageId: "SM123",
      senderPhone: "+14155550123",
      recipientPhoneNumberId: "+14155238886",
      messageType: "text",
      text: "Hello",
    });
  });

  it.each([
    { ...params, MessageSid: "" },
    { ...params, From: "not-a-number" },
    { ...params, Body: "" },
    { ...params, To: "whatsapp:+19998887777" },
  ])("rejects a malformed or mismatched-destination payload %o", (malformed) => {
    expect(() => normalizeTwilioInboundMessage(malformed, resolvedConfig)).toThrowError(
      expect.objectContaining({ code: "whatsapp_pipeline_input_invalid" })
    );
  });

  it("never leaks the destination phone number id or auth token via error output", () => {
    try {
      normalizeTwilioInboundMessage({ ...params, Body: "" }, resolvedConfig);
    } catch (error) {
      expect((error as Error).message).not.toContain(resolvedConfig.phoneNumberId);
    }
  });
});
