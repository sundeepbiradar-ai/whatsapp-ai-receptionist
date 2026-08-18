/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";

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

function client(key: string): SupabaseClient<Database> {
  return createClient<Database>(config!.url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

integrationDescribe("Phase 5.3 durable WhatsApp retry jobs", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let organizationAId: string;
  let organizationBId: string;
  let conversationAId: string;
  let conversationBId: string;
  const organizationIds: string[] = [];

  async function createMessage(
    organizationId: string,
    conversationId: string,
    deliveryStatus: string = "pending"
  ): Promise<string> {
    const inserted = await admin
      .from("messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        direction: "outbound",
        content: "Retry probe",
        provider: "meta_whatsapp_cloud",
        delivery_status: deliveryStatus,
        delivery_status_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    return inserted.data.id;
  }

  async function createJob(
    organizationId: string,
    messageId: string,
    overrides: Record<string, unknown> = {}
  ): Promise<string> {
    const inserted = await admin
      .from("whatsapp_send_jobs")
      .insert({
        organization_id: organizationId,
        message_id: messageId,
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
        ...overrides,
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    return inserted.data.id;
  }

  async function readJob(jobId: string) {
    const { data, error } = await admin
      .from("whatsapp_send_jobs")
      .select(
        "status, attempt_count, next_attempt_at, claimed_at, claim_expires_at, last_error_code, last_error_message"
      )
      .eq("id", jobId)
      .single();
    if (error) throw error;
    return data;
  }

  async function readMessage(messageId: string) {
    const { data, error } = await admin
      .from("messages")
      .select("delivery_status, provider_message_id, delivery_error_code")
      .eq("id", messageId)
      .single();
    if (error) throw error;
    return data;
  }

  function claimedIds(payload: unknown): string[] {
    const jobs = (payload as { jobs?: Array<{ job_id?: string }> } | null)?.jobs ?? [];
    return jobs.map((job) => String(job.job_id));
  }

  beforeAll(async () => {
    admin = client(config!.serviceRoleKey);
    anon = client(config!.anonKey);
    const runId = randomUUID();

    const organizations = await admin
      .from("organizations")
      .insert([
        { name: `Retry A ${runId}`, slug: `retry-a-${runId}` },
        { name: `Retry B ${runId}`, slug: `retry-b-${runId}` },
      ])
      .select("id, slug");
    if (organizations.error) throw organizations.error;
    organizationAId = organizations.data.find((row) => row.slug.startsWith("retry-a"))!.id;
    organizationBId = organizations.data.find((row) => row.slug.startsWith("retry-b"))!.id;
    organizationIds.push(organizationAId, organizationBId);

    const configs = await admin
      .from("organization_whatsapp_configs")
      .insert([
        {
          organization_id: organizationAId,
          provider: "meta_whatsapp_cloud",
          phone_number_id: `retry-phone-a-${runId}`,
          business_account_id: "retry-business-a",
        },
        {
          organization_id: organizationBId,
          provider: "meta_whatsapp_cloud",
          phone_number_id: `retry-phone-b-${runId}`,
          business_account_id: "retry-business-b",
        },
      ])
      .select("id, organization_id");
    if (configs.error) throw configs.error;

    const contacts = await admin
      .from("contacts")
      .insert([
        { organization_id: organizationAId, phone: "+14155550210", name: "Retry A" },
        { organization_id: organizationBId, phone: "+14155550211", name: "Retry B" },
      ])
      .select("id, organization_id");
    if (contacts.error) throw contacts.error;

    const conversations = await admin
      .from("conversations")
      .insert([
        {
          organization_id: organizationAId,
          contact_id: contacts.data.find((row) => row.organization_id === organizationAId)!.id,
          status: "open",
          channel: "whatsapp",
          whatsapp_config_id: configs.data.find((row) => row.organization_id === organizationAId)!
            .id,
        },
        {
          organization_id: organizationBId,
          contact_id: contacts.data.find((row) => row.organization_id === organizationBId)!.id,
          status: "open",
          channel: "whatsapp",
          whatsapp_config_id: configs.data.find((row) => row.organization_id === organizationBId)!
            .id,
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

  it("denies anonymous access to retry jobs by default", async () => {
    const messageId = await createMessage(organizationAId, conversationAId);
    await createJob(organizationAId, messageId);
    const selected = await anon.from("whatsapp_send_jobs").select("id");
    expect(selected.error ?? selected.data).not.toEqual(expect.arrayContaining([expect.anything()]));
    expect(selected.data ?? []).toHaveLength(0);

    const inserted = await anon
      .from("whatsapp_send_jobs")
      .insert({ organization_id: organizationAId, message_id: messageId });
    expect(inserted.error).not.toBeNull();
  });

  it("rejects a job referencing a message from another organization", async () => {
    const messageId = await createMessage(organizationAId, conversationAId);
    const { error } = await admin
      .from("whatsapp_send_jobs")
      .insert({ organization_id: organizationBId, message_id: messageId });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23503");
  });

  it("allows only one live job per message", async () => {
    const messageId = await createMessage(organizationAId, conversationAId);
    await createJob(organizationAId, messageId);
    const { error } = await admin
      .from("whatsapp_send_jobs")
      .insert({ organization_id: organizationAId, message_id: messageId });
    expect(error?.code).toBe("23505");
  });

  it("gives concurrent workers disjoint jobs and increments attempts once", async () => {
    const messageIds = await Promise.all(
      Array.from({ length: 6 }, () => createMessage(organizationAId, conversationAId))
    );
    const jobIds = await Promise.all(
      messageIds.map((messageId) => createJob(organizationAId, messageId))
    );

    const [first, second, third] = await Promise.all([
      admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 }),
      admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 }),
      admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 }),
    ]);

    const claimed = [
      ...claimedIds(first.data),
      ...claimedIds(second.data),
      ...claimedIds(third.data),
    ].filter((id) => jobIds.includes(id));
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(new Set(claimed)).toEqual(new Set(jobIds));

    for (const jobId of jobIds) {
      const job = await readJob(jobId);
      expect(job.status).toBe("processing");
      expect(job.attempt_count).toBe(1);
      expect(job.claim_expires_at).not.toBeNull();
    }
  });

  it("never claims a job whose message left the pending state", async () => {
    for (const status of ["unconfirmed", "sent", "delivered", "read", "failed"]) {
      const messageId = await createMessage(organizationAId, conversationAId, status);
      const jobId = await createJob(organizationAId, messageId);
      const claimed = await admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 });
      expect(claimedIds(claimed.data)).not.toContain(jobId);
      expect((await readJob(jobId)).status).toBe("pending");
    }
  });

  it("completes a claimed job and correlates the provider message id", async () => {
    const messageId = await createMessage(organizationAId, conversationAId);
    const jobId = await createJob(organizationAId, messageId);
    await admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 });

    const providerMessageId = `wamid-retry-${randomUUID()}`;
    const completed = await admin.rpc("complete_whatsapp_send_job", {
      target_job_id: jobId,
      target_provider_message_id: providerMessageId,
    });
    expect(completed.data).toMatchObject({ ok: true, outcome: "completed" });
    expect(await readJob(jobId)).toMatchObject({ status: "completed", claimed_at: null });
    expect(await readMessage(messageId)).toMatchObject({
      delivery_status: "sent",
      provider_message_id: providerMessageId,
    });
  });

  it("does not create a second message row when a retry completes", async () => {
    const messageId = await createMessage(organizationAId, conversationAId);
    const jobId = await createJob(organizationAId, messageId);
    const before = await admin
      .from("messages")
      .select("id")
      .eq("organization_id", organizationAId)
      .eq("conversation_id", conversationAId);
    await admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 });
    await admin.rpc("complete_whatsapp_send_job", {
      target_job_id: jobId,
      target_provider_message_id: `wamid-single-${randomUUID()}`,
    });
    const after = await admin
      .from("messages")
      .select("id")
      .eq("organization_id", organizationAId)
      .eq("conversation_id", conversationAId);
    expect(after.data?.length).toBe(before.data?.length);
  });

  it("reschedules a claimed job without touching the message", async () => {
    const messageId = await createMessage(organizationAId, conversationAId);
    const jobId = await createJob(organizationAId, messageId);
    await admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 });

    const nextAttemptAt = new Date(Date.now() + 60_000).toISOString();
    const rescheduled = await admin.rpc("reschedule_whatsapp_send_job", {
      target_job_id: jobId,
      target_next_attempt_at: nextAttemptAt,
      target_error_code: "whatsapp_provider_unavailable",
      target_error_message: "retryable",
    });
    expect(rescheduled.data).toMatchObject({ ok: true, outcome: "rescheduled" });
    expect(await readJob(jobId)).toMatchObject({
      status: "pending",
      attempt_count: 1,
      claimed_at: null,
      last_error_code: "whatsapp_provider_unavailable",
    });
    expect((await readMessage(messageId)).delivery_status).toBe("pending");
  });

  it("marks an exhausted job dead and the message failed", async () => {
    const messageId = await createMessage(organizationAId, conversationAId);
    const jobId = await createJob(organizationAId, messageId, { attempt_count: 4 });
    await admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 });

    const terminated = await admin.rpc("terminate_whatsapp_send_job", {
      target_job_id: jobId,
      target_message_status: "failed",
      target_error_code: "whatsapp_provider_unavailable",
      target_error_message: "retryable",
    });
    expect(terminated.data).toMatchObject({ ok: true, outcome: "dead" });
    expect(await readJob(jobId)).toMatchObject({ status: "dead", attempt_count: 5 });
    expect(await readMessage(messageId)).toMatchObject({
      delivery_status: "failed",
      delivery_error_code: "whatsapp_provider_unavailable",
    });
  });

  it("marks an ambiguous outcome unconfirmed and keeps it unclaimable", async () => {
    const messageId = await createMessage(organizationAId, conversationAId);
    const jobId = await createJob(organizationAId, messageId);
    await admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 });
    await admin.rpc("terminate_whatsapp_send_job", {
      target_job_id: jobId,
      target_message_status: "unconfirmed",
      target_error_code: "whatsapp_provider_network_failure",
      target_error_message: "ambiguous",
    });
    expect((await readMessage(messageId)).delivery_status).toBe("unconfirmed");

    const newJobId = await createJob(organizationAId, messageId);
    const claimed = await admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 });
    expect(claimedIds(claimed.data)).not.toContain(newJobId);
  });

  it("reaps an expired lease and retires it once attempts are spent", async () => {
    const releasableMessageId = await createMessage(organizationAId, conversationAId);
    const releasableJobId = await createJob(organizationAId, releasableMessageId, {
      status: "processing",
      attempt_count: 2,
      claimed_at: new Date(Date.now() - 600_000).toISOString(),
      claim_expires_at: new Date(Date.now() - 300_000).toISOString(),
    });
    const spentMessageId = await createMessage(organizationAId, conversationAId);
    const spentJobId = await createJob(organizationAId, spentMessageId, {
      status: "processing",
      attempt_count: 5,
      claimed_at: new Date(Date.now() - 600_000).toISOString(),
      claim_expires_at: new Date(Date.now() - 300_000).toISOString(),
    });

    const reaped = await admin.rpc("reap_whatsapp_send_job_claims");
    expect(reaped.data).toMatchObject({ ok: true });
    expect(await readJob(releasableJobId)).toMatchObject({
      status: "pending",
      claimed_at: null,
      claim_expires_at: null,
    });
    expect((await readJob(spentJobId)).status).toBe("dead");
  });

  it("does not regress a message that already reached a later delivery state", async () => {
    const messageId = await createMessage(organizationAId, conversationAId);
    const jobId = await createJob(organizationAId, messageId);
    await admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 });

    await admin
      .from("messages")
      .update({ delivery_status: "delivered", delivery_status_at: new Date().toISOString() })
      .eq("id", messageId);

    const completed = await admin.rpc("complete_whatsapp_send_job", {
      target_job_id: jobId,
      target_provider_message_id: `wamid-stale-${randomUUID()}`,
    });
    expect(completed.data).toMatchObject({ outcome: "message_not_pending" });
    expect(await readMessage(messageId)).toMatchObject({
      delivery_status: "delivered",
      provider_message_id: null,
    });
    expect((await readJob(jobId)).status).toBe("completed");
  });

  it("rejects terminal and reschedule operations on unclaimed jobs", async () => {
    const messageId = await createMessage(organizationAId, conversationAId);
    const jobId = await createJob(organizationAId, messageId);
    const rescheduled = await admin.rpc("reschedule_whatsapp_send_job", {
      target_job_id: jobId,
      target_next_attempt_at: new Date().toISOString(),
      target_error_code: "whatsapp_provider_unavailable",
      target_error_message: "retryable",
    });
    expect(rescheduled.data).toMatchObject({
      ok: false,
      error_code: "whatsapp_retry_job_not_claimed",
    });
    const terminated = await admin.rpc("terminate_whatsapp_send_job", {
      target_job_id: jobId,
      target_message_status: "failed",
      target_error_code: "whatsapp_provider_unavailable",
      target_error_message: "retryable",
    });
    expect(terminated.data).toMatchObject({
      ok: false,
      error_code: "whatsapp_retry_job_not_claimed",
    });
  });

  it("rejects an invalid terminal message status", async () => {
    const messageId = await createMessage(organizationAId, conversationAId);
    const jobId = await createJob(organizationAId, messageId);
    await admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 });
    const terminated = await admin.rpc("terminate_whatsapp_send_job", {
      target_job_id: jobId,
      target_message_status: "delivered",
      target_error_code: "whatsapp_provider_unavailable",
      target_error_message: "retryable",
    });
    expect(terminated.data).toMatchObject({
      ok: false,
      error_code: "whatsapp_retry_input_invalid",
    });
  });

  it("keeps retry jobs isolated per organization", async () => {
    const messageAId = await createMessage(organizationAId, conversationAId);
    const messageBId = await createMessage(organizationBId, conversationBId);
    const jobAId = await createJob(organizationAId, messageAId);
    const jobBId = await createJob(organizationBId, messageBId);

    await admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: 50 });
    await admin.rpc("complete_whatsapp_send_job", {
      target_job_id: jobAId,
      target_provider_message_id: `wamid-tenant-${randomUUID()}`,
    });

    expect((await readMessage(messageBId)).delivery_status).toBe("pending");
    expect((await readJob(jobBId)).status).toBe("processing");
  });

  it("rejects an invalid claim batch size", async () => {
    for (const size of [0, -1, 51]) {
      const claimed = await admin.rpc("claim_whatsapp_send_jobs", { target_batch_size: size });
      expect(claimed.data).toMatchObject({ ok: false, error_code: "whatsapp_retry_input_invalid" });
    }
  });

  it("does not expose worker-only functions to the anon or service role", async () => {
    const anonClaim = await anon.rpc("claim_whatsapp_send_jobs", { target_batch_size: 1 });
    expect(anonClaim.error).not.toBeNull();

    const messageId = await createMessage(organizationAId, conversationAId);
    const anonEnqueue = await anon.rpc("enqueue_whatsapp_send_job", {
      target_organization_id: organizationAId,
      target_message_id: messageId,
      target_next_attempt_at: new Date().toISOString(),
    });
    expect(anonEnqueue.error).not.toBeNull();

    // Only the cron role may trigger the worker invocation helper.
    const serviceInvoke = await admin.rpc("invoke_whatsapp_retry_worker");
    expect(serviceInvoke.error).not.toBeNull();
  });
});
