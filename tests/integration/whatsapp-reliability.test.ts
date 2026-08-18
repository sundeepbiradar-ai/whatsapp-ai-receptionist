/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";
import { processInboundWhatsAppMessage } from "@/lib/whatsapp/pipeline";
import { applyWhatsAppStatusEvent } from "@/lib/whatsapp/reliability";
import type { WhatsAppInboundMessageEvent, WhatsAppStatusEvent } from "@/lib/whatsapp/meta";

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

integrationDescribe("Phase 5.3 WhatsApp reliability", () => {
  let admin: SupabaseClient<Database>;
  let organizationAId: string;
  let organizationBId: string;
  let configAId: string;
  let configBId: string;
  let contactAId: string;
  let contactBId: string;
  let conversationAId: string;
  let conversationBId: string;
  const organizationIds: string[] = [];

  async function createOutboundMessage(
    organizationId: string,
    conversationId: string,
    providerMessageId: string
  ): Promise<string> {
    const inserted = await admin
      .from("messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        direction: "outbound",
        content: "Outbound reliability probe",
        provider: "meta_whatsapp_cloud",
        provider_message_id: providerMessageId,
        delivery_status: "pending",
        delivery_status_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    return inserted.data.id;
  }

  async function readMessage(messageId: string) {
    const { data, error } = await admin
      .from("messages")
      .select("delivery_status, delivery_status_at, delivery_error_code, delivery_error_message")
      .eq("id", messageId)
      .single();
    if (error) throw error;
    return data;
  }

  function statusEvent(overrides: Partial<WhatsAppStatusEvent> = {}): WhatsAppStatusEvent {
    return {
      kind: "status",
      provider: "meta_whatsapp_cloud",
      organizationId: organizationAId,
      configId: configAId,
      phoneNumberId: "reliability-phone-a",
      providerMessageId: "wamid-reliability",
      status: "sent",
      timestamp: "2099-01-01T10:00:00.000Z",
      errorCode: null,
      errorMessage: null,
      ...overrides,
    };
  }

  beforeAll(async () => {
    admin = adminClient();
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = config!.url;
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = config!.serviceRoleKey;
    const runId = randomUUID();

    const organizations = await admin
      .from("organizations")
      .insert([
        { name: `Reliability A ${runId}`, slug: `reliability-a-${runId}` },
        { name: `Reliability B ${runId}`, slug: `reliability-b-${runId}` },
      ])
      .select("id, slug");
    if (organizations.error) throw organizations.error;
    organizationAId = organizations.data.find((row) => row.slug.startsWith("reliability-a"))!.id;
    organizationBId = organizations.data.find((row) => row.slug.startsWith("reliability-b"))!.id;
    organizationIds.push(organizationAId, organizationBId);

    const configs = await admin
      .from("organization_whatsapp_configs")
      .insert([
        {
          organization_id: organizationAId,
          provider: "meta_whatsapp_cloud",
          phone_number_id: `reliability-phone-a-${runId}`,
          business_account_id: "reliability-business-a",
        },
        {
          organization_id: organizationBId,
          provider: "meta_whatsapp_cloud",
          phone_number_id: `reliability-phone-b-${runId}`,
          business_account_id: "reliability-business-b",
        },
      ])
      .select("id, organization_id");
    if (configs.error) throw configs.error;
    configAId = configs.data.find((row) => row.organization_id === organizationAId)!.id;
    configBId = configs.data.find((row) => row.organization_id === organizationBId)!.id;

    const contacts = await admin
      .from("contacts")
      .insert([
        { organization_id: organizationAId, phone: "+14155550190", name: "Reliability A" },
        { organization_id: organizationBId, phone: "+14155550191", name: "Reliability B" },
      ])
      .select("id, organization_id");
    if (contacts.error) throw contacts.error;
    contactAId = contacts.data.find((row) => row.organization_id === organizationAId)!.id;
    contactBId = contacts.data.find((row) => row.organization_id === organizationBId)!.id;

    const conversations = await admin
      .from("conversations")
      .insert([
        {
          organization_id: organizationAId,
          contact_id: contactAId,
          status: "open",
          channel: "whatsapp",
          whatsapp_config_id: configAId,
        },
        {
          organization_id: organizationBId,
          contact_id: contactBId,
          status: "open",
          channel: "whatsapp",
          whatsapp_config_id: configBId,
        },
      ])
      .select("id, organization_id");
    if (conversations.error) throw conversations.error;
    conversationAId = conversations.data.find((row) => row.organization_id === organizationAId)!.id;
    conversationBId = conversations.data.find((row) => row.organization_id === organizationBId)!.id;
  });

  afterAll(async () => {
    if (organizationIds.length > 0)
      await admin.from("organizations").delete().in("id", organizationIds);
  });

  it("applies sent, delivered and read in order", async () => {
    const providerMessageId = `wamid-order-${randomUUID()}`;
    const messageId = await createOutboundMessage(
      organizationAId,
      conversationAId,
      providerMessageId
    );

    for (const [status, expected] of [
      ["sent", "sent"],
      ["delivered", "delivered"],
      ["read", "read"],
    ] as const) {
      const result = await applyWhatsAppStatusEvent(
        statusEvent({ providerMessageId, status, timestamp: "2099-01-01T10:00:00.000Z" })
      );
      expect(result.outcome).toBe("applied");
      expect((await readMessage(messageId)).delivery_status).toBe(expected);
    }
  });

  it("never regresses on out-of-order or duplicate status events", async () => {
    const providerMessageId = `wamid-regress-${randomUUID()}`;
    const messageId = await createOutboundMessage(
      organizationAId,
      conversationAId,
      providerMessageId
    );
    await applyWhatsAppStatusEvent(statusEvent({ providerMessageId, status: "read" }));

    for (const status of ["delivered", "sent"] as const) {
      const result = await applyWhatsAppStatusEvent(statusEvent({ providerMessageId, status }));
      expect(result.outcome).toBe("ignored_stale");
    }
    const duplicate = await applyWhatsAppStatusEvent(
      statusEvent({ providerMessageId, status: "read" })
    );
    expect(duplicate.outcome).toBe("ignored_duplicate");
    expect((await readMessage(messageId)).delivery_status).toBe("read");
  });

  it("persists a failed delivery with provider error metadata and keeps it terminal", async () => {
    const providerMessageId = `wamid-failed-${randomUUID()}`;
    const messageId = await createOutboundMessage(
      organizationAId,
      conversationAId,
      providerMessageId
    );
    const failed = await applyWhatsAppStatusEvent(
      statusEvent({
        providerMessageId,
        status: "failed",
        errorCode: "131047",
        errorMessage: "Re-engagement message",
      })
    );
    expect(failed.outcome).toBe("applied");
    expect(await readMessage(messageId)).toMatchObject({
      delivery_status: "failed",
      delivery_error_code: "131047",
      delivery_error_message: "Re-engagement message",
    });

    const repeated = await applyWhatsAppStatusEvent(
      statusEvent({ providerMessageId, status: "failed" })
    );
    expect(repeated.outcome).toBe("ignored_duplicate");
    const afterDelivered = await applyWhatsAppStatusEvent(
      statusEvent({ providerMessageId, status: "delivered" })
    );
    expect(afterDelivered.outcome).toBe("ignored_terminal");
    expect((await readMessage(messageId)).delivery_status).toBe("failed");
  });

  it("does not let a late failure regress a delivered message", async () => {
    const providerMessageId = `wamid-late-failure-${randomUUID()}`;
    const messageId = await createOutboundMessage(
      organizationAId,
      conversationAId,
      providerMessageId
    );
    await applyWhatsAppStatusEvent(statusEvent({ providerMessageId, status: "delivered" }));
    const late = await applyWhatsAppStatusEvent(
      statusEvent({ providerMessageId, status: "failed", errorCode: "131026" })
    );
    expect(late.outcome).toBe("ignored_stale");
    expect(await readMessage(messageId)).toMatchObject({
      delivery_status: "delivered",
      delivery_error_code: null,
    });
  });

  it("ignores an unknown provider message id without mutating other messages", async () => {
    const providerMessageId = `wamid-known-${randomUUID()}`;
    const messageId = await createOutboundMessage(
      organizationAId,
      conversationAId,
      providerMessageId
    );
    const result = await applyWhatsAppStatusEvent(
      statusEvent({ providerMessageId: `wamid-unknown-${randomUUID()}`, status: "read" })
    );
    expect(result.outcome).toBe("unknown_message");
    expect(result.messageId).toBeNull();
    expect((await readMessage(messageId)).delivery_status).toBe("pending");
  });

  it("keeps the same provider message id isolated across organizations", async () => {
    const providerMessageId = `wamid-shared-${randomUUID()}`;
    const messageAId = await createOutboundMessage(
      organizationAId,
      conversationAId,
      providerMessageId
    );
    const messageBId = await createOutboundMessage(
      organizationBId,
      conversationBId,
      providerMessageId
    );

    await applyWhatsAppStatusEvent(statusEvent({ providerMessageId, status: "read" }));
    expect((await readMessage(messageAId)).delivery_status).toBe("read");
    expect((await readMessage(messageBId)).delivery_status).toBe("pending");
  });

  it("rejects a status event whose configuration belongs to another organization", async () => {
    const providerMessageId = `wamid-cross-${randomUUID()}`;
    const messageId = await createOutboundMessage(
      organizationAId,
      conversationAId,
      providerMessageId
    );
    await expect(
      applyWhatsAppStatusEvent(
        statusEvent({ providerMessageId, configId: configBId, status: "read" })
      )
    ).rejects.toMatchObject({ code: "whatsapp_tenant_mismatch" });
    expect((await readMessage(messageId)).delivery_status).toBe("pending");
  });

  it("cannot mutate another organization's message using a foreign organization id", async () => {
    const providerMessageId = `wamid-foreign-${randomUUID()}`;
    const messageId = await createOutboundMessage(
      organizationAId,
      conversationAId,
      providerMessageId
    );
    const result = await applyWhatsAppStatusEvent(
      statusEvent({
        providerMessageId,
        organizationId: organizationBId,
        configId: configBId,
        status: "read",
      })
    );
    expect(result.outcome).toBe("unknown_message");
    expect((await readMessage(messageId)).delivery_status).toBe("pending");
  });

  it("never applies a status to an inbound message", async () => {
    const providerMessageId = `wamid-inbound-${randomUUID()}`;
    const inserted = await admin
      .from("messages")
      .insert({
        organization_id: organizationAId,
        conversation_id: conversationAId,
        direction: "inbound",
        content: "Inbound probe",
        provider: "meta_whatsapp_cloud",
        provider_message_id: providerMessageId,
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    const result = await applyWhatsAppStatusEvent(
      statusEvent({ providerMessageId, status: "read" })
    );
    expect(result.outcome).toBe("ignored_non_outbound");
    expect((await readMessage(inserted.data.id)).delivery_status).toBeNull();
  });

  it("converges concurrent duplicate status events on a single state", async () => {
    const providerMessageId = `wamid-concurrent-status-${randomUUID()}`;
    const messageId = await createOutboundMessage(
      organizationAId,
      conversationAId,
      providerMessageId
    );
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        applyWhatsAppStatusEvent(statusEvent({ providerMessageId, status: "delivered" }))
      )
    );
    expect(outcomes.filter((result) => result.outcome === "applied")).toHaveLength(1);
    expect(outcomes.filter((result) => result.outcome === "ignored_duplicate")).toHaveLength(4);
    expect((await readMessage(messageId)).delivery_status).toBe("delivered");
  });

  it("processes concurrent duplicate inbound deliveries exactly once", async () => {
    const providerMessageId = `wamid-concurrent-inbound-${randomUUID()}`;
    const inbound: WhatsAppInboundMessageEvent = {
      kind: "message",
      provider: "meta_whatsapp_cloud",
      organizationId: organizationAId,
      configId: configAId,
      phoneNumberId: "reliability-phone-a",
      businessAccountId: "reliability-business-a",
      providerMessageId,
      senderPhone: "+14155550192",
      recipientPhoneNumberId: "reliability-phone-a",
      timestamp: "2099-02-01T10:00:00.000Z",
      messageType: "text",
      text: "Concurrent inbound",
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => processInboundWhatsAppMessage(inbound))
    );
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(results.filter((result) => result.duplicate)).toHaveLength(4);
    expect(new Set(results.map((result) => result.contactId)).size).toBe(1);
    expect(new Set(results.map((result) => result.conversationId)).size).toBe(1);

    const messages = await admin
      .from("messages")
      .select("id")
      .eq("organization_id", organizationAId)
      .eq("provider", "meta_whatsapp_cloud")
      .eq("provider_message_id", providerMessageId);
    if (messages.error) throw messages.error;
    expect(messages.data).toHaveLength(1);

    const contacts = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationAId)
      .eq("phone", "+14155550192");
    if (contacts.error) throw contacts.error;
    expect(contacts.data).toHaveLength(1);
  });

  it("rejects an invalid delivery status value at the database boundary", async () => {
    const providerMessageId = `wamid-invalid-${randomUUID()}`;
    const messageId = await createOutboundMessage(
      organizationAId,
      conversationAId,
      providerMessageId
    );
    const { error } = await admin
      .from("messages")
      .update({ delivery_status: "queued", delivery_status_at: new Date().toISOString() })
      .eq("id", messageId);
    expect(error).not.toBeNull();
  });

  it("keeps legacy messages without provider correlation valid", async () => {
    const inserted = await admin
      .from("messages")
      .insert({
        organization_id: organizationAId,
        conversation_id: conversationAId,
        direction: "outbound",
        content: "Legacy internal message",
      })
      .select("id, provider, provider_message_id, delivery_status, delivery_status_at")
      .single();
    if (inserted.error) throw inserted.error;
    expect(inserted.data).toMatchObject({
      provider: null,
      provider_message_id: null,
      delivery_status: null,
      delivery_status_at: null,
    });
  });
});
