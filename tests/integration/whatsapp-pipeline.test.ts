/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";
import { processInboundWhatsAppMessage } from "@/lib/whatsapp/pipeline";
import type { WhatsAppInboundMessageEvent } from "@/lib/whatsapp/meta";

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

function event(overrides: Partial<WhatsAppInboundMessageEvent> = {}): WhatsAppInboundMessageEvent {
  return {
    kind: "message",
    provider: "meta_whatsapp_cloud",
    organizationId: "",
    configId: "",
    phoneNumberId: "phone",
    businessAccountId: "business",
    providerMessageId: `wamid-${randomUUID()}`,
    senderPhone: "+14155550123",
    recipientPhoneNumberId: "phone",
    timestamp: "2099-01-01T10:00:00.000Z",
    messageType: "text",
    text: "Hello",
    ...overrides,
  };
}

integrationDescribe("Phase 5.2 inbound WhatsApp pipeline", () => {
  let admin: SupabaseClient<Database>;
  let organizationAId: string;
  let organizationBId: string;
  let configAId: string;
  let configBId: string;
  const organizationIds: string[] = [];

  beforeAll(async () => {
    admin = adminClient();
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = config!.url;
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = config!.serviceRoleKey;
    const runId = randomUUID();
    const organizationA = await admin
      .from("organizations")
      .insert({ name: `Pipeline A ${runId}`, slug: `pipeline-a-${runId}` })
      .select("id")
      .single();
    const organizationB = await admin
      .from("organizations")
      .insert({ name: `Pipeline B ${runId}`, slug: `pipeline-b-${runId}` })
      .select("id")
      .single();
    if (organizationA.error || organizationB.error)
      throw organizationA.error ?? organizationB.error;
    organizationAId = organizationA.data.id;
    organizationBId = organizationB.data.id;
    organizationIds.push(organizationAId, organizationBId);

    const configA = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationAId,
        provider: "meta_whatsapp_cloud",
        phone_number_id: `pipeline-phone-a-${runId}`,
        business_account_id: "pipeline-business-a",
      })
      .select("id, phone_number_id")
      .single();
    const configB = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationBId,
        provider: "meta_whatsapp_cloud",
        phone_number_id: `pipeline-phone-b-${runId}`,
        business_account_id: "pipeline-business-b",
      })
      .select("id, phone_number_id")
      .single();
    if (configA.error || configB.error) throw configA.error ?? configB.error;
    configAId = configA.data.id;
    configBId = configB.data.id;
  });

  afterAll(async () => {
    if (organizationIds.length > 0)
      await admin.from("organizations").delete().in("id", organizationIds);
  });

  it("creates and reuses the tenant contact and open WhatsApp conversation", async () => {
    const first = await processInboundWhatsAppMessage(
      event({
        organizationId: organizationAId,
        configId: configAId,
        phoneNumberId: "pipeline-phone-a",
        recipientPhoneNumberId: "pipeline-phone-a",
        providerMessageId: "wamid-pipeline-1",
      })
    );
    const second = await processInboundWhatsAppMessage(
      event({
        organizationId: organizationAId,
        configId: configAId,
        phoneNumberId: "pipeline-phone-a",
        recipientPhoneNumberId: "pipeline-phone-a",
        providerMessageId: "wamid-pipeline-2",
        text: "Second message",
      })
    );

    expect(first).toMatchObject({
      organizationId: organizationAId,
      duplicate: false,
      providerMessageId: "wamid-pipeline-1",
    });
    expect(second).toMatchObject({
      organizationId: organizationAId,
      contactId: first.contactId,
      conversationId: first.conversationId,
      duplicate: false,
    });

    const contacts = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationAId)
      .eq("phone", "+14155550123");
    const conversations = await admin
      .from("conversations")
      .select("id, channel, whatsapp_config_id, status")
      .eq("id", first.conversationId);
    const messages = await admin
      .from("messages")
      .select("id, direction, content, provider, provider_message_id, conversation_id")
      .eq("organization_id", organizationAId)
      .in("provider_message_id", ["wamid-pipeline-1", "wamid-pipeline-2"]);

    expect(contacts.data).toHaveLength(1);
    expect(conversations.data).toEqual([
      {
        id: first.conversationId,
        channel: "whatsapp",
        whatsapp_config_id: configAId,
        status: "open",
      },
    ]);
    expect(messages.data).toHaveLength(2);
    expect(
      messages.data?.every(
        (message) =>
          message.direction === "inbound" &&
          message.provider === "meta_whatsapp_cloud" &&
          message.conversation_id === first.conversationId
      )
    ).toBe(true);
  });

  it("returns a stable duplicate result without inserting a second message", async () => {
    const first = await processInboundWhatsAppMessage(
      event({
        organizationId: organizationAId,
        configId: configAId,
        phoneNumberId: "pipeline-phone-a",
        recipientPhoneNumberId: "pipeline-phone-a",
        providerMessageId: "wamid-duplicate",
      })
    );
    const duplicate = await processInboundWhatsAppMessage(
      event({
        organizationId: organizationAId,
        configId: configAId,
        phoneNumberId: "pipeline-phone-a",
        recipientPhoneNumberId: "pipeline-phone-a",
        providerMessageId: "wamid-duplicate",
        senderPhone: "+14155550999",
      })
    );
    const rows = await admin
      .from("messages")
      .select("id")
      .eq("organization_id", organizationAId)
      .eq("provider_message_id", "wamid-duplicate");

    expect(first.duplicate).toBe(false);
    expect(duplicate).toMatchObject({
      duplicate: true,
      contactId: first.contactId,
      conversationId: first.conversationId,
      messageId: null,
    });
    expect(rows.data).toHaveLength(1);
    const contacts = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationAId)
      .in("phone", ["+14155550123", "+14155550999"]);
    expect(contacts.data).toHaveLength(1);
  });

  it("keeps same phone isolated by organization and rejects mismatched configuration", async () => {
    const otherContact = await admin
      .from("contacts")
      .insert({ organization_id: organizationBId, phone: "+14155550123", name: "Other tenant" })
      .select("id")
      .single();
    if (otherContact.error) throw otherContact.error;
    const result = await processInboundWhatsAppMessage(
      event({
        organizationId: organizationAId,
        configId: configAId,
        phoneNumberId: "pipeline-phone-a",
        recipientPhoneNumberId: "pipeline-phone-a",
        providerMessageId: "wamid-isolated",
      })
    );
    const crossConfig = processInboundWhatsAppMessage(
      event({
        organizationId: organizationAId,
        configId: configBId,
        phoneNumberId: "pipeline-phone-b",
        recipientPhoneNumberId: "pipeline-phone-b",
        providerMessageId: "wamid-cross-config",
      })
    );

    expect(result.organizationId).toBe(organizationAId);
    expect(result.contactId).not.toBe(otherContact.data.id);
    await expect(crossConfig).rejects.toMatchObject({ code: "whatsapp_tenant_mismatch" });
  });

  it("does not reuse a closed WhatsApp conversation", async () => {
    const first = await processInboundWhatsAppMessage(
      event({
        organizationId: organizationAId,
        configId: configAId,
        phoneNumberId: "pipeline-phone-a",
        recipientPhoneNumberId: "pipeline-phone-a",
        providerMessageId: "wamid-closed-1",
      })
    );
    await admin.from("conversations").update({ status: "closed" }).eq("id", first.conversationId);
    const next = await processInboundWhatsAppMessage(
      event({
        organizationId: organizationAId,
        configId: configAId,
        phoneNumberId: "pipeline-phone-a",
        recipientPhoneNumberId: "pipeline-phone-a",
        senderPhone: "+14155550999",
        providerMessageId: "wamid-closed-2",
      })
    );

    expect(next.conversationId).not.toBe(first.conversationId);
  });

  it("rejects malformed trusted normalized events", async () => {
    await expect(processInboundWhatsAppMessage(event({ text: "   " }))).rejects.toMatchObject({
      code: "whatsapp_pipeline_input_invalid",
    });
  });
});
