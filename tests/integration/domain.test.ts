/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database";

type Config = { url: string; anonKey: string; serviceRoleKey: string };
type UserFixture = { id: string; email: string; password: string };

type Fixture = {
  userA: UserFixture;
  userB: UserFixture;
  organizationAId: string;
  organizationBId: string;
  contactAId: string;
  contactBId: string;
  conversationAId: string;
  conversationBId: string;
};

function loadConfig(): Config | null {
  const url = process.env["SUPABASE_TEST_URL"];
  const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
  const serviceRoleKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
  return url && anonKey && serviceRoleKey ? { url, anonKey, serviceRoleKey } : null;
}

const config = loadConfig();
const integrationDescribe = config ? describe : describe.skip;

function anonClient(configValue: Config): SupabaseClient<Database> {
  return createClient<Database>(configValue.url, configValue.anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function adminClient(configValue: Config): SupabaseClient<Database> {
  return createClient<Database>(configValue.url, configValue.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function createUser(
  admin: SupabaseClient<Database>,
  label: string,
  runId: string
): Promise<UserFixture> {
  const email = `domain-${label}-${runId}@example.com`;
  const password = `Domain-${randomUUID()}-A9!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw error ?? new Error(`Could not create ${label}`);
  }
  return { id: data.user.id, email, password };
}

async function signIn(client: SupabaseClient<Database>, user: UserFixture): Promise<void> {
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
}

integrationDescribe("Phase 3.2 runtime domain security", () => {
  if (!config) return;

  let admin: SupabaseClient<Database>;
  let userAClient: SupabaseClient<Database>;
  let userBClient: SupabaseClient<Database>;
  let fixture: Fixture;
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    admin = adminClient(config);
    userAClient = anonClient(config);
    userBClient = anonClient(config);
    const runId = randomUUID();
    const userA = await createUser(admin, "a", runId);
    const userB = await createUser(admin, "b", runId);
    userIds.push(userA.id, userB.id);

    const orgA = await admin.from("organizations").insert({ name: `Domain A ${runId}`, slug: `domain-a-${runId}` }).select("id").single();
    const orgB = await admin.from("organizations").insert({ name: `Domain B ${runId}`, slug: `domain-b-${runId}` }).select("id").single();
    if (orgA.error || orgB.error) throw orgA.error ?? orgB.error;
    organizationIds.push(orgA.data.id, orgB.data.id);

    const memberships = await admin.from("organization_members").insert([
      { organization_id: orgA.data.id, user_id: userA.id, role: "member" },
      { organization_id: orgB.data.id, user_id: userB.id, role: "member" },
    ]);
    if (memberships.error) throw memberships.error;

    const profiles = await admin.from("profiles").select("id").in("id", userIds);
    if (profiles.error || profiles.data.length !== 2) throw profiles.error ?? new Error("Missing profiles");

    const contactA = await admin.from("contacts").insert({ organization_id: orgA.data.id, phone: "+10000000001", name: "Contact A" }).select("id").single();
    const contactB = await admin.from("contacts").insert({ organization_id: orgB.data.id, phone: "+10000000001", name: "Contact B" }).select("id").single();
    if (contactA.error || contactB.error) throw contactA.error ?? contactB.error;

    const conversationA = await admin.from("conversations").insert({ organization_id: orgA.data.id, contact_id: contactA.data.id, status: "open" }).select("id").single();
    const conversationB = await admin.from("conversations").insert({ organization_id: orgB.data.id, contact_id: contactB.data.id, status: "open" }).select("id").single();
    if (conversationA.error || conversationB.error) throw conversationA.error ?? conversationB.error;

    fixture = {
      userA,
      userB,
      organizationAId: orgA.data.id,
      organizationBId: orgB.data.id,
      contactAId: contactA.data.id,
      contactBId: contactB.data.id,
      conversationAId: conversationA.data.id,
      conversationBId: conversationB.data.id,
    };

    await signIn(userAClient, userA);
    await signIn(userBClient, userB);
  });

  afterAll(async () => {
    if (organizationIds.length) await admin.from("organizations").delete().in("id", organizationIds);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  });

  it("allows members to read only their tenant contacts", async () => {
    const own = await userAClient.from("contacts").select("id").eq("id", fixture.contactAId);
    const other = await userAClient.from("contacts").select("id").eq("id", fixture.contactBId);
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
    expect(other.error).toBeNull();
    expect(other.data).toHaveLength(0);
  });

  it("blocks cross-tenant contact writes and allows same phone in another tenant", async () => {
    const insert = await userAClient.from("contacts").insert({ organization_id: fixture.organizationBId, phone: "+10000000002", name: "Blocked" });
    const update = await userAClient.from("contacts").update({ name: "Blocked" }).eq("id", fixture.contactBId).select("id");
    const remove = await userAClient.from("contacts").delete().eq("id", fixture.contactBId).select("id");
    const duplicate = await admin.from("contacts").insert({ organization_id: fixture.organizationAId, phone: "+10000000001", name: "Duplicate" });
    const samePhoneOtherTenant = await admin.from("contacts").insert({ organization_id: fixture.organizationBId, phone: "+10000000003", name: "Allowed" }).select("id").single();

    expect(insert.error).not.toBeNull();
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);
    expect(remove.error).toBeNull();
    expect(remove.data).toHaveLength(0);
    expect(duplicate.error).not.toBeNull();
    expect(samePhoneOtherTenant.error).toBeNull();
    if (samePhoneOtherTenant.data) await admin.from("contacts").delete().eq("id", samePhoneOtherTenant.data.id);
  });

  it("blocks cross-tenant conversation and message relationships", async () => {
    const conversation = await userAClient.from("conversations").insert({ organization_id: fixture.organizationAId, contact_id: fixture.contactBId, status: "open" });
    const message = await userAClient.from("messages").insert({ organization_id: fixture.organizationAId, conversation_id: fixture.conversationBId, direction: "inbound", content: "Blocked" });

    expect(conversation.error).not.toBeNull();
    expect(message.error).not.toBeNull();
  });

  it("blocks cross-tenant appointment relationships and invalid time ranges", async () => {
    const contactMismatch = await userAClient.from("appointments").insert({
      organization_id: fixture.organizationAId,
      contact_id: fixture.contactBId,
      starts_at: "2026-01-01T10:00:00Z",
      ends_at: "2026-01-01T11:00:00Z",
      status: "pending",
    });
    const conversationMismatch = await userAClient.from("appointments").insert({
      organization_id: fixture.organizationAId,
      contact_id: fixture.contactAId,
      conversation_id: fixture.conversationBId,
      starts_at: "2026-01-01T10:00:00Z",
      ends_at: "2026-01-01T11:00:00Z",
      status: "pending",
    });
    const invalidTime = await userAClient.from("appointments").insert({
      organization_id: fixture.organizationAId,
      contact_id: fixture.contactAId,
      starts_at: "2026-01-01T11:00:00Z",
      ends_at: "2026-01-01T10:00:00Z",
      status: "pending",
    });

    expect(contactMismatch.error).not.toBeNull();
    expect(conversationMismatch.error).not.toBeNull();
    expect(invalidTime.error).not.toBeNull();
  });

  it("allows members to read own conversations and messages only", async () => {
    const ownConversation = await userAClient.from("conversations").select("id").eq("id", fixture.conversationAId);
    const otherConversation = await userAClient.from("conversations").select("id").eq("id", fixture.conversationBId);
    const message = await admin.from("messages").insert({ organization_id: fixture.organizationAId, conversation_id: fixture.conversationAId, direction: "inbound", content: "Hello" }).select("id").single();
    if (message.error) throw message.error;
    const ownMessage = await userAClient.from("messages").select("id").eq("id", message.data.id);
    const anonymous = anonClient(config);
    const anonymousRead = await anonymous.from("conversations").select("id").eq("id", fixture.conversationAId);

    expect(ownConversation.error).toBeNull();
    expect(ownConversation.data).toHaveLength(1);
    expect(otherConversation.error).toBeNull();
    expect(otherConversation.data).toHaveLength(0);
    expect(ownMessage.error).toBeNull();
    expect(ownMessage.data).toHaveLength(1);
    expect(anonymousRead.error).toBeNull();
    expect(anonymousRead.data).toHaveLength(0);
    await admin.from("messages").delete().eq("id", message.data.id);
  });

  it("allows an authorized member to change conversation status only in their tenant", async () => {
    const ownUpdate = await userAClient
      .from("conversations")
      .update({ status: "closed" })
      .eq("id", fixture.conversationAId)
      .select("status")
      .single();
    const otherUpdate = await userAClient
      .from("conversations")
      .update({ status: "closed" })
      .eq("id", fixture.conversationBId)
      .select("status");

    expect(ownUpdate.error).toBeNull();
    expect(ownUpdate.data?.status).toBe("closed");
    expect(otherUpdate.error).toBeNull();
    expect(otherUpdate.data).toHaveLength(0);
  });
});
