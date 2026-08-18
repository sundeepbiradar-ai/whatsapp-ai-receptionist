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

function client(key: string): SupabaseClient<Database> {
  return createClient<Database>(config!.url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

integrationDescribe("Phase 7 business configuration RLS", () => {
  let admin: SupabaseClient<Database>;
  let ownerA: SupabaseClient<Database>;
  let adminA: SupabaseClient<Database>;
  let memberA: SupabaseClient<Database>;
  let ownerB: SupabaseClient<Database>;
  let organizationAId: string;
  let organizationBId: string;
  let whatsAppConfigAId: string;
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  async function createUserClient(
    label: string,
    runId: string,
    organizationId: string,
    role: "owner" | "admin" | "member"
  ): Promise<SupabaseClient<Database>> {
    const email = `bizcfg-${label}-${runId}@example.com`;
    const password = `Bizcfg-${randomUUID()}-A9!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("user");
    userIds.push(created.data.user.id);
    const membership = await admin
      .from("organization_members")
      .insert({ organization_id: organizationId, user_id: created.data.user.id, role });
    if (membership.error) throw membership.error;
    const authed = client(config!.anonKey);
    const signIn = await authed.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    return authed;
  }

  beforeAll(async () => {
    admin = client(config!.serviceRoleKey);
    const runId = randomUUID();

    const organizations = await admin
      .from("organizations")
      .insert([
        { name: `Bizcfg A ${runId}`, slug: `bizcfg-a-${runId}` },
        { name: `Bizcfg B ${runId}`, slug: `bizcfg-b-${runId}` },
      ])
      .select("id, slug");
    if (organizations.error) throw organizations.error;
    organizationAId = organizations.data.find((row) => row.slug.startsWith("bizcfg-a"))!.id;
    organizationBId = organizations.data.find((row) => row.slug.startsWith("bizcfg-b"))!.id;
    organizationIds.push(organizationAId, organizationBId);

    const whatsAppConfig = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationAId,
        provider: "meta_whatsapp_cloud",
        phone_number_id: `bizcfg-phone-${runId}`,
        business_account_id: "bizcfg-business",
      })
      .select("id")
      .single();
    if (whatsAppConfig.error) throw whatsAppConfig.error;
    whatsAppConfigAId = whatsAppConfig.data.id;

    const secretRef = await admin.from("organization_whatsapp_secret_refs").insert({
      config_id: whatsAppConfigAId,
      access_token_secret_id: randomUUID(),
    });
    if (secretRef.error) throw secretRef.error;

    ownerA = await createUserClient("owner-a", runId, organizationAId, "owner");
    adminA = await createUserClient("admin-a", runId, organizationAId, "admin");
    memberA = await createUserClient("member-a", runId, organizationAId, "member");
    ownerB = await createUserClient("owner-b", runId, organizationBId, "owner");
  });

  afterAll(async () => {
    if (organizationIds.length > 0)
      await admin.from("organizations").delete().in("id", organizationIds);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  });

  it("lets an owner update the business profile", async () => {
    const { data, error } = await ownerA
      .from("organizations")
      .update({ description: "Owner set this", public_email: "hello@example.com" })
      .eq("id", organizationAId)
      .select("description, public_email")
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toMatchObject({ description: "Owner set this" });
  });

  it("lets an admin update the business profile", async () => {
    const { data, error } = await adminA
      .from("organizations")
      .update({ description: "Admin set this" })
      .eq("id", organizationAId)
      .select("description")
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.description).toBe("Admin set this");
  });

  it("does not let a member update the business profile", async () => {
    const { data } = await memberA
      .from("organizations")
      .update({ description: "Member tried" })
      .eq("id", organizationAId)
      .select("description");
    expect(data ?? []).toHaveLength(0);
    const check = await admin
      .from("organizations")
      .select("description")
      .eq("id", organizationAId)
      .single();
    expect(check.data?.description).toBe("Admin set this");
  });

  it("lets a member read safe profile fields", async () => {
    const { data, error } = await memberA
      .from("organizations")
      .select("id, name, description")
      .eq("id", organizationAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.description).toBe("Admin set this");
  });

  it("does not let another organization read or update the profile", async () => {
    const read = await ownerB
      .from("organizations")
      .select("id")
      .eq("id", organizationAId)
      .maybeSingle();
    expect(read.data).toBeNull();

    const write = await ownerB
      .from("organizations")
      .update({ description: "Cross tenant" })
      .eq("id", organizationAId)
      .select("id");
    expect(write.data ?? []).toHaveLength(0);
  });

  it("persists scheduling settings for an admin", async () => {
    const { data, error } = await adminA
      .from("organization_scheduling_settings")
      .upsert(
        {
          organization_id: organizationAId,
          timezone: "America/New_York",
          working_days: ["monday"],
          business_hours: { monday: { start: "09:00", end: "17:00" } },
          default_duration_minutes: 45,
        },
        { onConflict: "organization_id" }
      )
      .select("timezone, default_duration_minutes")
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toMatchObject({ timezone: "America/New_York", default_duration_minutes: 45 });
  });

  it("does not let a member write scheduling settings", async () => {
    const { error } = await memberA.from("organization_scheduling_settings").upsert(
      {
        organization_id: organizationAId,
        timezone: "Asia/Kolkata",
        working_days: ["monday"],
        business_hours: { monday: { start: "09:00", end: "17:00" } },
        default_duration_minutes: 15,
      },
      { onConflict: "organization_id" }
    );
    expect(error).not.toBeNull();
    const check = await admin
      .from("organization_scheduling_settings")
      .select("timezone")
      .eq("organization_id", organizationAId)
      .single();
    expect(check.data?.timezone).toBe("America/New_York");
  });

  it("lets a member read scheduling settings", async () => {
    const { data, error } = await memberA
      .from("organization_scheduling_settings")
      .select("timezone")
      .eq("organization_id", organizationAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.timezone).toBe("America/New_York");
  });

  it("persists a blocked period for an admin and denies a member", async () => {
    const created = await adminA
      .from("organization_blocked_periods")
      .insert({
        organization_id: organizationAId,
        starts_at: "2030-03-04T10:00:00.000Z",
        ends_at: "2030-03-04T12:00:00.000Z",
        reason: "Maintenance",
      })
      .select("id")
      .maybeSingle();
    expect(created.error).toBeNull();

    const memberInsert = await memberA.from("organization_blocked_periods").insert({
      organization_id: organizationAId,
      starts_at: "2030-03-05T10:00:00.000Z",
      ends_at: "2030-03-05T12:00:00.000Z",
    });
    expect(memberInsert.error).not.toBeNull();

    const memberDelete = await memberA
      .from("organization_blocked_periods")
      .delete()
      .eq("id", created.data!.id)
      .select("id");
    expect(memberDelete.data ?? []).toHaveLength(0);
  });

  it("rejects a blocked period that ends before it starts", async () => {
    const { error } = await adminA.from("organization_blocked_periods").insert({
      organization_id: organizationAId,
      starts_at: "2030-03-04T12:00:00.000Z",
      ends_at: "2030-03-04T10:00:00.000Z",
    });
    expect(error).not.toBeNull();
  });

  it("isolates receptionist instructions per tenant", async () => {
    const written = await adminA
      .from("organization_receptionist_settings")
      .upsert({ organization_id: organizationAId, instructions: "TENANT-A-INSTRUCTIONS" })
      .select("instructions")
      .maybeSingle();
    expect(written.error).toBeNull();

    const memberRead = await memberA
      .from("organization_receptionist_settings")
      .select("instructions")
      .eq("organization_id", organizationAId)
      .maybeSingle();
    expect(memberRead.data?.instructions).toBe("TENANT-A-INSTRUCTIONS");

    const memberWrite = await memberA
      .from("organization_receptionist_settings")
      .update({ instructions: "member edit" })
      .eq("organization_id", organizationAId)
      .select("instructions");
    expect(memberWrite.data ?? []).toHaveLength(0);

    const crossTenant = await ownerB
      .from("organization_receptionist_settings")
      .select("instructions")
      .eq("organization_id", organizationAId);
    expect(crossTenant.data ?? []).toHaveLength(0);
  });

  it("enforces the receptionist instruction length bound", async () => {
    const { error } = await adminA
      .from("organization_receptionist_settings")
      .upsert({ organization_id: organizationAId, instructions: "x".repeat(4001) });
    expect(error).not.toBeNull();
  });

  it("lets an admin manage safe WhatsApp metadata but keeps secrets unreachable", async () => {
    const updated = await adminA
      .from("organization_whatsapp_configs")
      .update({ display_phone_number: "+14155550123", is_active: false })
      .eq("id", whatsAppConfigAId)
      .select("display_phone_number, is_active")
      .maybeSingle();
    expect(updated.error).toBeNull();
    expect(updated.data).toMatchObject({ display_phone_number: "+14155550123", is_active: false });

    const memberUpdate = await memberA
      .from("organization_whatsapp_configs")
      .update({ is_active: true })
      .eq("id", whatsAppConfigAId)
      .select("id");
    expect(memberUpdate.data ?? []).toHaveLength(0);

    const secretRefs = await ownerA.from("organization_whatsapp_secret_refs").select("config_id");
    expect(secretRefs.error).not.toBeNull();

    const crossTenant = await ownerB
      .from("organization_whatsapp_configs")
      .select("id")
      .eq("id", whatsAppConfigAId);
    expect(crossTenant.data ?? []).toHaveLength(0);
  });

  it("still denies slug and identity tampering by an admin", async () => {
    const { error } = await adminA
      .from("organizations")
      .update({ slug: "hijacked-slug" })
      .eq("id", organizationAId);
    expect(error).not.toBeNull();
  });
});
