/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
    const first = await runMetaWebhookSimulation(payload({ messageId }));
    const duplicate = await runMetaWebhookSimulation(payload({ messageId }));

    const firstMessage = must(first.messages[0], "first processed message");
    const duplicateMessage = must(duplicate.messages[0], "duplicate processed message");
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

    const rows = await admin
      .from("messages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("provider_message_id", messageId);
    expect(rows.data).toHaveLength(1);

    const outboundRows = await admin
      .from("messages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("direction", "outbound")
      .eq("conversation_id", firstMessage.processed.conversationId);
    expect(outboundRows.data).toHaveLength(1);
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
