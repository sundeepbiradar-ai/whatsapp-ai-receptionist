/* @vitest-environment node */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";
import { parseSupabaseQueryOutput } from "../helpers/supabase-cli-output";

vi.mock("server-only", () => ({}));

const provider = "meta_whatsapp_cloud" as const;
type Config = { url: string; anonKey: string; serviceRoleKey: string };
type User = { id: string; email: string; password: string };
type QueryOutput = { rows?: Array<Record<string, unknown>> };

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

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function localSql(sql: string): QueryOutput {
  const output = execFileSync(
    "supabase",
    ["db", "query", "--local", "--output-format", "json", sql],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    }
  );
  return parseSupabaseQueryOutput(output);
}

function createVaultSecret(value: string, name: string): string {
  const result = localSql(
    `select vault.create_secret(${sqlString(value)}, ${sqlString(name)}, ${sqlString("Phase 5.1 test secret")}, null) as id;`
  );
  const id = result.rows?.[0]?.["id"];
  if (typeof id !== "string") throw new Error("Vault secret was not created.");
  return id;
}

async function createUser(
  admin: SupabaseClient<Database>,
  label: string,
  runId: string
): Promise<User> {
  const email = `whatsapp-config-${label}-${runId}@example.com`;
  const password = `WhatsAppConfig-${randomUUID()}-A9!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Unable to create ${label}`);
  return { id: data.user.id, email, password };
}

async function signedInClient(user: User): Promise<SupabaseClient<Database>> {
  const userClient = client(config!.anonKey);
  const { error } = await userClient.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  return userClient;
}

integrationDescribe("Phase 5.1 WhatsApp configuration foundation", () => {
  let admin: SupabaseClient<Database>;
  let ownerClient: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let memberClient: SupabaseClient<Database>;
  let anonymousClient: SupabaseClient<Database>;
  let organizationId: string;
  let otherOrganizationId: string;
  let owner: User;
  let adminUser: User;
  let member: User;
  let userIds: string[] = [];
  let organizationIds: string[] = [];
  const secretIds: string[] = [];

  beforeAll(async () => {
    admin = client(config!.serviceRoleKey);
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = config!.url;
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = config!.serviceRoleKey;
    const runId = randomUUID();
    owner = await createUser(admin, "owner", runId);
    adminUser = await createUser(admin, "admin", runId);
    member = await createUser(admin, "member", runId);
    userIds = [owner.id, adminUser.id, member.id];

    const organization = await admin
      .from("organizations")
      .insert({
        name: `WhatsApp Config ${runId}`,
        slug: `whatsapp-config-${runId}`,
      })
      .select("id")
      .single();
    const otherOrganization = await admin
      .from("organizations")
      .insert({
        name: `WhatsApp Other ${runId}`,
        slug: `whatsapp-other-${runId}`,
      })
      .select("id")
      .single();
    if (organization.error || otherOrganization.error)
      throw organization.error ?? otherOrganization.error;
    organizationId = organization.data.id;
    otherOrganizationId = otherOrganization.data.id;
    organizationIds = [organizationId, otherOrganizationId];

    const memberships = await admin.from("organization_members").insert([
      { organization_id: organizationId, user_id: owner.id, role: "owner" },
      { organization_id: organizationId, user_id: adminUser.id, role: "admin" },
      { organization_id: organizationId, user_id: member.id, role: "member" },
    ]);
    if (memberships.error) throw memberships.error;

    ownerClient = await signedInClient(owner);
    adminClient = await signedInClient(adminUser);
    memberClient = await signedInClient(member);
    anonymousClient = client(config!.anonKey);
  });

  afterAll(async () => {
    if (secretIds.length > 0) {
      localSql(`delete from vault.secrets where id in (${secretIds.map(sqlString).join(", ")});`);
    }
    if (organizationIds.length > 0)
      await admin.from("organizations").delete().in("id", organizationIds);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  });

  it("allows owner and admin creation, member read-only access, and multiple numbers per organization", async () => {
    const ownerConfig = await ownerClient
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationId,
        provider,
        phone_number_id: `owner-${randomUUID()}`,
        business_account_id: "business-owner",
      })
      .select(
        "id, organization_id, provider, phone_number_id, business_account_id, display_phone_number, is_active"
      )
      .single();
    expect(ownerConfig.error).toBeNull();

    const adminConfig = await adminClient
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationId,
        provider,
        phone_number_id: `admin-${randomUUID()}`,
        business_account_id: "business-admin",
      })
      .select("id")
      .single();
    expect(adminConfig.error).toBeNull();

    const memberConfig = await memberClient.from("organization_whatsapp_configs").insert({
      organization_id: organizationId,
      provider,
      phone_number_id: `member-${randomUUID()}`,
      business_account_id: "business-member",
    });
    expect(memberConfig.error).not.toBeNull();
    expect(ownerConfig.data).not.toHaveProperty("access_token");
    expect(ownerConfig.data).not.toHaveProperty("app_secret");
    expect(ownerConfig.data).not.toHaveProperty("verify_token");
  });

  it("enforces member mutation denial and cross-organization metadata isolation", async () => {
    const configRow = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationId,
        provider,
        phone_number_id: `member-policy-${randomUUID()}`,
        business_account_id: "business-policy",
      })
      .select("id")
      .single();
    const otherRow = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: otherOrganizationId,
        provider,
        phone_number_id: `other-${randomUUID()}`,
        business_account_id: "business-other",
      })
      .select("id")
      .single();
    if (configRow.error || otherRow.error) throw configRow.error ?? otherRow.error;

    const ownRead = await memberClient
      .from("organization_whatsapp_configs")
      .select("id, organization_id, provider, phone_number_id")
      .eq("organization_id", organizationId);
    const crossRead = await memberClient
      .from("organization_whatsapp_configs")
      .select("id")
      .eq("organization_id", otherOrganizationId);
    const update = await memberClient
      .from("organization_whatsapp_configs")
      .update({ is_active: false })
      .eq("id", configRow.data.id)
      .select("id");
    const remove = await memberClient
      .from("organization_whatsapp_configs")
      .delete()
      .eq("id", configRow.data.id)
      .select("id");

    expect(ownRead.error).toBeNull();
    expect(ownRead.data?.length).toBeGreaterThan(0);
    expect(crossRead.error).toBeNull();
    expect(crossRead.data).toHaveLength(0);
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);
    expect(remove.error).toBeNull();
    expect(remove.data).toHaveLength(0);
  });

  it("allows an admin to update and delete organization configuration", async () => {
    const configRow = await adminClient
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationId,
        provider,
        phone_number_id: `admin-mutation-${randomUUID()}`,
        business_account_id: "business-admin-mutation",
      })
      .select("id")
      .single();
    if (configRow.error) throw configRow.error;

    const update = await adminClient
      .from("organization_whatsapp_configs")
      .update({ is_active: false })
      .eq("id", configRow.data.id)
      .select("is_active")
      .single();
    const remove = await adminClient
      .from("organization_whatsapp_configs")
      .delete()
      .eq("id", configRow.data.id)
      .select("id");

    expect(update.error).toBeNull();
    expect(update.data?.is_active).toBe(false);
    expect(remove.error).toBeNull();
    expect(remove.data).toHaveLength(1);
  });

  it("rejects duplicate provider phone IDs", async () => {
    const phoneNumberId = `duplicate-${randomUUID()}`;
    const first = await admin.from("organization_whatsapp_configs").insert({
      organization_id: organizationId,
      provider,
      phone_number_id: phoneNumberId,
      business_account_id: "business-duplicate-a",
    });
    const second = await admin.from("organization_whatsapp_configs").insert({
      organization_id: otherOrganizationId,
      provider,
      phone_number_id: phoneNumberId,
      business_account_id: "business-duplicate-b",
    });
    expect(first.error).toBeNull();
    expect(second.error).not.toBeNull();
  });

  it("keeps secret references inaccessible to anon and authenticated roles", async () => {
    const authenticatedRead = await memberClient
      .from("organization_whatsapp_secret_refs")
      .select("*");
    const anonymousRead = await anonymousClient
      .from("organization_whatsapp_secret_refs")
      .select("*");
    const authenticatedLookup = await memberClient.rpc("resolve_whatsapp_config", {
      target_provider: provider,
      target_phone_number_id: "unknown",
    });
    const anonymousLookup = await anonymousClient.rpc("resolve_whatsapp_config", {
      target_provider: provider,
      target_phone_number_id: "unknown",
    });

    expect(authenticatedRead.error).not.toBeNull();
    expect(anonymousRead.error).not.toBeNull();
    expect(authenticatedLookup.error).not.toBeNull();
    expect(anonymousLookup.error).not.toBeNull();
  });

  it("excludes inactive and unknown configurations from trusted lookup", async () => {
    const inactive = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationId,
        provider,
        phone_number_id: `inactive-${randomUUID()}`,
        business_account_id: "business-inactive",
        is_active: false,
      })
      .select("id, phone_number_id")
      .single();
    if (inactive.error) throw inactive.error;

    const serviceLookup = await admin.rpc("resolve_whatsapp_config", {
      target_provider: provider,
      target_phone_number_id: inactive.data.phone_number_id,
    });
    const unknownLookup = await admin.rpc("resolve_whatsapp_config", {
      target_provider: provider,
      target_phone_number_id: "does-not-exist",
    });

    expect(serviceLookup.error).toBeNull();
    expect(serviceLookup.data).toBeNull();
    expect(unknownLookup.error).toBeNull();
    expect(unknownLookup.data).toBeNull();
  });

  it("resolves trusted organization and Vault values server-side", async () => {
    const accessToken = `fake-access-${randomUUID()}`;
    const appSecret = `fake-app-${randomUUID()}`;
    const verifyToken = `fake-verify-${randomUUID()}`;
    const accessTokenId = createVaultSecret(accessToken, `phase51-access-${randomUUID()}`);
    const appSecretId = createVaultSecret(appSecret, `phase51-app-${randomUUID()}`);
    const verifyTokenId = createVaultSecret(verifyToken, `phase51-verify-${randomUUID()}`);
    secretIds.push(accessTokenId, appSecretId, verifyTokenId);

    const configRow = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organizationId,
        provider,
        phone_number_id: `active-${randomUUID()}`,
        business_account_id: "business-active",
      })
      .select("id, phone_number_id")
      .single();
    if (configRow.error) throw configRow.error;
    const refs = await admin.from("organization_whatsapp_secret_refs").insert({
      config_id: configRow.data.id,
      access_token_secret_id: accessTokenId,
      app_secret_secret_id: appSecretId,
      verify_token_secret_id: verifyTokenId,
    });
    if (refs.error) throw refs.error;

    const { resolveWhatsAppConfigByPhoneNumberId, resolveWhatsAppConfigForOrganization } =
      await import("@/lib/whatsapp/configuration");
    const byPhone = await resolveWhatsAppConfigByPhoneNumberId(configRow.data.phone_number_id);
    const byOrganization = await resolveWhatsAppConfigForOrganization(organizationId);

    expect(byPhone).toMatchObject({ organizationId, accessToken, appSecret, verifyToken });
    expect(byOrganization).toMatchObject({ organizationId, accessToken, appSecret, verifyToken });
  }, 15_000);

  it("cascades configuration rows when an organization is deleted", async () => {
    const organization = await admin
      .from("organizations")
      .insert({
        name: `WhatsApp Cascade ${randomUUID()}`,
        slug: `whatsapp-cascade-${randomUUID()}`,
      })
      .select("id")
      .single();
    if (organization.error) throw organization.error;
    const configRow = await admin
      .from("organization_whatsapp_configs")
      .insert({
        organization_id: organization.data.id,
        provider,
        phone_number_id: `cascade-${randomUUID()}`,
        business_account_id: "business-cascade",
      })
      .select("id")
      .single();
    if (configRow.error) throw configRow.error;

    await admin.from("organizations").delete().eq("id", organization.data.id);
    const remaining = await admin
      .from("organization_whatsapp_configs")
      .select("id")
      .eq("id", configRow.data.id);
    expect(remaining.error).toBeNull();
    expect(remaining.data).toHaveLength(0);
  });
});
