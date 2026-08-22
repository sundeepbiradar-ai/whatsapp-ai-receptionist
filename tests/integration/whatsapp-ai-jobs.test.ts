/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";
import { applyWhatsAppStatusEvent } from "@/lib/whatsapp/reliability";

vi.mock("server-only", () => ({}));

const url = process.env["SUPABASE_TEST_URL"];
const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
const serviceRoleKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const config = url && anonKey && serviceRoleKey ? { url, anonKey, serviceRoleKey } : null;
const integrationDescribe = config ? describe : describe.skip;

type Fixture = {
  organizationId: string;
  otherOrganizationId: string;
  configId: string;
  otherConfigId: string;
  conversationId: string;
  otherConversationId: string;
  inboundMessageId: string;
  outboundMessageId: string;
};

function client(key: string): SupabaseClient<Database> {
  return createClient<Database>(config!.url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

integrationDescribe("WhatsApp AI job durability and ownership", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let fixture: Fixture;
  const organizationIds: string[] = [];

  async function createFixture(): Promise<Fixture> {
    const runId = randomUUID();
    const organizations = await admin
      .from("organizations")
      .insert([
        { name: `AI jobs A ${runId}`, slug: `ai-jobs-a-${runId}` },
        { name: `AI jobs B ${runId}`, slug: `ai-jobs-b-${runId}` },
      ])
      .select("id, slug");
    if (organizations.error) throw organizations.error;
    const organizationId = organizations.data.find((row) => row.slug.startsWith("ai-jobs-a"))!.id;
    const otherOrganizationId = organizations.data.find((row) => row.slug.startsWith("ai-jobs-b"))!.id;
    organizationIds.push(organizationId, otherOrganizationId);

    const configs = await admin
      .from("organization_whatsapp_configs")
      .insert([
        { organization_id: organizationId, provider: "meta_whatsapp_cloud", phone_number_id: `ai-phone-a-${runId}`, business_account_id: "ai-business-a" },
        { organization_id: otherOrganizationId, provider: "meta_whatsapp_cloud", phone_number_id: `ai-phone-b-${runId}`, business_account_id: "ai-business-b" },
      ])
      .select("id, organization_id");
    if (configs.error) throw configs.error;
    const configId = configs.data.find((row) => row.organization_id === organizationId)!.id;
    const otherConfigId = configs.data.find((row) => row.organization_id === otherOrganizationId)!.id;

    const contacts = await admin
      .from("contacts")
      .insert([
        { organization_id: organizationId, phone: `+1415555${runId.slice(0, 4)}`, name: "AI jobs A" },
        { organization_id: otherOrganizationId, phone: `+1415556${runId.slice(0, 4)}`, name: "AI jobs B" },
      ])
      .select("id, organization_id");
    if (contacts.error) throw contacts.error;
    const contactId = contacts.data.find((row) => row.organization_id === organizationId)!.id;
    const otherContactId = contacts.data.find((row) => row.organization_id === otherOrganizationId)!.id;

    const conversations = await admin
      .from("conversations")
      .insert([
        { organization_id: organizationId, contact_id: contactId, status: "open", channel: "whatsapp", whatsapp_config_id: configId },
        { organization_id: otherOrganizationId, contact_id: otherContactId, status: "open", channel: "whatsapp", whatsapp_config_id: otherConfigId },
      ])
      .select("id, organization_id");
    if (conversations.error) throw conversations.error;
    const conversationId = conversations.data.find((row) => row.organization_id === organizationId)!.id;
    const otherConversationId = conversations.data.find((row) => row.organization_id === otherOrganizationId)!.id;

    const inbound = await admin
      .from("messages")
      .insert({ organization_id: organizationId, conversation_id: conversationId, direction: "inbound", content: "Hello", provider: "meta_whatsapp_cloud", provider_message_id: `wamid-ai-${runId}` })
      .select("id")
      .single();
    if (inbound.error) throw inbound.error;
    const outbound = await admin
      .from("messages")
      .insert({ organization_id: organizationId, conversation_id: conversationId, direction: "outbound", content: "Reply", provider: "meta_whatsapp_cloud", delivery_status: "pending", delivery_status_at: new Date().toISOString() })
      .select("id")
      .single();
    if (outbound.error) throw outbound.error;
    return { organizationId, otherOrganizationId, configId, otherConfigId, conversationId, otherConversationId, inboundMessageId: inbound.data.id, outboundMessageId: outbound.data.id };
  }

  async function enqueue(inboundMessageId = fixture.inboundMessageId, conversationId = fixture.conversationId, organizationId = fixture.organizationId) {
    return admin.rpc("enqueue_whatsapp_ai_job", {
      target_organization_id: organizationId,
      target_inbound_message_id: inboundMessageId,
      target_conversation_id: conversationId,
    });
  }

  async function jobRows() {
    return admin.from("whatsapp_ai_jobs").select("id, status, attempt_count, claimed_at, claim_expires_at, inbound_message_id, conversation_id").eq("organization_id", fixture.organizationId);
  }

  beforeAll(async () => {
    admin = client(config!.serviceRoleKey);
    anon = client(config!.anonKey);
    fixture = await createFixture();
  });

  afterAll(async () => {
    if (organizationIds.length) await admin.from("organizations").delete().in("id", organizationIds);
  });

  it("creates one AI job per inbound message atomically at the job boundary", async () => {
    const first = await enqueue();
    const second = await enqueue();
    expect(first.data).toMatchObject({ ok: true });
    expect(second.data).toMatchObject({ ok: true, job_id: first.data && (first.data as { job_id: string }).job_id });
    expect((await jobRows()).data).toHaveLength(1);
  });

  it("claims an AI job once under concurrent workers", async () => {
    const created = await enqueue();
    const jobId = (created.data as { job_id: string }).job_id;
    const claims = await Promise.all([
      admin.rpc("claim_whatsapp_ai_jobs", { target_batch_size: 1 }),
      admin.rpc("claim_whatsapp_ai_jobs", { target_batch_size: 1 }),
    ]);
    const claimedIds = claims.flatMap((claim) => ((claim.data as { jobs?: Array<{ job_id: string }> })?.jobs ?? []).map((job) => job.job_id));
    expect(claimedIds.filter((id) => id === jobId)).toHaveLength(1);
    expect((await jobRows()).data?.find((row) => row.id === jobId)).toMatchObject({ status: "processing", attempt_count: 1 });
  });

  it("reclaims an expired lease and never reclaims a completed job", async () => {
    const expired = await enqueue();
    const expiredId = (expired.data as { job_id: string }).job_id;
    await admin.rpc("claim_whatsapp_ai_jobs", { target_batch_size: 1 });
    await admin.from("whatsapp_ai_jobs").update({ claim_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", expiredId);
    await admin.rpc("reap_whatsapp_ai_job_claims");
    const reclaimed = await admin.rpc("claim_whatsapp_ai_jobs", { target_batch_size: 1 });
    expect(((reclaimed.data as { jobs?: Array<{ job_id: string }> }).jobs ?? []).map((job) => job.job_id)).toContain(expiredId);

    await admin.rpc("complete_whatsapp_ai_job", { target_job_id: expiredId });
    const again = await admin.rpc("claim_whatsapp_ai_jobs", { target_batch_size: 1 });
    expect(((again.data as { jobs?: Array<{ job_id: string }> }).jobs ?? []).map((job) => job.job_id)).not.toContain(expiredId);
  });

  it("rejects tenant and conversation mismatches", async () => {
    expect((await enqueue(fixture.inboundMessageId, fixture.conversationId, fixture.otherOrganizationId)).data).toMatchObject({ ok: false });
    expect((await enqueue(fixture.inboundMessageId, fixture.otherConversationId)).data).toMatchObject({ ok: false });
  });

  it("denies direct anonymous AI-job access", async () => {
    const selected = await anon.from("whatsapp_ai_jobs").select("id");
    expect(selected.error).not.toBeNull();
    const inserted = await anon.from("whatsapp_ai_jobs").insert({ organization_id: fixture.organizationId, inbound_message_id: fixture.inboundMessageId, conversation_id: fixture.conversationId });
    expect(inserted.error).not.toBeNull();
  });

  it("allows one source-keyed outbound reply and rejects invalid source links", async () => {
    const valid = await admin.from("messages").insert({ organization_id: fixture.organizationId, conversation_id: fixture.conversationId, direction: "outbound", content: "One reply", provider: "meta_whatsapp_cloud", source_inbound_message_id: fixture.inboundMessageId, delivery_status: "pending", delivery_status_at: new Date().toISOString() });
    expect(valid.error).toBeNull();
    const duplicate = await admin.from("messages").insert({ organization_id: fixture.organizationId, conversation_id: fixture.conversationId, direction: "outbound", content: "Second reply", provider: "meta_whatsapp_cloud", source_inbound_message_id: fixture.inboundMessageId, delivery_status: "pending", delivery_status_at: new Date().toISOString() });
    expect(duplicate.error).not.toBeNull();
    const outboundSource = await admin.from("messages").insert({ organization_id: fixture.organizationId, conversation_id: fixture.conversationId, direction: "outbound", content: "Bad source", provider: "meta_whatsapp_cloud", source_inbound_message_id: fixture.outboundMessageId, delivery_status: "pending", delivery_status_at: new Date().toISOString() });
    expect(outboundSource.error).not.toBeNull();
    const crossTenant = await admin.from("messages").insert({ organization_id: fixture.otherOrganizationId, conversation_id: fixture.otherConversationId, direction: "outbound", content: "Cross tenant", provider: "meta_whatsapp_cloud", source_inbound_message_id: fixture.inboundMessageId, delivery_status: "pending", delivery_status_at: new Date().toISOString() });
    expect(crossTenant.error).not.toBeNull();
  });

  it("updates the same source-keyed outbound row through status callbacks", async () => {
    const providerMessageId = `wamid-status-${randomUUID()}`;
    const inserted = await admin.from("messages").insert({ organization_id: fixture.organizationId, conversation_id: fixture.conversationId, direction: "outbound", content: "Status reply", provider: "meta_whatsapp_cloud", provider_message_id: providerMessageId, delivery_status: "sent", delivery_status_at: new Date().toISOString() }).select("id").single();
    if (inserted.error) throw inserted.error;
    const statusEvent = (status: "delivered" | "read") => ({ kind: "status" as const, provider: "meta_whatsapp_cloud" as const, organizationId: fixture.organizationId, configId: fixture.configId, phoneNumberId: "unused", businessAccountId: "unused", providerMessageId, status, timestamp: "2099-01-01T10:00:00.000Z", errorCode: null, errorMessage: null });
    await applyWhatsAppStatusEvent(statusEvent("delivered"));
    await applyWhatsAppStatusEvent(statusEvent("read"));
    const row = await admin.from("messages").select("id, provider_message_id, delivery_status").eq("id", inserted.data.id).single();
    expect(row.data).toMatchObject({ id: inserted.data.id, provider_message_id: providerMessageId, delivery_status: "read" });
  });
});
