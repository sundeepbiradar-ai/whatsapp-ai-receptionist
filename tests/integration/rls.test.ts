/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database";

type TestConfig = {
  url: string;
  anonKey: string;
  setupServiceRoleKey: string;
};

type TestUser = {
  id: string;
  email: string;
  password: string;
};

type TestFixture = {
  userA: TestUser;
  userB: TestUser;
  organizationAId: string;
  organizationASlug: string;
  organizationBId: string;
  membershipAId: string;
  membershipBId: string;
};

function loadConfig(): TestConfig | null {
  const url = process.env["SUPABASE_TEST_URL"];
  const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
  const setupServiceRoleKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];

  if (!url || !anonKey || !setupServiceRoleKey) {
    return null;
  }

  return { url, anonKey, setupServiceRoleKey };
}

const config = loadConfig();
const integrationDescribe = config ? describe : describe.skip;

function createAnonClient(configValue: TestConfig) {
  return createClient<Database>(configValue.url, configValue.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function createSetupClient(configValue: TestConfig) {
  return createClient<Database>(configValue.url, configValue.setupServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function createTestUser(
  setupClient: SupabaseClient<Database>,
  label: string,
  runId: string
): Promise<TestUser> {
  const email = `rls-${label}-${runId}@example.com`;
  const password = `RlsTest-${randomUUID()}-A9!`;
  const { data, error } = await setupClient.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });

  if (error || !data.user) {
    throw error ?? new Error(`Unable to create test user ${label}`);
  }

  return { id: data.user.id, email, password };
}

async function signInAs(
  client: SupabaseClient<Database>,
  user: TestUser
): Promise<void> {
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (error) {
    throw error;
  }
}

integrationDescribe("Runtime RLS security", () => {
  if (!config) {
    return;
  }

  let setupClient: SupabaseClient<Database>;
  let userAClient: SupabaseClient<Database>;
  let userBClient: SupabaseClient<Database>;
  let fixture: TestFixture;
  const createdUserIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    setupClient = createSetupClient(config);
    userAClient = createAnonClient(config);
    userBClient = createAnonClient(config);

    const runId = randomUUID();
    const organizationASlug = `rls-a-${runId}`;
    const organizationBSlug = `rls-b-${runId}`;
    const userA = await createTestUser(setupClient, "a", runId);
    createdUserIds.push(userA.id);
    const userB = await createTestUser(setupClient, "b", runId);
    createdUserIds.push(userB.id);

    const organizationAResult = await setupClient
      .from("organizations")
      .insert({ name: `RLS Organization A ${runId}`, slug: organizationASlug })
      .select("id")
      .single();
    if (organizationAResult.error) {
      throw organizationAResult.error;
    }
    createdOrganizationIds.push(organizationAResult.data.id);

    const organizationBResult = await setupClient
      .from("organizations")
      .insert({ name: `RLS Organization B ${runId}`, slug: organizationBSlug })
      .select("id")
      .single();
    if (organizationBResult.error) {
      throw organizationBResult.error;
    }
    createdOrganizationIds.push(organizationBResult.data.id);

    const profilesResult = await setupClient
      .from("profiles")
      .select("id")
      .in("id", [userA.id, userB.id]);
    if (profilesResult.error || profilesResult.data.length !== 2) {
      throw profilesResult.error ?? new Error("Auth profile trigger did not create both profiles");
    }

    const membershipsResult = await setupClient
      .from("organization_members")
      .insert([
        {
          organization_id: organizationAResult.data.id,
          role: "member",
          user_id: userA.id,
        },
        {
          organization_id: organizationBResult.data.id,
          role: "member",
          user_id: userB.id,
        },
      ])
      .select("id, organization_id, user_id");
    if (membershipsResult.error || membershipsResult.data.length !== 2) {
      throw membershipsResult.error ?? new Error("Unable to create memberships");
    }

    const membershipA = membershipsResult.data.find(
      (membership) => membership.organization_id === organizationAResult.data.id
    );
    const membershipB = membershipsResult.data.find(
      (membership) => membership.organization_id === organizationBResult.data.id
    );
    if (!membershipA || !membershipB) {
      throw new Error("Test memberships were not created as expected");
    }

    fixture = {
      membershipAId: membershipA.id,
      membershipBId: membershipB.id,
      organizationAId: organizationAResult.data.id,
      organizationASlug,
      organizationBId: organizationBResult.data.id,
      userA,
      userB,
    };

    await signInAs(userAClient, userA);
    await signInAs(userBClient, userB);
  });

  afterAll(async () => {
    if (!setupClient) {
      return;
    }

    if (createdOrganizationIds.length > 0) {
      await setupClient
        .from("organizations")
        .delete()
        .in("id", createdOrganizationIds);
    }
    for (const userId of createdUserIds) {
      await setupClient.auth.admin.deleteUser(userId);
    }
  });

  it("isolates organization reads by membership", async () => {
    const userAOwn = await userAClient
      .from("organizations")
      .select("id")
      .eq("id", fixture.organizationAId);
    const userAOther = await userAClient
      .from("organizations")
      .select("id")
      .eq("id", fixture.organizationBId);
    const userBOwn = await userBClient
      .from("organizations")
      .select("id")
      .eq("id", fixture.organizationBId);
    const userBOther = await userBClient
      .from("organizations")
      .select("id")
      .eq("id", fixture.organizationAId);

    expect(userAOwn.error).toBeNull();
    expect(userAOwn.data).toHaveLength(1);
    expect(userAOther.error).toBeNull();
    expect(userAOther.data).toHaveLength(0);
    expect(userBOwn.error).toBeNull();
    expect(userBOwn.data).toHaveLength(1);
    expect(userBOther.error).toBeNull();
    expect(userBOther.data).toHaveLength(0);
  });

  it("isolates membership reads by organization membership", async () => {
    const userAOwn = await userAClient
      .from("organization_members")
      .select("id, role")
      .eq("id", fixture.membershipAId);
    const userAOther = await userAClient
      .from("organization_members")
      .select("id, role")
      .eq("id", fixture.membershipBId);
    const userBOwn = await userBClient
      .from("organization_members")
      .select("id, role")
      .eq("id", fixture.membershipBId);
    const userBOther = await userBClient
      .from("organization_members")
      .select("id, role")
      .eq("id", fixture.membershipAId);

    expect(userAOwn.error).toBeNull();
    expect(userAOwn.data).toHaveLength(1);
    if (!userAOwn.data) {
      throw new Error("User A membership was not returned");
    }
    expect(userAOwn.data[0]?.role).toBe("member");
    expect(userAOther.error).toBeNull();
    expect(userAOther.data).toHaveLength(0);
    expect(userBOwn.error).toBeNull();
    expect(userBOwn.data).toHaveLength(1);
    if (!userBOwn.data) {
      throw new Error("User B membership was not returned");
    }
    expect(userBOwn.data[0]?.role).toBe("member");
    expect(userBOther.error).toBeNull();
    expect(userBOther.data).toHaveLength(0);
  });

  it("blocks cross-tenant organization mutations", async () => {
    const updateResult = await userAClient
      .from("organizations")
      .update({ name: "unauthorized update" })
      .eq("id", fixture.organizationBId)
      .select("id");
    const deleteResult = await userAClient
      .from("organizations")
      .delete()
      .eq("id", fixture.organizationBId)
      .select("id");
    const organizationAfterMutation = await setupClient
      .from("organizations")
      .select("id, name")
      .eq("id", fixture.organizationBId)
      .single();

    expect(updateResult.error).toBeNull();
    expect(updateResult.data).toHaveLength(0);
    expect(deleteResult.error).toBeNull();
    expect(deleteResult.data).toHaveLength(0);
    expect(organizationAfterMutation.error).toBeNull();
    if (!organizationAfterMutation.data) {
      throw new Error("Organization fixture disappeared during mutation test");
    }
    expect(organizationAfterMutation.data.name).toContain("RLS Organization B");
  });

  it("blocks membership insertion, modification, and role escalation", async () => {
    const insertResult = await userAClient.from("organization_members").insert({
      organization_id: fixture.organizationBId,
      role: "member",
      user_id: fixture.userA.id,
    });
    const modifyOtherResult = await userAClient
      .from("organization_members")
      .update({ role: "admin" })
      .eq("id", fixture.membershipBId)
      .select("id");
    const promoteSelfResult = await userAClient
      .from("organization_members")
      .update({ role: "owner" })
      .eq("id", fixture.membershipAId)
      .select("id");
    const membershipsAfterMutation = await setupClient
      .from("organization_members")
      .select("id, role")
      .in("id", [fixture.membershipAId, fixture.membershipBId]);

    expect(insertResult.error).not.toBeNull();
    expect(modifyOtherResult.error).toBeNull();
    expect(modifyOtherResult.data).toHaveLength(0);
    expect(promoteSelfResult.error).toBeNull();
    expect(promoteSelfResult.data).toHaveLength(0);
    expect(membershipsAfterMutation.error).toBeNull();
    expect(membershipsAfterMutation.data).toHaveLength(2);
    if (!membershipsAfterMutation.data) {
      throw new Error("Membership fixtures disappeared during mutation test");
    }
    expect(membershipsAfterMutation.data.every((membership) => membership.role === "member")).toBe(
      true
    );
  });

  it("isolates profiles by authenticated user", async () => {
    const ownProfile = await userAClient
      .from("profiles")
      .select("id")
      .eq("id", fixture.userA.id);
    const otherProfile = await userAClient
      .from("profiles")
      .select("id")
      .eq("id", fixture.userB.id);
    const attemptedUpdatedAt = "2000-01-01T00:00:00.000Z";
    const updateOtherProfile = await userAClient
      .from("profiles")
      .update({ updated_at: attemptedUpdatedAt })
      .eq("id", fixture.userB.id)
      .select("id");
    const profileAfterMutation = await setupClient
      .from("profiles")
      .select("id, updated_at")
      .eq("id", fixture.userB.id)
      .single();

    expect(ownProfile.error).toBeNull();
    expect(ownProfile.data).toHaveLength(1);
    expect(otherProfile.error).toBeNull();
    expect(otherProfile.data).toHaveLength(0);
    expect(updateOtherProfile.error).toBeNull();
    expect(updateOtherProfile.data).toHaveLength(0);
    expect(profileAfterMutation.error).toBeNull();
    if (!profileAfterMutation.data) {
      throw new Error("Profile fixture disappeared during mutation test");
    }
    expect(profileAfterMutation.data.updated_at).not.toBe(attemptedUpdatedAt);
  });

  it("denies anonymous access to protected tenant data", async () => {
    const anonymousClient = createAnonClient(config);
    const result = await anonymousClient
      .from("organizations")
      .select("id")
      .eq("id", fixture.organizationAId);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(0);
  });

  it("rejects duplicate organization slugs and memberships", async () => {
    const duplicateSlugResult = await setupClient
      .from("organizations")
      .insert({ name: "Duplicate slug", slug: fixture.organizationASlug })
      .select("id")
      .maybeSingle();
    const duplicateMembershipResult = await setupClient
      .from("organization_members")
      .insert({
        organization_id: fixture.organizationAId,
        role: "member",
        user_id: fixture.userA.id,
      })
      .select("id")
      .maybeSingle();

    expect(duplicateSlugResult.error).not.toBeNull();
    expect(duplicateMembershipResult.error).not.toBeNull();
  });

  it("creates an organization atomically for the authenticated user as owner", async () => {
    const slug = `rls-created-${randomUUID()}`;
    const creationResult = await userAClient.rpc("create_organization", {
      organization_name: "RLS Created Organization",
      organization_slug: slug,
    } as never);

    expect(creationResult.error).toBeNull();
    if (!creationResult.data) {
      throw new Error("Organization creation did not return an organization");
    }
    createdOrganizationIds.push(creationResult.data.id);

    const ownerResult = await userAClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", creationResult.data.id)
      .eq("user_id", fixture.userA.id)
      .single();

    expect(ownerResult.error).toBeNull();
    expect(ownerResult.data?.role).toBe("owner");
  });
});
