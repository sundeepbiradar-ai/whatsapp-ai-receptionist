/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";
import { createTestVaultSecret, deleteTestVaultSecrets } from "../helpers/test-database";
import { processInboundWhatsAppMessage } from "@/lib/whatsapp/pipeline";
import {
  resolveWhatsAppConfigByPhoneNumberId,
  twilioWhatsAppSandboxProvider,
} from "@/lib/whatsapp/configuration";
import { getConversationForOrganization } from "@/lib/domain/conversations/service-repository";
import { buildConversationStateForOrganization } from "@/lib/ai/service-conversation-state";
import { queryAppointmentsForOrganizationAndContact } from "@/lib/domain/appointments/service-repository";
import { executeSchedulingToolForOrganization } from "@/lib/ai/service-scheduling-tools";
import { DomainError } from "@/lib/domain/errors";

vi.mock("server-only", () => ({}));

type Config = { url: string; anonKey: string; serviceRoleKey: string };

function loadConfig(): Config | null {
  const url = process.env["SUPABASE_TEST_URL"];
  const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
  const serviceRoleKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
  return url && anonKey && serviceRoleKey ? { url, anonKey, serviceRoleKey } : null;
}

const config = loadConfig();
const integrationDescribe = config ? describe : describe.skip;

function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(config!.url, config!.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

integrationDescribe("Phase 9 Twilio WhatsApp Sandbox tenant isolation", () => {
  let admin: SupabaseClient<Database>;
  let organizationAId: string;
  let organizationBId: string;
  let configAId: string;
  const secretIds: string[] = [];
  const organizationIds: string[] = [];
  const runId = randomUUID();

  beforeAll(async () => {
    admin = adminClient();
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = config!.url;
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = config!.serviceRoleKey;

    const organizationA = await admin
      .from("organizations")
      .insert({ name: `Twilio Sandbox A ${runId}`, slug: `twilio-sandbox-a-${runId}` })
      .select("id")
      .single();
    const organizationB = await admin
      .from("organizations")
      .insert({ name: `Twilio Sandbox B ${runId}`, slug: `twilio-sandbox-b-${runId}` })
      .select("id")
      .single();
    if (organizationA.error || organizationB.error)
      throw organizationA.error ?? organizationB.error;
    organizationAId = organizationA.data.id;
    organizationBId = organizationB.data.id;
    organizationIds.push(organizationAId, organizationBId);

    const accessSecretId = await createTestVaultSecret("fake-twilio-auth-token", `twilio-secret-${runId}`);
    secretIds.push(accessSecretId);

    const configA = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationAId,
        provider: twilioWhatsAppSandboxProvider,
        phone_number_id: `+1415500${runId.slice(0, 4)}`,
        business_account_id: "ACfaketestaccountsid",
      })
      .select("id, phone_number_id")
      .single();
    if (configA.error) throw configA.error;
    configAId = configA.data.id;

    const refs = await admin
      .from("organization_whatsapp_secret_refs")
      .insert({ config_id: configAId, access_token_secret_id: accessSecretId });
    if (refs.error) throw refs.error;

    const schedulingSettings = await admin.from("organization_scheduling_settings").insert({
      organization_id: organizationAId,
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
  });

  afterAll(async () => {
    if (organizationIds.length > 0)
      await admin.from("organizations").delete().in("id", organizationIds);
    await deleteTestVaultSecrets(secretIds);
  });

  it("resolves the twilio sandbox config only for the organization that owns the destination number", async () => {
    const resolved = await resolveWhatsAppConfigByPhoneNumberId(
      (await admin.from("organization_whatsapp_configs").select("phone_number_id").eq("id", configAId).single())
        .data!.phone_number_id,
      twilioWhatsAppSandboxProvider
    );
    expect(resolved?.organizationId).toBe(organizationAId);
    expect(resolved?.accessToken).toBe("fake-twilio-auth-token");
  });

  it("persists a twilio-provider inbound message through the existing pipeline and deduplicates by MessageSid", async () => {
    const messageSid = `SM-twilio-${randomUUID()}`;
    const first = await processInboundWhatsAppMessage({
      kind: "message",
      provider: twilioWhatsAppSandboxProvider,
      organizationId: organizationAId,
      configId: configAId,
      phoneNumberId: "twilio-phone",
      businessAccountId: "ACfaketestaccountsid",
      providerMessageId: messageSid,
      senderPhone: "+14155550199",
      recipientPhoneNumberId: "twilio-phone",
      timestamp: new Date().toISOString(),
      messageType: "text",
      text: "Hi, I'd like to book an appointment",
    });
    expect(first.duplicate).toBe(false);

    const second = await processInboundWhatsAppMessage({
      kind: "message",
      provider: twilioWhatsAppSandboxProvider,
      organizationId: organizationAId,
      configId: configAId,
      phoneNumberId: "twilio-phone",
      businessAccountId: "ACfaketestaccountsid",
      providerMessageId: messageSid,
      senderPhone: "+14155550199",
      recipientPhoneNumberId: "twilio-phone",
      timestamp: new Date().toISOString(),
      messageType: "text",
      text: "Hi, I'd like to book an appointment",
    });
    expect(second.duplicate).toBe(true);
    expect(second.conversationId).toBe(first.conversationId);

    const orgAConversationId = first.conversationId;
    const orgAContactId = first.contactId;

    const state = await buildConversationStateForOrganization(organizationAId, orgAConversationId);
    expect(state.organizationId).toBe(organizationAId);
    expect(state.contactId).toBe(orgAContactId);

    await expect(
      getConversationForOrganization(organizationBId, orgAConversationId)
    ).rejects.toMatchObject({ code: "not_found" });

    await expect(
      buildConversationStateForOrganization(organizationBId, orgAConversationId)
    ).rejects.toBeInstanceOf(DomainError);

    const crossTenantAppointments = await queryAppointmentsForOrganizationAndContact(
      organizationBId,
      orgAContactId
    );
    expect(crossTenantAppointments).toEqual([]);

    const staleToolResult = await executeSchedulingToolForOrganization(organizationAId, {
      conversationState: { ...state, contactId: randomUUID() },
      plan: {
        intent: "query_appointment",
        action: "prepare_query",
        requiresClarification: false,
        missingFields: [],
        collectedFields: {
          timezone: "UTC",
          localDate: null,
          localTime: null,
          startsAt: null,
          durationMinutes: 30,
          referencesExistingAppointment: false,
        },
        nextStep: "ready_for_tool",
        reason: "ready",
      },
    });
    expect(staleToolResult).toMatchObject({
      tool: "query_appointments",
      outcome: "not_executed",
      reason: "stale_conversation_context",
    });

    const readyToolResult = await executeSchedulingToolForOrganization(organizationAId, {
      conversationState: state,
      plan: {
        intent: "query_appointment",
        action: "prepare_query",
        requiresClarification: false,
        missingFields: [],
        collectedFields: {
          timezone: "UTC",
          localDate: null,
          localTime: null,
          startsAt: null,
          durationMinutes: 30,
          referencesExistingAppointment: false,
        },
        nextStep: "ready_for_tool",
        reason: "ready",
      },
    });
    expect(readyToolResult).toMatchObject({ tool: "query_appointments", outcome: "success" });

    const bookingAttempt = await executeSchedulingToolForOrganization(organizationAId, {
      conversationState: state,
      plan: {
        intent: "book_appointment",
        action: "prepare_booking",
        requiresClarification: false,
        missingFields: [],
        collectedFields: {
          timezone: "UTC",
          localDate: "2099-01-01",
          localTime: "10:00",
          startsAt: "2099-01-01T10:00:00.000Z",
          durationMinutes: 30,
          referencesExistingAppointment: false,
        },
        nextStep: "ready_for_tool",
        reason: "ready",
      },
    });
    expect(bookingAttempt).toMatchObject({
      tool: "book_appointment",
      outcome: "not_executed",
      reason: "sandbox_mutation_unavailable",
    });
  });
});
