import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeTwilioSignature } from "@/lib/whatsapp/twilio";

const authToken = "fake-twilio-auth-token";

const config = vi.hoisted(() => ({
  value: null as {
    configId: string;
    organizationId: string;
    provider: "twilio_whatsapp_sandbox";
    phoneNumberId: string;
    businessAccountId: string;
    displayPhoneNumber: string | null;
    accessToken: string;
    appSecret: string | null;
    verifyToken: string | null;
  } | null,
}));
const pipeline = vi.hoisted(() => ({
  calls: [] as unknown[],
  duplicate: false,
  throwCode: null as string | null,
}));
const orchestration = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/whatsapp/configuration", () => ({
  twilioWhatsAppSandboxProvider: "twilio_whatsapp_sandbox",
  resolveWhatsAppConfigByPhoneNumberId: vi.fn(async () => config.value),
}));
vi.mock("@/lib/whatsapp/pipeline", () => ({
  processInboundWhatsAppMessage: vi.fn(async (event: unknown) => {
    pipeline.calls.push(event);
    if (pipeline.throwCode) {
      const { DomainError } = await import("@/lib/domain/errors");
      throw new DomainError(pipeline.throwCode as never, "failure");
    }
    return {
      organizationId: "organization-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      messageId: "message-1",
      providerMessageId: "SM123",
      duplicate: pipeline.duplicate,
    };
  }),
}));
vi.mock("@/lib/whatsapp/receptionist-orchestration", () => ({
  runReceptionistOrchestration: vi.fn(async (input: unknown) => {
    orchestration.calls.push(input);
    return { replied: true, providerMessageId: "SM-reply-1" };
  }),
}));
vi.mock("@/lib/whatsapp/twilio-outbound", () => ({
  sendTwilioSandboxText: vi.fn(async () => ({
    provider: "twilio_whatsapp_sandbox",
    providerMessageId: "SM-reply-1",
    recipient: "+14155550123",
  })),
}));
vi.mock("@/lib/domain/messages/service-repository", () => ({
  recordOutboundTwilioReply: vi.fn(async () => ({ messageId: "outbound-message-1" })),
}));

const validParams = {
  MessageSid: "SM123",
  From: "whatsapp:+14155550123",
  To: "whatsapp:+14155238886",
  Body: "Hello",
};

function requestFor(
  params: Record<string, string>,
  webhookUrl: string,
  signature?: string
): Request {
  const body = new URLSearchParams(params).toString();
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (signature) headers["x-twilio-signature"] = signature;
  return new Request(webhookUrl, { method: "POST", body, headers });
}

const webhookUrl = "https://example.vercel.app/api/whatsapp/twilio/webhook";

describe("Twilio WhatsApp sandbox webhook route", () => {
  beforeEach(() => {
    pipeline.calls = [];
    pipeline.duplicate = false;
    pipeline.throwCode = null;
    orchestration.calls = [];
    config.value = {
      configId: "config-1",
      organizationId: "organization-1",
      provider: "twilio_whatsapp_sandbox",
      phoneNumberId: "+14155238886",
      businessAccountId: "ACfaketestaccountsid",
      displayPhoneNumber: null,
      accessToken: authToken,
      appSecret: null,
      verifyToken: null,
    };
  });

  it("accepts a validly signed fresh message, persists it, and runs the reply orchestration", async () => {
    const { POST } = await import("@/app/api/whatsapp/twilio/webhook/route");
    const signature = computeTwilioSignature(webhookUrl, validParams, authToken);
    const response = await POST(requestFor(validParams, webhookUrl, signature));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("<Response>");
    expect(pipeline.calls).toHaveLength(1);
    expect(orchestration.calls).toHaveLength(1);
    expect(orchestration.calls[0]).toMatchObject({
      organizationId: "organization-1",
      conversationId: "conversation-1",
    });
    expect(body).not.toContain(authToken);
  });

  it("rejects an invalid signature, persisting nothing and never invoking orchestration", async () => {
    const { POST } = await import("@/app/api/whatsapp/twilio/webhook/route");
    const response = await POST(requestFor(validParams, webhookUrl, "sha1-bad-signature"));

    expect(response.status).toBe(403);
    expect(pipeline.calls).toHaveLength(0);
    expect(orchestration.calls).toHaveLength(0);
    expect(await response.text()).not.toContain(authToken);
  });

  it("rejects a request with no signature header at all", async () => {
    const { POST } = await import("@/app/api/whatsapp/twilio/webhook/route");
    const response = await POST(requestFor(validParams, webhookUrl));
    expect(response.status).toBe(403);
    expect(pipeline.calls).toHaveLength(0);
  });

  it("returns the same generic failure for an unrecognized destination, performing no persistence", async () => {
    config.value = null;
    const { POST } = await import("@/app/api/whatsapp/twilio/webhook/route");
    const signature = computeTwilioSignature(webhookUrl, validParams, authToken);
    const response = await POST(requestFor(validParams, webhookUrl, signature));

    expect(response.status).toBe(403);
    expect(pipeline.calls).toHaveLength(0);
    expect(orchestration.calls).toHaveLength(0);
  });

  it.each([
    { ...validParams, MessageSid: "" },
    { ...validParams, Body: "" },
    { ...validParams, From: "not-a-number" },
  ])("rejects a malformed payload %o without persisting", async (malformedParams) => {
    const { POST } = await import("@/app/api/whatsapp/twilio/webhook/route");
    const signature = computeTwilioSignature(webhookUrl, malformedParams, authToken);
    const response = await POST(requestFor(malformedParams, webhookUrl, signature));

    expect(response.status).toBe(400);
    expect(pipeline.calls).toHaveLength(0);
  });

  it("acknowledges a duplicate MessageSid without invoking the AI/outbound orchestration again", async () => {
    pipeline.duplicate = true;
    const { POST } = await import("@/app/api/whatsapp/twilio/webhook/route");
    const signature = computeTwilioSignature(webhookUrl, validParams, authToken);
    const response = await POST(requestFor(validParams, webhookUrl, signature));

    expect(response.status).toBe(200);
    expect(pipeline.calls).toHaveLength(1);
    expect(orchestration.calls).toHaveLength(0);
  });

  it("still acknowledges Twilio (no retry) when persistence succeeds but orchestration fails", async () => {
    const { runReceptionistOrchestration } = await import("@/lib/whatsapp/receptionist-orchestration");
    vi.mocked(runReceptionistOrchestration).mockRejectedValueOnce(new Error("ai down"));
    const { POST } = await import("@/app/api/whatsapp/twilio/webhook/route");
    const signature = computeTwilioSignature(webhookUrl, validParams, authToken);
    const response = await POST(requestFor(validParams, webhookUrl, signature));

    expect(response.status).toBe(200);
    expect(pipeline.calls).toHaveLength(1);
  });

  it("returns 500 for a non-duplicate pipeline persistence failure", async () => {
    pipeline.throwCode = "whatsapp_pipeline_persistence_failed";
    const { POST } = await import("@/app/api/whatsapp/twilio/webhook/route");
    const signature = computeTwilioSignature(webhookUrl, validParams, authToken);
    const response = await POST(requestFor(validParams, webhookUrl, signature));
    expect(response.status).toBe(500);
  });
});

describe("Meta webhook regression", () => {
  it("the Meta webhook route is not modified to reference Twilio or the new orchestration helper", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/api/whatsapp/webhook/route.ts"),
      "utf8"
    );
    expect(source).not.toContain("twilio");
    expect(source).not.toContain("Twilio");
    expect(source).not.toContain("receptionist-orchestration");
  });
});
