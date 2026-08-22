import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildMetaImageWebhookPayload,
  buildMetaTextWebhookPayload,
  metaHarnessFixture,
  signMetaPayload,
} from "../helpers/meta-webhook-fixtures";

const harness = vi.hoisted(() => ({
  calls: [] as unknown[],
  failure: null as { kind: "domain"; code: string; message: string } | { kind: "unknown" } | null,
}));

const simulatedResult = {
  simulatedProvider: "meta_test_capture",
  signatureVerified: true,
  events: { messageEvents: 1, statusEvents: 0, statusEventsApplied: 0 },
  messages: [
    {
      inbound: {
        senderPhone: metaHarnessFixture.senderWaId,
        text: metaHarnessFixture.defaultText,
        providerMessageId: metaHarnessFixture.defaultMessageId,
      },
      processed: {
        organizationId: "org-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        inboundMessageId: "message-1",
        duplicate: false,
      },
      ai: { replied: true, replyText: "Simulated reply.", fallbackUsed: false, reason: null },
      outbound: {
        simulatedProvider: "meta_test_capture",
        recipient: metaHarnessFixture.senderWaId,
        capturedText: "Simulated reply.",
        providerMessageId: "wamid.SIMULATED_00000000-0000-0000-0000-000000000000",
        recordedMessageId: "outbound-1",
      },
      scheduling: { mutationExecutionSupported: false, upcomingAppointmentsForContact: 0 },
      receptionistContext: { hasInstructions: false, hasFaq: false },
    },
  ],
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/whatsapp/test-harness", () => ({
  runMetaWebhookSimulation: vi.fn(async (payload: unknown) => {
    harness.calls.push(payload);
    if (harness.failure?.kind === "domain") {
      const { DomainError } = await import("@/lib/domain/errors");
      throw new DomainError(harness.failure.code as never, harness.failure.message);
    }
    if (harness.failure?.kind === "unknown") {
      throw new Error("internal-implementation-detail-that-must-not-leak");
    }
    return simulatedResult;
  }),
}));

function postPayload(body: unknown): Request {
  return new Request("http://localhost/api/test/whatsapp/meta-harness", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function importRoute(): Promise<typeof import("@/app/api/test/whatsapp/meta-harness/route")> {
  return import("@/app/api/test/whatsapp/meta-harness/route");
}

const testSupabaseUrl = "https://test-project.supabase.co";

function stubEnabledHarnessEnv(): void {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("WHATSAPP_TEST_HARNESS_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", testSupabaseUrl);
  vi.stubEnv("SUPABASE_TEST_URL", testSupabaseUrl);
}

describe("Meta test harness route availability", () => {
  beforeEach(() => {
    harness.calls = [];
    harness.failure = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 404 in production even when the flag is set and the test project matches", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WHATSAPP_TEST_HARNESS_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", testSupabaseUrl);
    vi.stubEnv("SUPABASE_TEST_URL", testSupabaseUrl);
    const { POST } = await importRoute();
    const response = await POST(postPayload(buildMetaTextWebhookPayload()));

    expect(response.status).toBe(404);
    expect(harness.calls).toHaveLength(0);
  });

  it.each([undefined, "false", "1", "yes"])(
    "returns 404 outside production when WHATSAPP_TEST_HARNESS_ENABLED is %s",
    async (value) => {
      vi.stubEnv("NODE_ENV", "development");
      if (value === undefined) vi.stubEnv("WHATSAPP_TEST_HARNESS_ENABLED", "");
      else vi.stubEnv("WHATSAPP_TEST_HARNESS_ENABLED", value);
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", testSupabaseUrl);
      vi.stubEnv("SUPABASE_TEST_URL", testSupabaseUrl);
      const { POST } = await importRoute();
      const response = await POST(postPayload(buildMetaTextWebhookPayload()));

      expect(response.status).toBe(404);
      expect(harness.calls).toHaveLength(0);
    }
  );

  it("returns 404 when the app Supabase target is not the dedicated test project", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("WHATSAPP_TEST_HARNESS_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://production-like.supabase.co");
    vi.stubEnv("SUPABASE_TEST_URL", testSupabaseUrl);
    const { POST } = await importRoute();
    const response = await POST(postPayload(buildMetaTextWebhookPayload()));

    expect(response.status).toBe(404);
    expect(harness.calls).toHaveLength(0);
  });

  it("returns 404 when no dedicated test project is configured at all", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("WHATSAPP_TEST_HARNESS_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dev-project.supabase.co");
    vi.stubEnv("SUPABASE_TEST_URL", "");
    const { POST } = await importRoute();
    const response = await POST(postPayload(buildMetaTextWebhookPayload()));

    expect(response.status).toBe(404);
    expect(harness.calls).toHaveLength(0);
  });

  it("runs the simulation and returns the structured result when enabled outside production", async () => {
    stubEnabledHarnessEnv();
    const payload = buildMetaTextWebhookPayload();
    const { POST } = await importRoute();
    const response = await POST(postPayload(payload));

    expect(response.status).toBe(200);
    expect(harness.calls).toEqual([payload]);
    const body = await response.json();
    expect(body).toMatchObject({
      simulatedProvider: "meta_test_capture",
      signatureVerified: true,
      events: { messageEvents: 1 },
    });
    expect(body.messages[0].outbound.providerMessageId).toContain("wamid.SIMULATED_");
    expect(JSON.stringify(body)).not.toContain(metaHarnessFixture.appSecret);
    expect(JSON.stringify(body)).not.toContain(metaHarnessFixture.accessToken);
  });

  it("rejects a non-JSON body with 400 and never touches the simulation", async () => {
    stubEnabledHarnessEnv();
    const { POST } = await importRoute();
    const response = await POST(postPayload("not-json{{{"));

    expect(response.status).toBe(400);
    expect(harness.calls).toHaveLength(0);
  });

  it.each([
    { code: "whatsapp_payload_invalid", status: 400 },
    { code: "whatsapp_pipeline_input_invalid", status: 400 },
    { code: "whatsapp_configuration_unavailable", status: 422 },
    { code: "whatsapp_pipeline_persistence_failed", status: 500 },
  ])("maps domain error $code to $status with a safe message", async ({ code, status }) => {
    stubEnabledHarnessEnv();
    harness.failure = { kind: "domain", code, message: `Fixed domain message for ${code}.` };
    const { POST } = await importRoute();
    const response = await POST(postPayload(buildMetaTextWebhookPayload()));

    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toMatchObject({ code, error: `Fixed domain message for ${code}.` });
  });

  it("never leaks internal error details for unexpected failures", async () => {
    stubEnabledHarnessEnv();
    harness.failure = { kind: "unknown" };
    const { POST } = await importRoute();
    const response = await POST(postPayload(buildMetaTextWebhookPayload()));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("internal-implementation-detail-that-must-not-leak");
  });
});

describe("Meta webhook fixtures", () => {
  it("builds a realistic Cloud API text webhook shape", () => {
    const payload = buildMetaTextWebhookPayload() as {
      object: string;
      entry: Array<{
        id: string;
        changes: Array<{
          field: string;
          value: {
            messaging_product: string;
            metadata: { display_phone_number: string; phone_number_id: string };
            contacts: Array<{ profile: { name: string }; wa_id: string }>;
            messages: Array<{
              from: string;
              id: string;
              timestamp: string;
              type: string;
              text: { body: string };
            }>;
          };
        }>;
      }>;
    };

    expect(payload.object).toBe("whatsapp_business_account");
    const entry = payload.entry[0];
    if (!entry) throw new Error("fixture entry missing");
    const change = entry.changes[0];
    if (!change) throw new Error("fixture change missing");
    const value = change.value;
    expect(entry.id).toBe(metaHarnessFixture.businessAccountId);
    expect(value.messaging_product).toBe("whatsapp");
    expect(value.metadata.phone_number_id).toBe(metaHarnessFixture.phoneNumberId);
    expect(value.contacts[0]).toEqual({
      profile: { name: metaHarnessFixture.senderName },
      wa_id: metaHarnessFixture.senderWaId,
    });
    expect(value.messages[0]).toEqual({
      from: metaHarnessFixture.senderWaId,
      id: metaHarnessFixture.defaultMessageId,
      timestamp: metaHarnessFixture.messageTimestamp,
      type: "text",
      text: { body: metaHarnessFixture.defaultText },
    });
  });

  it("builds a non-text payload with the same envelope", () => {
    const payload = buildMetaImageWebhookPayload() as {
      entry: Array<{ changes: Array<{ value: { messages: Array<{ type: string }> } }> }>;
    };
    const message = payload.entry[0]?.changes[0]?.value.messages[0];
    if (!message) throw new Error("fixture message missing");
    expect(message.type).toBe("image");
  });

  it("contains only synthetic values — no real credentials or user phone numbers", () => {
    const source = readFileSync(
      resolve(process.cwd(), "tests/helpers/meta-webhook-fixtures.ts"),
      "utf8"
    );
    const payloadJson = JSON.stringify(buildMetaTextWebhookPayload());

    // Real Meta access tokens start with "EAA"; real app secrets are bare hex.
    expect(source).not.toMatch(/EAA[A-Za-z0-9]/);
    expect(payloadJson).not.toMatch(/EAA[A-Za-z0-9]/);
    // Every sensitive fixture value is explicitly marked synthetic.
    for (const value of [
      metaHarnessFixture.phoneNumberId,
      metaHarnessFixture.businessAccountId,
      metaHarnessFixture.appSecret,
      metaHarnessFixture.accessToken,
    ]) {
      expect(value).toContain("test");
    }
    // Sender/recipient numbers are the documented synthetic 1555 range only.
    expect(metaHarnessFixture.senderWaId).toBe("15550001111");
    expect(metaHarnessFixture.displayPhoneNumber).toBe("15550002222");
  });

  it("signs payloads with a verifiable x-hub-signature-256 value", () => {
    const rawBody = JSON.stringify(buildMetaTextWebhookPayload());
    expect(signMetaPayload(rawBody, metaHarnessFixture.appSecret)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});
