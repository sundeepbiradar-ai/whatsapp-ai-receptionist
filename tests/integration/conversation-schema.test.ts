/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";

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

integrationDescribe("Phase 5.2 conversation and message schema foundation", () => {
  let admin: SupabaseClient<Database>;
  let organizationAId: string;
  let organizationBId: string;
  let contactAId: string;
  let contactBId: string;
  let configAId: string;
  let configBId: string;
  let legacyConversationId: string;
  let whatsappConversationId: string;
  let organizationBConversationId: string;
  const organizationIds: string[] = [];

  beforeAll(async () => {
    admin = adminClient();
    const runId = randomUUID();
    const organizationA = await admin
      .from("organizations")
      .insert({
        name: `Conversation Schema A ${runId}`,
        slug: `conversation-schema-a-${runId}`,
      })
      .select("id")
      .single();
    const organizationB = await admin
      .from("organizations")
      .insert({
        name: `Conversation Schema B ${runId}`,
        slug: `conversation-schema-b-${runId}`,
      })
      .select("id")
      .single();
    if (organizationA.error || organizationB.error)
      throw organizationA.error ?? organizationB.error;
    organizationAId = organizationA.data.id;
    organizationBId = organizationB.data.id;
    organizationIds.push(organizationAId, organizationBId);

    const contactA = await admin
      .from("contacts")
      .insert({
        organization_id: organizationAId,
        phone: `+1415555${runId.replace(/-/g, "").slice(0, 5)}`,
        name: "Schema Contact A",
      })
      .select("id")
      .single();
    const contactB = await admin
      .from("contacts")
      .insert({
        organization_id: organizationBId,
        phone: `+1415666${runId.replace(/-/g, "").slice(0, 5)}`,
        name: "Schema Contact B",
      })
      .select("id")
      .single();
    if (contactA.error || contactB.error) throw contactA.error ?? contactB.error;
    contactAId = contactA.data.id;
    contactBId = contactB.data.id;

    const configA = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationAId,
        provider: "meta_whatsapp_cloud",
        phone_number_id: `schema-phone-a-${runId}`,
        business_account_id: "schema-business-a",
      })
      .select("id")
      .single();
    const configB = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationBId,
        provider: "meta_whatsapp_cloud",
        phone_number_id: `schema-phone-b-${runId}`,
        business_account_id: "schema-business-b",
      })
      .select("id")
      .single();
    if (configA.error || configB.error) throw configA.error ?? configB.error;
    configAId = configA.data.id;
    configBId = configB.data.id;

    const legacy = await admin
      .from("conversations")
      .insert({
        organization_id: organizationAId,
        contact_id: contactAId,
        status: "open",
      })
      .select("id")
      .single();
    if (legacy.error) throw legacy.error;
    legacyConversationId = legacy.data.id;

    const whatsapp = await admin
      .from("conversations")
      .insert({
        organization_id: organizationAId,
        contact_id: contactAId,
        channel: "whatsapp",
        whatsapp_config_id: configAId,
        status: "open",
      })
      .select("id")
      .single();
    if (whatsapp.error) throw whatsapp.error;
    whatsappConversationId = whatsapp.data.id;

    const organizationBConversation = await admin
      .from("conversations")
      .insert({
        organization_id: organizationBId,
        contact_id: contactBId,
        channel: "whatsapp",
        whatsapp_config_id: configBId,
        status: "open",
      })
      .select("id")
      .single();
    if (organizationBConversation.error) throw organizationBConversation.error;
    organizationBConversationId = organizationBConversation.data.id;
  });

  afterAll(async () => {
    if (organizationIds.length > 0)
      await admin.from("organizations").delete().in("id", organizationIds);
  });

  it("keeps legacy conversations and messages valid", async () => {
    const message = await admin
      .from("messages")
      .insert({
        organization_id: organizationAId,
        conversation_id: legacyConversationId,
        direction: "inbound",
        content: "Legacy message",
      })
      .select("provider, provider_message_id, content")
      .single();

    expect(message.error).toBeNull();
    expect(message.data).toEqual({
      provider: null,
      provider_message_id: null,
      content: "Legacy message",
    });
  });

  it("persists WhatsApp channel identity and provider message correlation", async () => {
    const message = await admin
      .from("messages")
      .insert({
        organization_id: organizationAId,
        conversation_id: whatsappConversationId,
        direction: "inbound",
        content: "WhatsApp message",
        provider: "meta_whatsapp_cloud",
        provider_message_id: `wamid-${randomUUID()}`,
      })
      .select("provider, provider_message_id, conversation_id")
      .single();

    const conversation = await admin
      .from("conversations")
      .select("channel, whatsapp_config_id")
      .eq("id", whatsappConversationId)
      .single();
    expect(message.error).toBeNull();
    expect(message.data?.provider).toBe("meta_whatsapp_cloud");
    expect(message.data?.conversation_id).toBe(whatsappConversationId);
    expect(conversation.error).toBeNull();
    expect(conversation.data).toEqual({ channel: "whatsapp", whatsapp_config_id: configAId });
  });

  it("enforces organization-scoped provider correlation and allows the same ID in another organization", async () => {
    const providerMessageId = `same-id-${randomUUID()}`;
    const first = await admin.from("messages").insert({
      organization_id: organizationAId,
      conversation_id: whatsappConversationId,
      direction: "inbound",
      content: "First message",
      provider: "meta_whatsapp_cloud",
      provider_message_id: providerMessageId,
    });
    const duplicate = await admin.from("messages").insert({
      organization_id: organizationAId,
      conversation_id: whatsappConversationId,
      direction: "inbound",
      content: "Duplicate message",
      provider: "meta_whatsapp_cloud",
      provider_message_id: providerMessageId,
    });
    const otherOrganization = await admin.from("messages").insert({
      organization_id: organizationBId,
      conversation_id: organizationBConversationId,
      direction: "inbound",
      content: "Other organization message",
      provider: "meta_whatsapp_cloud",
      provider_message_id: providerMessageId,
    });

    expect(first.error).toBeNull();
    expect(duplicate.error).not.toBeNull();
    expect(otherOrganization.error).toBeNull();
  });

  it("rejects cross-organization WhatsApp configuration references", async () => {
    const invalid = await admin.from("conversations").insert({
      organization_id: organizationAId,
      contact_id: contactAId,
      channel: "whatsapp",
      whatsapp_config_id: configBId,
      status: "open",
    });
    expect(invalid.error).not.toBeNull();
  });

  it("preserves one open WhatsApp conversation per contact and configuration while allowing closed history", async () => {
    const duplicateOpen = await admin.from("conversations").insert({
      organization_id: organizationAId,
      contact_id: contactAId,
      channel: "whatsapp",
      whatsapp_config_id: configAId,
      status: "open",
    });
    const closedHistory = await admin.from("conversations").insert({
      organization_id: organizationAId,
      contact_id: contactAId,
      channel: "whatsapp",
      whatsapp_config_id: configAId,
      status: "closed",
    });

    expect(duplicateOpen.error).not.toBeNull();
    expect(closedHistory.error).toBeNull();
  });

  it("rejects provider values outside the approved Phase 5.2 provider", async () => {
    const invalid = await admin.from("messages").insert({
      organization_id: organizationAId,
      conversation_id: whatsappConversationId,
      direction: "inbound",
      content: "Invalid provider",
      provider: "unknown_provider",
      provider_message_id: `unknown-${randomUUID()}`,
    });
    expect(invalid.error).not.toBeNull();
  });
});
