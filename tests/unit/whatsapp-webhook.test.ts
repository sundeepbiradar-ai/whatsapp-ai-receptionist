import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/domain/errors";
import {
  extractPhoneNumberId,
  normalizeMetaWebhookEvents,
  parseWebhookJson,
  verifyMetaWebhookSignature,
  verifyWebhookToken,
} from "@/lib/whatsapp/meta";

const config = vi.hoisted(() => ({
  byPhone: null as {
    configId: string;
    organizationId: string;
    provider: "meta_whatsapp_cloud";
    phoneNumberId: string;
    businessAccountId: string;
    displayPhoneNumber: string | null;
    accessToken: string;
    appSecret: string | null;
    verifyToken: string | null;
  } | null,
  byToken: null as {
    configId: string;
    organizationId: string;
    provider: "meta_whatsapp_cloud";
    phoneNumberId: string;
    businessAccountId: string;
    displayPhoneNumber: string | null;
  } | null,
}));
const pipeline = vi.hoisted(() => ({ calls: [] as unknown[], duplicate: false }));
const orchestration = vi.hoisted(() => ({ calls: [] as unknown[] }));
const outbound = vi.hoisted(() => ({ calls: [] as unknown[] }));
const recordedOutbound = vi.hoisted(() => ({ calls: [] as unknown[] }));
const reliability = vi.hoisted(() => ({
  calls: [] as unknown[],
  outcome: "applied" as string,
  failure: null as { code: string; message: string } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/whatsapp/configuration", () => ({
  resolveWhatsAppConfigByPhoneNumberId: vi.fn(async (phoneNumberId: string) =>
    phoneNumberId === "phone-1" ? config.byPhone : null
  ),
  resolveWhatsAppConfigByVerifyToken: vi.fn(async (verifyToken: string) =>
    verifyToken === "verify-1" ? config.byToken : null
  ),
}));
vi.mock("@/lib/whatsapp/pipeline", () => ({
  processInboundWhatsAppMessage: vi.fn(async (event: unknown) => {
    pipeline.calls.push(event);
    return {
      organizationId: "organization-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      messageId: "message-1",
      providerMessageId: "wamid-route-1",
      duplicate: pipeline.duplicate,
    };
  }),
}));
vi.mock("@/lib/whatsapp/receptionist-orchestration", () => ({
  runReceptionistOrchestration: vi.fn(async (input: {
    sendReply: (text: string) => Promise<{ providerMessageId: string }>;
    recordReply: (input: { text: string; providerMessageId: string }) => Promise<void>;
  }) => {
    orchestration.calls.push(input);
    const sent = await input.sendReply("Hello from the receptionist");
    await input.recordReply({ text: "Hello from the receptionist", providerMessageId: sent.providerMessageId });
    return { replied: true, providerMessageId: sent.providerMessageId };
  }),
}));
vi.mock("@/lib/whatsapp/outbound", () => ({
  sendWhatsAppText: vi.fn(async (input: unknown) => {
    outbound.calls.push(input);
    return {
      provider: "meta_whatsapp_cloud",
      providerMessageId: "wamid.reply-1",
      recipient: "+14155550123",
    };
  }),
}));
vi.mock("@/lib/domain/messages/service-repository", () => ({
  recordOutboundMetaReply: vi.fn(async (input: unknown) => {
    recordedOutbound.calls.push(input);
    return { messageId: "outbound-message-1" };
  }),
}));
vi.mock("@/lib/whatsapp/reliability", () => ({
  applyWhatsAppStatusEvent: vi.fn(async (event: unknown) => {
    reliability.calls.push(event);
    if (reliability.failure)
      throw new DomainError(
        reliability.failure.code as never,
        reliability.failure.message
      );
    return { outcome: reliability.outcome };
  }),
}));

const validPayload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ value: { metadata: { phone_number_id: "phone-1" } } }] }],
});
const textPayload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "phone-1" },
            messages: [
              {
                id: "wamid-route-1",
                from: "+14155550123",
                timestamp: "1735689600",
                type: "text",
                text: { body: "Hello" },
              },
            ],
          },
        },
      ],
    },
  ],
});

function request(method: "GET" | "POST", body?: string, headers?: Record<string, string>): Request {
  return new Request(
    `http://localhost/api/whatsapp/webhook${method === "GET" ? "?hub.mode=subscribe&hub.verify_token=verify-1&hub.challenge=challenge-1" : ""}`,
    {
      method,
      body,
      headers,
    }
  );
}

function signedBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("WhatsApp webhook security helpers", () => {
  beforeEach(() => {
    config.byPhone = {
      configId: "config-1",
      organizationId: "organization-1",
      provider: "meta_whatsapp_cloud",
      phoneNumberId: "phone-1",
      businessAccountId: "business-1",
      displayPhoneNumber: null,
      accessToken: "fake-access-token",
      appSecret: "fake-app-secret",
      verifyToken: "fake-verify-token",
    };
    config.byToken = {
      configId: "config-1",
      organizationId: "organization-1",
      provider: "meta_whatsapp_cloud",
      phoneNumberId: "phone-1",
      businessAccountId: "business-1",
      displayPhoneNumber: null,
    };
  });

  it("verifies matching tokens and rejects missing or different values", () => {
    expect(verifyWebhookToken("token", "token")).toBe(true);
    expect(verifyWebhookToken("token", "other")).toBe(false);
    expect(verifyWebhookToken(null, "token")).toBe(false);
  });

  it("accepts valid HMAC signatures and rejects missing, malformed, wrong, or modified signatures", () => {
    const signature = signedBody(validPayload, "fake-app-secret");
    expect(
      verifyMetaWebhookSignature(
        new TextEncoder().encode(validPayload),
        signature,
        "fake-app-secret"
      )
    ).toBe(true);
    expect(
      verifyMetaWebhookSignature(new TextEncoder().encode(validPayload), null, "fake-app-secret")
    ).toBe(false);
    expect(
      verifyMetaWebhookSignature(
        new TextEncoder().encode(validPayload),
        "sha1=bad",
        "fake-app-secret"
      )
    ).toBe(false);
    expect(
      verifyMetaWebhookSignature(new TextEncoder().encode(validPayload), signature, "wrong-secret")
    ).toBe(false);
    expect(
      verifyMetaWebhookSignature(
        new TextEncoder().encode(`${validPayload}changed`),
        signature,
        "fake-app-secret"
      )
    ).toBe(false);
  });

  it("extracts only the receiving phone-number routing hint", () => {
    expect(extractPhoneNumberId(JSON.parse(validPayload))).toBe("phone-1");
    expect(extractPhoneNumberId({ object: "irrelevant" })).toBeNull();
  });

  it("normalizes text, status, and multiple provider events in order", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone-1" },
                messages: [
                  {
                    id: "wamid.text-1",
                    from: "+14155550123",
                    timestamp: "1735689600",
                    type: "text",
                    text: { body: "Hello" },
                  },
                ],
                statuses: [{ id: "wamid.status-1", status: "delivered", timestamp: "1735689601" }],
              },
            },
          ],
        },
      ],
    };
    const events = normalizeMetaWebhookEvents(payload, config.byPhone!);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: "message",
      providerMessageId: "wamid.text-1",
      organizationId: "organization-1",
      text: "Hello",
    });
    expect(events[1]).toMatchObject({
      kind: "status",
      providerMessageId: "wamid.status-1",
      status: "delivered",
    });
    expect(JSON.stringify(events)).not.toContain("fake-access-token");
  });

  it("ignores unsupported messages and rejects mismatched routing metadata", () => {
    const unsupported = normalizeMetaWebhookEvents(
      {
        entry: [
          {
            changes: [
              {
                value: { metadata: { phone_number_id: "phone-1" }, messages: [{ type: "image" }] },
              },
            ],
          },
        ],
      },
      config.byPhone!
    );
    expect(unsupported).toEqual([]);
    expect(() =>
      normalizeMetaWebhookEvents(
        {
          entry: [{ changes: [{ value: { metadata: { phone_number_id: "other-phone" } } }] }],
        },
        config.byPhone!
      )
    ).toThrowError(expect.objectContaining({ code: "whatsapp_tenant_mismatch" }));
  });

  it("rejects malformed JSON with a stable domain error", () => {
    expect(() => parseWebhookJson(new TextEncoder().encode("not-json"))).toThrowError(
      expect.objectContaining<Partial<DomainError>>({ code: "whatsapp_payload_invalid" })
    );
  });

  it("normalizes provider failure metadata on failed status events", () => {
    const events = normalizeMetaWebhookEvents(
      {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "phone-1" },
                  statuses: [
                    {
                      id: "wamid.status-failed",
                      status: "failed",
                      timestamp: "1735689601",
                      errors: [
                        {
                          code: 131047,
                          title: "Re-engagement message",
                          error_data: { details: "Message failed to send." },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      config.byPhone!
    );
    expect(events[0]).toMatchObject({
      kind: "status",
      status: "failed",
      errorCode: "131047",
      errorMessage: "Re-engagement message",
    });
  });

  it("leaves failure metadata null for non-failure statuses and unknown shapes", () => {
    const events = normalizeMetaWebhookEvents(
      {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "phone-1" },
                  statuses: [
                    { id: "wamid.status-read", status: "read", timestamp: "1735689601" },
                    {
                      id: "wamid.status-unknown",
                      status: "warning",
                      timestamp: "1735689602",
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      config.byPhone!
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      providerMessageId: "wamid.status-read",
      errorCode: null,
      errorMessage: null,
    });
  });
});

describe("WhatsApp webhook route", () => {
  beforeEach(() => {
    pipeline.calls = [];
    pipeline.duplicate = false;
    orchestration.calls = [];
    outbound.calls = [];
    recordedOutbound.calls = [];
    config.byPhone = {
      configId: "config-1",
      organizationId: "organization-1",
      provider: "meta_whatsapp_cloud",
      phoneNumberId: "phone-1",
      businessAccountId: "business-1",
      displayPhoneNumber: null,
      accessToken: "fake-access-token",
      appSecret: "fake-app-secret",
      verifyToken: "fake-verify-token",
    };
    config.byToken = {
      configId: "config-1",
      organizationId: "organization-1",
      provider: "meta_whatsapp_cloud",
      phoneNumberId: "phone-1",
      businessAccountId: "business-1",
      displayPhoneNumber: null,
    };
  });

  it("acknowledges a fresh inbound message without waiting for AI or provider delivery", async () => {
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const response = await POST(
      request(
        "POST",
        textPayload,
        { "content-type": "application/json", "x-hub-signature-256": signedBody(textPayload, "fake-app-secret") }
      )
    );

    expect(response.status).toBe(200);
    expect(pipeline.calls).toHaveLength(1);
    expect(orchestration.calls).toHaveLength(0);
    expect(outbound.calls).toHaveLength(0);
    expect(recordedOutbound.calls).toHaveLength(0);
  });

  it("returns the exact challenge for valid subscription verification", async () => {
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("challenge-1");
  });

  it.each([
    "?hub.mode=unsubscribe&hub.verify_token=verify-1&hub.challenge=challenge-1",
    "?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-1",
    "?hub.mode=subscribe&hub.verify_token=verify-1",
  ])("rejects invalid verification query %s", async (query) => {
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const response = await GET(new Request(`http://localhost/api/whatsapp/webhook${query}`));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.text()).not.toContain("verify-1");
  });

  it("acknowledges a valid signed request without persisting messages", async () => {
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const response = await POST(
      request("POST", validPayload, {
        "x-hub-signature-256": signedBody(validPayload, "fake-app-secret"),
        "content-type": "application/json",
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it("passes verified inbound text events to the pipeline and returns only an acknowledgement", async () => {
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const response = await POST(
      request("POST", textPayload, {
        "x-hub-signature-256": signedBody(textPayload, "fake-app-secret"),
        "content-type": "application/json",
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(pipeline.calls).toHaveLength(1);
    expect(JSON.stringify(pipeline.calls[0])).not.toContain("fake-access-token");
  });

  it.each([undefined, "sha1=bad", signedBody(validPayload, "wrong-secret")])(
    "rejects invalid signature %s",
    async (signature) => {
      const { POST } = await import("@/app/api/whatsapp/webhook/route");
      const headers = signature ? { "x-hub-signature-256": signature } : undefined;
      const response = await POST(request("POST", validPayload, headers));
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain("fake-app-secret");
    }
  );

  it("rejects unknown, inactive, and malformed events without processing them", async () => {
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    config.byPhone = null;
    const unknown = await POST(
      request("POST", validPayload, {
        "x-hub-signature-256": signedBody(validPayload, "fake-app-secret"),
      })
    );
    expect(unknown.status).toBe(403);

    const malformed = await POST(
      request("POST", "not-json", {
        "x-hub-signature-256": signedBody("not-json", "fake-app-secret"),
      })
    );
    expect(malformed.status).toBe(400);
  });
});

const statusPayload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "phone-1" },
            statuses: [
              {
                id: "wamid-status-1",
                status: "delivered",
                timestamp: "1735689600",
                recipient_id: "14155550123",
              },
            ],
          },
        },
      ],
    },
  ],
});

const unsupportedPayload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "phone-1" },
            messages: [
              { id: "wamid-image-1", from: "+14155550123", timestamp: "1735689600", type: "image" },
            ],
          },
        },
      ],
    },
  ],
});

describe("WhatsApp webhook reliability acknowledgement", () => {
  beforeEach(() => {
    pipeline.calls = [];
    reliability.calls = [];
    reliability.outcome = "applied";
    reliability.failure = null;
    config.byPhone = {
      configId: "config-1",
      organizationId: "organization-1",
      provider: "meta_whatsapp_cloud",
      phoneNumberId: "phone-1",
      businessAccountId: "business-1",
      displayPhoneNumber: null,
      accessToken: "fake-access-token",
      appSecret: "fake-app-secret",
      verifyToken: "fake-verify-token",
    };
  });

  async function post(body: string, secret = "fake-app-secret"): Promise<Response> {
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    return POST(
      request("POST", body, {
        "x-hub-signature-256": signedBody(body, secret),
        "content-type": "application/json",
      })
    );
  }

  it("routes a valid status event to the reliability handler", async () => {
    const response = await post(statusPayload);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(reliability.calls).toHaveLength(1);
    expect(reliability.calls[0]).toMatchObject({
      kind: "status",
      organizationId: "organization-1",
      configId: "config-1",
      providerMessageId: "wamid-status-1",
      status: "delivered",
    });
  });

  it("never creates an inbound text message from a status event", async () => {
    await post(statusPayload);
    expect(pipeline.calls).toHaveLength(0);
  });

  it("acknowledges duplicate and stale status deliveries exactly once", async () => {
    for (const outcome of ["applied", "ignored_duplicate", "ignored_stale", "unknown_message"]) {
      reliability.outcome = outcome;
      const response = await post(statusPayload);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
    }
    expect(reliability.calls).toHaveLength(4);
  });

  it("does not acknowledge when status persistence fails", async () => {
    reliability.failure = {
      code: "whatsapp_status_persistence_failed",
      message: "The WhatsApp delivery status could not be persisted.",
    };
    const response = await post(statusPayload);
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("fake-app-secret");
    expect(body).not.toContain("fake-access-token");
  });

  it("does not reach the reliability handler on an invalid signature", async () => {
    const response = await post(statusPayload, "wrong-secret");
    expect(response.status).toBe(403);
    expect(reliability.calls).toHaveLength(0);
    expect(pipeline.calls).toHaveLength(0);
  });

  it("ignores unsupported message types without side effects", async () => {
    const response = await post(unsupportedPayload);
    expect(response.status).toBe(200);
    expect(pipeline.calls).toHaveLength(0);
    expect(reliability.calls).toHaveLength(0);
  });
});
