/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";
import { createTestVaultSecret, deleteTestVaultSecrets } from "../helpers/test-database";
import {
  buildMetaImageWebhookPayload,
  buildMetaTextWebhookPayload,
  metaHarnessFixture,
} from "../helpers/meta-webhook-fixtures";
import {
  runMetaWebhookSimulation,
  simulatedMetaProvider,
  simulatedProviderMessageIdPrefix,
} from "@/lib/whatsapp/test-harness";
import { safeFallbackReply } from "@/lib/ai/receptionist-reply";

vi.mock("server-only", () => ({}));

/**
 * Deterministic model boundary for the AI interaction scenarios. The real
 * receptionist orchestration (intent classification, scheduling extraction and
 * reply generation) all call requestModelCompletion; stubbing it here lets CI
 * prove that seeded FAQ/instructions and conversation context genuinely reach
 * the model, without a live OpenAI call.
 *
 * `enabled` scopes the stub to the "Meta harness AI receptionist interactions"
 * describe block only: while disabled (the pre-existing base harness block),
 * every call is delegated to the REAL requestModelCompletion, so the original
 * no-OPENAI_API_KEY failure/fallback path is exercised exactly as before.
 * `replyShouldFail` targets a failure at the reply-generation call
 * specifically (identified by its system prompt), regardless of call order.
 */
const modelStub = vi.hoisted(() => ({
  enabled: false,
  calls: [] as { role: string; content: string }[][],
  intentReply: null as string | null,
  replyText: null as string | null,
  replyShouldFail: false,
}));

vi.mock("@/lib/ai/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/provider")>();
  return {
    ...actual,
    requestModelCompletion: vi.fn(
      async (request: Parameters<typeof actual.requestModelCompletion>[0]) => {
        if (!modelStub.enabled) return actual.requestModelCompletion(request);
        modelStub.calls.push(request.messages);
        const system = request.messages[0]?.content ?? "";
        // Reply-generation calls carry the business context system prompt.
        const isReplyGeneration = system.includes("WhatsApp receptionist assistant");
        if (isReplyGeneration && modelStub.replyShouldFail) {
          throw new Error("simulated provider failure");
        }
        if (isReplyGeneration) {
          return modelStub.replyText ?? "Thanks for reaching out! How can I help today?";
        }
        // Intent classification and extraction calls return JSON.
        return modelStub.intentReply ?? '{"intent":"unknown"}';
      }
    ),
  };
});

type Config = { url: string; anonKey: string; serviceRoleKey: string; dbUrl: string };

function loadConfig(): Config | null {
  const url = process.env["SUPABASE_TEST_URL"];
  const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
  const serviceRoleKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
  const dbUrl = process.env["SUPABASE_TEST_DB_URL"];
  return url && anonKey && serviceRoleKey && dbUrl
    ? { url, anonKey, serviceRoleKey, dbUrl }
    : null;
}

const config = loadConfig();
const integrationDescribe = config ? describe : describe.skip;

function requireConfig(): Config {
  if (!config) throw new Error("SUPABASE_TEST_* environment is required for these tests.");
  return config;
}

function adminClient(): SupabaseClient<Database> {
  const cfg = requireConfig();
  return createClient<Database>(cfg.url, cfg.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what} to exist.`);
  return value;
}

const providerHosts = ["graph.facebook.com", "api.twilio.com"];

integrationDescribe("Meta webhook test harness (simulated delivery, real pipeline)", () => {
  let admin: SupabaseClient<Database>;
  let organizationId: string;
  let configId: string;
  let phoneNumberId: string;
  const secretIds: string[] = [];
  const organizationIds: string[] = [];
  const runId = randomUUID();
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const cfg = requireConfig();
    admin = adminClient();
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = cfg.url;
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = cfg.serviceRoleKey;
    // Deterministic AI-failure fallback: with no OpenAI key the intent
    // classifier returns unknown and the reply generator uses the fixed safe
    // fallback. This also guarantees no OpenAI network call happens here.
    vi.stubEnv("OPENAI_API_KEY", "");

    const organization = await admin
      .from("organizations")
      .insert({ name: `Test Clinic ${runId}`, slug: `test-clinic-${runId}` })
      .select("id")
      .single();
    if (organization.error) throw organization.error;
    organizationId = organization.data.id;
    organizationIds.push(organizationId);

    const accessSecretId = await createTestVaultSecret(
      metaHarnessFixture.accessToken,
      `meta-harness-access-${runId}`
    );
    const appSecretId = await createTestVaultSecret(
      metaHarnessFixture.appSecret,
      `meta-harness-app-${runId}`
    );
    secretIds.push(accessSecretId, appSecretId);

    phoneNumberId = `${metaHarnessFixture.phoneNumberId}-${runId}`;
    const whatsappConfig = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationId,
        provider: "meta_whatsapp_cloud",
        phone_number_id: phoneNumberId,
        business_account_id: metaHarnessFixture.businessAccountId,
        display_phone_number: metaHarnessFixture.displayPhoneNumber,
      })
      .select("id")
      .single();
    if (whatsappConfig.error) throw whatsappConfig.error;
    configId = whatsappConfig.data.id;

    const refs = await admin.from("organization_whatsapp_secret_refs").insert({
      config_id: configId,
      access_token_secret_id: accessSecretId,
      app_secret_secret_id: appSecretId,
    });
    if (refs.error) throw refs.error;

    const schedulingSettings = await admin.from("organization_scheduling_settings").insert({
      organization_id: organizationId,
      timezone: "UTC",
      working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      business_hours: {
        monday: { start: "09:00", end: "17:00" },
        tuesday: { start: "09:00", end: "17:00" },
        wednesday: { start: "09:00", end: "17:00" },
        thursday: { start: "09:00", end: "17:00" },
        friday: { start: "09:00", end: "17:00" },
      },
      default_duration_minutes: 30,
    });
    if (schedulingSettings.error) throw schedulingSettings.error;

    const receptionist = await admin.from("organization_receptionist_settings").upsert({
      organization_id: organizationId,
      instructions: "Harness test instructions.",
      faq: "Harness test FAQ.",
    });
    if (receptionist.error) throw receptionist.error;

    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    fetchSpy.mockRestore();
    if (organizationIds.length > 0)
      await admin.from("organizations").delete().in("id", organizationIds);
    await deleteTestVaultSecrets(secretIds);
  });

  function payload(overrides: Parameters<typeof buildMetaTextWebhookPayload>[0] = {}) {
    return buildMetaTextWebhookPayload({ phoneNumberId, ...overrides });
  }

  function expectNoProviderNetworkCalls(): void {
    const urls = fetchSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    for (const host of providerHosts) {
      expect(urls.filter((url: string) => url.includes(host))).toEqual([]);
    }
  }

  it("processes a new sender end-to-end and captures the reply without any provider network call", async () => {
    const messageId = `wamid.TEST_${runId.slice(0, 8)}_001`;
    const result = await runMetaWebhookSimulation(payload({ messageId }));

    expect(result.simulatedProvider).toBe(simulatedMetaProvider);
    expect(result.signatureVerified).toBe(true);
    expect(result.events).toEqual({ messageEvents: 1, statusEvents: 0, statusEventsApplied: 0 });
    expect(result.messages).toHaveLength(1);

    const message = must(result.messages[0], "processed message");
    expect(message.inbound).toEqual({
      senderPhone: metaHarnessFixture.senderWaId,
      text: metaHarnessFixture.defaultText,
      providerMessageId: messageId,
    });
    expect(message.processed).toMatchObject({ organizationId, duplicate: false });
    expect(message.processed.inboundMessageId).toBeTruthy();

    // AI ran through the real orchestration; with no OpenAI key the fixed
    // safe fallback is the expected reply.
    expect(message.ai.replied).toBe(true);
    expect(message.ai.replyText).toBe(safeFallbackReply);
    expect(message.ai.fallbackUsed).toBe(true);

    // The outbound reply was captured by the test transport, not delivered.
    const capturedOutbound = must(message.outbound, "captured outbound reply");
    expect(capturedOutbound).toMatchObject({
      simulatedProvider: simulatedMetaProvider,
      recipient: metaHarnessFixture.senderWaId,
      capturedText: safeFallbackReply,
    });
    expect(capturedOutbound.providerMessageId).toContain(simulatedProviderMessageIdPrefix);

    // Seeded FAQ/instructions flow into the real reply-generation context.
    expect(message.receptionistContext).toEqual({ hasInstructions: true, hasFaq: true });
    expect(message.scheduling).toEqual({
      mutationExecutionSupported: false,
      upcomingAppointmentsForContact: 0,
    });

    const contacts = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("phone", metaHarnessFixture.senderWaId);
    expect(contacts.data).toHaveLength(1);
    expect(must(contacts.data?.[0], "contact row").id).toBe(message.processed.contactId);

    const conversation = await admin
      .from("conversations")
      .select("id, channel, whatsapp_config_id, status")
      .eq("id", message.processed.conversationId)
      .single();
    expect(conversation.data).toEqual({
      id: message.processed.conversationId,
      channel: "whatsapp",
      whatsapp_config_id: configId,
      status: "open",
    });

    const inbound = await admin
      .from("messages")
      .select("id, direction, provider, provider_message_id")
      .eq("organization_id", organizationId)
      .eq("provider_message_id", messageId);
    expect(inbound.data).toEqual([
      {
        id: message.processed.inboundMessageId,
        direction: "inbound",
        provider: "meta_whatsapp_cloud",
        provider_message_id: messageId,
      },
    ]);

    // The simulated outbound record must never look like a real delivery:
    // synthetic provider message id and NULL delivery status.
    const outbound = await admin
      .from("messages")
      .select("id, direction, provider, provider_message_id, delivery_status")
      .eq("id", capturedOutbound.recordedMessageId)
      .single();
    expect(outbound.data).toMatchObject({
      direction: "outbound",
      provider: "meta_whatsapp_cloud",
      delivery_status: null,
    });
    expect(must(outbound.data, "outbound message row").provider_message_id).toContain(
      simulatedProviderMessageIdPrefix
    );

    expectNoProviderNetworkCalls();
  });

  it("reuses the existing contact and open conversation for a second message", async () => {
    const first = await runMetaWebhookSimulation(
      payload({ messageId: `wamid.TEST_${runId.slice(0, 8)}_002` })
    );
    const second = await runMetaWebhookSimulation(
      payload({ messageId: `wamid.TEST_${runId.slice(0, 8)}_003`, text: "Another question." })
    );

    const firstMessage = must(first.messages[0], "first processed message");
    const secondMessage = must(second.messages[0], "second processed message");
    expect(firstMessage.processed.duplicate).toBe(false);
    expect(secondMessage.processed).toMatchObject({
      contactId: firstMessage.processed.contactId,
      conversationId: firstMessage.processed.conversationId,
      duplicate: false,
    });

    const contacts = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("phone", metaHarnessFixture.senderWaId);
    expect(contacts.data).toHaveLength(1);
    expectNoProviderNetworkCalls();
  });

  it("deduplicates a repeated Meta message id and never replies twice", async () => {
    const messageId = `wamid.TEST_${runId.slice(0, 8)}_DUP`;

    async function outboundReplyCount(conversationId: string): Promise<number> {
      const rows = await admin
        .from("messages")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("direction", "outbound")
        .eq("conversation_id", conversationId);
      return rows.data?.length ?? 0;
    }

    // The contact/conversation is reused from earlier scenarios (the pipeline
    // keeps exactly one open conversation per contact+config), so assert the
    // reply-count DELTA on the reused conversation rather than an absolute
    // count that would include earlier scenarios' replies.
    const baselineCount = await (async () => {
      const conversation = await admin
        .from("conversations")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("status", "open")
        .eq("channel", "whatsapp")
        .eq("whatsapp_config_id", configId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return conversation.data ? outboundReplyCount(conversation.data.id) : 0;
    })();

    const first = await runMetaWebhookSimulation(payload({ messageId }));
    const firstMessage = must(first.messages[0], "first processed message");
    const afterFirstCount = await outboundReplyCount(firstMessage.processed.conversationId);

    const duplicate = await runMetaWebhookSimulation(payload({ messageId }));
    const duplicateMessage = must(duplicate.messages[0], "duplicate processed message");
    const afterDuplicateCount = await outboundReplyCount(firstMessage.processed.conversationId);

    expect(firstMessage.processed.duplicate).toBe(false);
    expect(duplicateMessage.processed).toMatchObject({
      contactId: firstMessage.processed.contactId,
      conversationId: firstMessage.processed.conversationId,
      inboundMessageId: null,
      duplicate: true,
    });
    expect(duplicateMessage.ai).toMatchObject({
      replied: false,
      reason: "duplicate_delivery",
    });
    expect(duplicateMessage.outbound).toBeNull();

    // The duplicate provider message id persists no second inbound row.
    const rows = await admin
      .from("messages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("provider_message_id", messageId);
    expect(rows.data).toHaveLength(1);

    // The first delivery produced exactly one reply; the duplicate added none.
    expect(afterFirstCount).toBe(baselineCount + 1);
    expect(afterDuplicateCount).toBe(afterFirstCount);
    expectNoProviderNetworkCalls();
  });

  it("handles an unsupported non-text payload without crashing or persisting", async () => {
    const result = await runMetaWebhookSimulation(
      buildMetaImageWebhookPayload({ phoneNumberId })
    );

    expect(result.events.messageEvents).toBe(0);
    expect(result.messages).toEqual([]);
    expectNoProviderNetworkCalls();
  });

  it("never creates an appointment for a scheduling request through the webhook path", async () => {
    // Booking mutations are never executed by the webhook orchestration
    // (executeSchedulingToolForOrganization returns sandbox_mutation_unavailable
    // by design); without an OpenAI key the intent also falls back to unknown,
    // which is exercised here as the deterministic path.
    const result = await runMetaWebhookSimulation(
      payload({
        messageId: `wamid.TEST_${runId.slice(0, 8)}_BOOK`,
        text: "I would like to book an appointment tomorrow.",
      })
    );

    const message = must(result.messages[0], "processed message");
    expect(message.ai.replied).toBe(true);
    expect(message.scheduling).toMatchObject({
      mutationExecutionSupported: false,
      upcomingAppointmentsForContact: 0,
    });

    const appointments = await admin
      .from("appointments")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("contact_id", message.processed.contactId);
    expect(appointments.data).toEqual([]);
    expectNoProviderNetworkCalls();
  });

  it("rejects a payload whose phone_number_id has no seeded configuration", async () => {
    await expect(
      runMetaWebhookSimulation(payload({ phoneNumberId: "test-meta-phone-number-id-unknown" }))
    ).rejects.toMatchObject({ code: "whatsapp_configuration_unavailable" });
    expectNoProviderNetworkCalls();
  });
});

/**
 * AI receptionist interaction scenarios driven through the real Meta harness
 * pipeline. The model boundary (requestModelCompletion in @/lib/ai/provider)
 * is stubbed per scenario so CI is deterministic and never depends on a live
 * OpenAI call; everything else (webhook normalization, signature, persistence,
 * conversation state, intent, planning, tool gate, receptionist context, reply
 * orchestration, simulated outbound capture) is the REAL application code.
 *
 * Scenarios that leave the stub unset exercise the REAL no-API-key fallback
 * path (CI has no OPENAI_API_KEY), proving the safe fallback end-to-end.
 */
integrationDescribe("Meta harness AI receptionist interactions", () => {
  let admin: SupabaseClient<Database>;
  let organizationId: string;
  let configId: string;
  let phoneNumberId: string;
  const secretIds: string[] = [];
  const organizationIds: string[] = [];
  const runId = randomUUID();
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  // Deterministic seeded business facts. The model is expected to echo these
  // from the FAQ/instructions; fabrication checks assert the opposite.
  const seededFaq = "Services: General consultation and dental cleaning.";
  const seededInstructions =
    "We are open Monday to Friday, 9 AM to 5 PM. Never discuss pricing.";

  beforeAll(async () => {
    modelStub.enabled = true;
    const cfg = requireConfig();
    admin = adminClient();
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = cfg.url;
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = cfg.serviceRoleKey;
    vi.stubEnv("OPENAI_API_KEY", "");

    const organization = await admin
      .from("organizations")
      .insert({ name: `Test Clinic AI ${runId}`, slug: `test-clinic-ai-${runId}` })
      .select("id")
      .single();
    if (organization.error) throw organization.error;
    organizationId = organization.data.id;
    organizationIds.push(organizationId);

    const accessSecretId = await createTestVaultSecret(
      metaHarnessFixture.accessToken,
      `meta-ai-access-${runId}`
    );
    const appSecretId = await createTestVaultSecret(
      metaHarnessFixture.appSecret,
      `meta-ai-app-${runId}`
    );
    secretIds.push(accessSecretId, appSecretId);

    phoneNumberId = `${metaHarnessFixture.phoneNumberId}-ai-${runId}`;
    const whatsappConfig = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationId,
        provider: "meta_whatsapp_cloud",
        phone_number_id: phoneNumberId,
        business_account_id: metaHarnessFixture.businessAccountId,
        display_phone_number: metaHarnessFixture.displayPhoneNumber,
      })
      .select("id")
      .single();
    if (whatsappConfig.error) throw whatsappConfig.error;
    configId = whatsappConfig.data.id;

    const refs = await admin.from("organization_whatsapp_secret_refs").insert({
      config_id: configId,
      access_token_secret_id: accessSecretId,
      app_secret_secret_id: appSecretId,
    });
    if (refs.error) throw refs.error;

    const schedulingSettings = await admin.from("organization_scheduling_settings").insert({
      organization_id: organizationId,
      timezone: "UTC",
      working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      business_hours: {
        monday: { start: "09:00", end: "17:00" },
        tuesday: { start: "09:00", end: "17:00" },
        wednesday: { start: "09:00", end: "17:00" },
        thursday: { start: "09:00", end: "17:00" },
        friday: { start: "09:00", end: "17:00" },
      },
      default_duration_minutes: 30,
    });
    if (schedulingSettings.error) throw schedulingSettings.error;

    const receptionist = await admin.from("organization_receptionist_settings").upsert({
      organization_id: organizationId,
      instructions: seededInstructions,
      faq: seededFaq,
    });
    if (receptionist.error) throw receptionist.error;

    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterAll(async () => {
    modelStub.enabled = false;
    vi.unstubAllEnvs();
    fetchSpy.mockRestore();
    if (organizationIds.length > 0)
      await admin.from("organizations").delete().in("id", organizationIds);
    await deleteTestVaultSecrets(secretIds);
  });

  function payload(overrides: Parameters<typeof buildMetaTextWebhookPayload>[0] = {}) {
    return buildMetaTextWebhookPayload({ phoneNumberId, ...overrides });
  }

  function expectNoProviderNetworkCalls(): void {
    const urls = fetchSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    for (const host of providerHosts) {
      expect(urls.filter((url: string) => url.includes(host))).toEqual([]);
    }
  }

  function expectNoOpenAICalls(): void {
    const urls = fetchSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(urls.filter((url: string) => url.includes("api.openai.com"))).toEqual([]);
  }

  async function appointmentCount(contactId: string): Promise<number> {
    const rows = await admin
      .from("appointments")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId);
    return rows.data?.length ?? 0;
  }

  /** Unique synthetic sender per test so scenarios never share a conversation. */
  function uniqueWaId(tag: string): string {
    return `1555${runId.replace(/-/g, "").slice(0, 4)}${tag}`.slice(0, 11);
  }

  beforeEach(() => {
    modelStub.calls = [];
    modelStub.intentReply = null;
    modelStub.replyText = null;
    modelStub.replyShouldFail = false;
  });

  it("answers a greeting with a polite receptionist reply and no appointment mutation", async () => {
    modelStub.intentReply = '{"intent":"greeting"}';
    modelStub.replyText = "Hello! Welcome to Test Clinic. How can I help you today?";

    const result = await runMetaWebhookSimulation(
      payload({ waId: uniqueWaId("00"), messageId: `wamid.AI_${runId.slice(0, 8)}_GREET`, text: "Hi" })
    );
    const message = must(result.messages[0], "greeting message");

    expect(message.processed.duplicate).toBe(false);
    expect(message.ai.replied).toBe(true);
    expect(message.ai.fallbackUsed).toBe(false);
    expect(message.outbound?.capturedText).toBe(
      "Hello! Welcome to Test Clinic. How can I help you today?"
    );
    expect(await appointmentCount(message.processed.contactId)).toBe(0);
    expectNoProviderNetworkCalls();
    expectNoOpenAICalls();
  });

  it("reflects configured business hours from instructions instead of inventing them", async () => {
    // Deterministic reply that quotes the seeded hours, proving the context
    // influenced the response; plus a fabricated-hours negative check.
    modelStub.intentReply = '{"intent":"general_question"}';
    modelStub.replyText = "We're open Monday to Friday, 9 AM to 5 PM. How can I help?";

    const result = await runMetaWebhookSimulation(
      payload({
        waId: uniqueWaId("01"),
        messageId: `wamid.AI_${runId.slice(0, 8)}_HOURS`,
        text: "What time are you open tomorrow?",
      })
    );
    const message = must(result.messages[0], "hours message");
    const reply = message.outbound?.capturedText ?? "";

    expect(message.receptionistContext.hasInstructions).toBe(true);
    expect(message.ai.fallbackUsed).toBe(false);
    expect(reply).toBe("We're open Monday to Friday, 9 AM to 5 PM. How can I help?");
    // The reply-generation model call carried the seeded instructions as context.
    const replyCall = modelStub.calls.find((c) =>
      (c[0]?.content ?? "").includes("WhatsApp receptionist assistant")
    );
    expect(replyCall?.[0]?.content).toContain(seededInstructions);
    expect(reply).not.toMatch(/24 hours|open 24\/7|8 AM to 8 PM|10 PM/i);
    expect(await appointmentCount(message.processed.contactId)).toBe(0);
    expectNoProviderNetworkCalls();
    expectNoOpenAICalls();
  });

  it("answers a services question from seeded FAQ without unsupported facts", async () => {
    modelStub.intentReply = '{"intent":"general_question"}';
    modelStub.replyText = "We offer general consultations and dental cleaning.";

    const result = await runMetaWebhookSimulation(
      payload({
        waId: uniqueWaId("02"),
        messageId: `wamid.AI_${runId.slice(0, 8)}_SERVICES`,
        text: "What services do you provide?",
      })
    );
    const message = must(result.messages[0], "services message");
    const reply = message.outbound?.capturedText ?? "";

    expect(message.receptionistContext.hasFaq).toBe(true);
    expect(message.ai.fallbackUsed).toBe(false);
    expect(reply).toBe("We offer general consultations and dental cleaning.");
    // The FAQ text reached the model context.
    const replyCall = modelStub.calls.find((c) =>
      (c[0]?.content ?? "").includes("WhatsApp receptionist assistant")
    );
    expect(replyCall?.[0]?.content).toContain(seededFaq);
    expect(reply).not.toMatch(/open heart surgery|price|\$\d+|free consultation/i);
    expectNoProviderNetworkCalls();
    expectNoOpenAICalls();
  });

  it("handles an appointment booking request without faking a booking", async () => {
    // The planner runs on the real intent; the model stub supplies a reply that
    // does not confirm a booking, matching the tool outcome (mutation unsupported).
    modelStub.intentReply = '{"intent":"book_appointment"}';
    modelStub.replyText = "I can help with that. Our team will confirm your appointment shortly.";

    const result = await runMetaWebhookSimulation(
      payload({
        waId: uniqueWaId("03"),
        messageId: `wamid.AI_${runId.slice(0, 8)}_BOOK`,
        text: "I want to book an appointment tomorrow.",
      })
    );
    const message = must(result.messages[0], "booking message");
    const reply = message.outbound?.capturedText ?? "";

    // Webhook mutation path is intentionally unsupported; no appointment is created.
    expect(message.scheduling.mutationExecutionSupported).toBe(false);
    expect(await appointmentCount(message.processed.contactId)).toBe(0);
    // The reply must not fabricate a confirmation that never happened.
    expect(reply).not.toMatch(/your appointment is (confirmed|booked)|booking confirmed|i've booked/i);
    expectNoProviderNetworkCalls();
    expectNoOpenAICalls();
  });

  it("queries existing appointments through the real tool when a contact has them", async () => {
    // query_appointments is the only tool that actually executes in the webhook
    // path; verify it surfaces a real appointment through the real pipeline.
    modelStub.intentReply = '{"intent":"query_appointment"}';
    modelStub.replyText = "Let me check your upcoming appointments for you.";

    const waId = uniqueWaId("04");
    const first = await runMetaWebhookSimulation(
      payload({ waId, messageId: `wamid.AI_${runId.slice(0, 8)}_Q1`, text: "Hello" })
    );
    const contactId = must(first.messages[0], "first query message").processed.contactId;
    const conversationId = must(first.messages[0], "first query message").processed.conversationId;

    const insert = await admin.from("appointments").insert({
      organization_id: organizationId,
      contact_id: contactId,
      conversation_id: conversationId,
      status: "confirmed",
      starts_at: "2099-06-01T10:00:00.000Z",
      ends_at: "2099-06-01T10:30:00.000Z",
    });
    if (insert.error) throw insert.error;

    const query = await runMetaWebhookSimulation(
      payload({
        waId,
        messageId: `wamid.AI_${runId.slice(0, 8)}_Q2`,
        text: "What appointments do I have coming up?",
      })
    );
    const message = must(query.messages[0], "query message");

    // The real query_appointments tool ran and saw the seeded appointment.
    expect(message.scheduling.upcomingAppointmentsForContact).toBe(1);
    expect(message.ai.replied).toBe(true);
    expect(message.ai.fallbackUsed).toBe(false);
    expectNoProviderNetworkCalls();
    expectNoOpenAICalls();
  });

  it("asks for clarification on an ambiguous request without mutating anything", async () => {
    modelStub.intentReply = '{"intent":"unknown"}';
    modelStub.replyText = "Could you tell me a bit more about what you need help with?";

    const result = await runMetaWebhookSimulation(
      payload({ waId: uniqueWaId("05"), messageId: `wamid.AI_${runId.slice(0, 8)}_AMBIG`, text: "I need help." })
    );
    const message = must(result.messages[0], "ambiguous message");
    const reply = message.outbound?.capturedText ?? "";

    expect(message.processed.duplicate).toBe(false);
    expect(reply).toBe("Could you tell me a bit more about what you need help with?");
    expect(await appointmentCount(message.processed.contactId)).toBe(0);
    expect(reply).not.toMatch(/your appointment is (confirmed|booked)/i);
    expectNoProviderNetworkCalls();
    expectNoOpenAICalls();
  });

  it("stays within the administrative role for an unsupported operational request", async () => {
    modelStub.intentReply = '{"intent":"general_question"}';
    modelStub.replyText =
      "I'm not able to help with payments or refunds. Our team will follow up with you.";

    const result = await runMetaWebhookSimulation(
      payload({
        waId: uniqueWaId("06"),
        messageId: `wamid.AI_${runId.slice(0, 8)}_UNSUP`,
        text: "Please process a refund for my last payment.",
      })
    );
    const message = must(result.messages[0], "unsupported message");
    const reply = message.outbound?.capturedText ?? "";

    expect(reply).toBe("I'm not able to help with payments or refunds. Our team will follow up with you.");
    expect(reply).not.toMatch(/refund (has been|is) (processed|issued)|i've processed/i);
    expectNoProviderNetworkCalls();
    expectNoOpenAICalls();
  });

  it("keeps a medical question within the administrative front-desk boundary", async () => {
    modelStub.intentReply = '{"intent":"general_question"}';
    modelStub.replyText =
      "I'm not able to provide medical advice. A clinician will follow up with you shortly.";

    const result = await runMetaWebhookSimulation(
      payload({
        waId: uniqueWaId("07"),
        messageId: `wamid.AI_${runId.slice(0, 8)}_MED`,
        text: "I have a fever and chest pain. What medicine should I take?",
      })
    );
    const message = must(result.messages[0], "medical message");
    const reply = message.outbound?.capturedText ?? "";

    expect(message.ai.replied).toBe(true);
    expect(message.ai.fallbackUsed).toBe(false);
    expect(reply).toBe(
      "I'm not able to provide medical advice. A clinician will follow up with you shortly."
    );
    // The receptionist must not provide diagnosis, medication or dosage advice.
    expect(reply).not.toMatch(/take \d+\s?mg|ibuprofen|paracetamol|aspirin|you have (the )?flu|diagnos/i);
    expectNoProviderNetworkCalls();
    expectNoOpenAICalls();
  });

  it("reuses contact and conversation across a multi-turn booking sequence with prior context", async () => {
    const waId = uniqueWaId("08");
    const turns = [
      { id: `_MT1`, text: "I want to book an appointment.", intent: "book_appointment" },
      { id: `_MT2`, text: "Tomorrow afternoon.", intent: "book_appointment" },
      { id: `_MT3`, text: "3 pm.", intent: "book_appointment" },
    ];

    let firstContactId: string | null = null;
    let firstConversationId: string | null = null;
    for (const turn of turns) {
      modelStub.calls = [];
      modelStub.intentReply = `{"intent":"${turn.intent}"}`;
      modelStub.replyText = `Noted: ${turn.text}`;
      const result = await runMetaWebhookSimulation(
        payload({
          waId,
          messageId: `wamid.AI_${runId.slice(0, 8)}${turn.id}`,
          text: turn.text,
        })
      );
      const message = must(result.messages[0], `multi-turn ${turn.id}`);
      expect(message.processed.duplicate).toBe(false);
      expect(message.ai.replied).toBe(true);
      // Each turn invokes the real receptionist reply generation exactly once.
      const replyCalls = modelStub.calls.filter((c) =>
        (c[0]?.content ?? "").includes("WhatsApp receptionist assistant")
      );
      expect(replyCalls.length).toBe(1);
      if (firstContactId === null) {
        firstContactId = message.processed.contactId;
        firstConversationId = message.processed.conversationId;
      } else {
        // Same contact and the SAME open conversation are reused every turn.
        expect(message.processed.contactId).toBe(firstContactId);
        expect(message.processed.conversationId).toBe(firstConversationId);
      }
    }

    const contacts = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("phone", waId);
    expect(contacts.data).toHaveLength(1);
    // Prior turns' inbound messages are persisted on the shared conversation,
    // so the real conversation-state builder has multi-turn context.
    const inboundRows = await admin
      .from("messages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("direction", "inbound")
      .eq("conversation_id", firstConversationId ?? "");
    expect(inboundRows.data).toHaveLength(3);
    // Booking mutations are never executed via webhook, so no appointment.
    expect(await appointmentCount(must(firstContactId, "multi-turn contact"))).toBe(0);
    expectNoProviderNetworkCalls();
    expectNoOpenAICalls();
  });

  it("never invokes the AI twice for a duplicate Meta message id", async () => {
    const messageId = `wamid.AI_${runId.slice(0, 8)}_DUP2`;
    const waId = uniqueWaId("09");

    modelStub.intentReply = '{"intent":"greeting"}';
    modelStub.replyText = "Hello! How can I help you today?";
    const first = await runMetaWebhookSimulation(payload({ waId, messageId, text: "Hi" }));
    const callsAfterFirst = modelStub.calls.length;

    const duplicate = await runMetaWebhookSimulation(payload({ waId, messageId, text: "Hi" }));

    const firstMessage = must(first.messages[0], "first duplicate message");
    const duplicateMessage = must(duplicate.messages[0], "duplicate message");

    expect(firstMessage.processed.duplicate).toBe(false);
    expect(firstMessage.ai.replied).toBe(true);
    expect(duplicateMessage.processed.duplicate).toBe(true);
    // Duplicate must not trigger a second orchestration/reply or model call.
    expect(duplicateMessage.ai.replied).toBe(false);
    expect(duplicateMessage.ai.reason).toBe("duplicate_delivery");
    expect(duplicateMessage.outbound).toBeNull();
    expect(modelStub.calls.length).toBe(callsAfterFirst);

    const outboundRows = await admin
      .from("messages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("direction", "outbound")
      .eq("conversation_id", firstMessage.processed.conversationId);
    expect(outboundRows.data).toHaveLength(1);
    expectNoProviderNetworkCalls();
    expectNoOpenAICalls();
  });

  it("uses the exact safe fallback and still captures outbound when the AI provider fails", async () => {
    // Target the failure at the reply-generation call specifically (the mock
    // identifies it by its system prompt): intent classification and
    // scheduling/tool planning still run for real and succeed, only the
    // reply-generation call fails, so generateReceptionistReply must fall
    // back to the fixed safe message rather than crash, and the harness must
    // still capture the simulated outbound.
    modelStub.intentReply = '{"intent":"query_appointment"}';
    modelStub.replyText = null;
    modelStub.replyShouldFail = true;

    const result = await runMetaWebhookSimulation(
      payload({
        waId: uniqueWaId("10"),
        messageId: `wamid.AI_${runId.slice(0, 8)}_FAIL`,
        text: "Do you have any appointments available next week?",
      })
    );
    const message = must(result.messages[0], "fallback message");

    // Proves intent classification succeeded as query_appointment and the
    // real query_appointments tool executed: only that path produces this
    // exact scheduling-context text in the (failing) reply-generation call.
    const replyCall = modelStub.calls.find((c) =>
      (c[0]?.content ?? "").includes("WhatsApp receptionist assistant")
    );
    expect(replyCall?.[0]?.content).toContain("No upcoming appointments were found for this contact.");

    const reply = message.outbound?.capturedText ?? "";
    expect(reply).toBe(safeFallbackReply);
    expect(message.ai.fallbackUsed).toBe(true);
    expect(message.outbound?.providerMessageId).toContain(simulatedProviderMessageIdPrefix);
    expectNoProviderNetworkCalls();
    expectNoOpenAICalls();
  });
});
