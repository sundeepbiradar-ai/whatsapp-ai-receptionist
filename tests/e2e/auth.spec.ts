import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "@/lib/supabase/database";

const supabaseUrl = process.env["E2E_SUPABASE_URL"];
const supabaseAnonKey = process.env["E2E_SUPABASE_ANON_KEY"];
const supabaseServiceRoleKey = process.env["E2E_SUPABASE_SERVICE_ROLE_KEY"];
const hasAuthEnvironment = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey
);

const testEmail = `e2e-${randomUUID()}@example.com`;
const testPassword = `E2eTest-${randomUUID()}-A9!`;
const organizationName = `E2E Organization ${randomUUID()}`;
const secondOrganizationName = `E2E Organization Two ${randomUUID()}`;
let setupClient: SupabaseClient<Database> | undefined;
let userId: string | undefined;
const organizationIds: string[] = [];

test.describe("Supabase Auth browser flow", () => {
  test.skip(
    !hasAuthEnvironment,
    "Set E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, and E2E_SUPABASE_SERVICE_ROLE_KEY for real Auth E2E tests."
  );

  test.beforeAll(() => {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return;
    }

    setupClient = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  test.afterAll(async () => {
    if (setupClient && organizationIds.length > 0) {
      await setupClient.from("organizations").delete().in("id", organizationIds);
    }
    if (setupClient && userId) {
      await setupClient.auth.admin.deleteUser(userId);
    }
  });

  test("shows a safe invalid-login error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("invalid@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByText("Invalid email or password.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signs up, logs out, logs in, and protects the dashboard", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Email address").fill(testEmail);
    await page.getByLabel("Password").fill(testPassword);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/(dashboard|login)$/);

    if (!page.url().endsWith("/login")) {
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByText(testEmail)).toBeVisible();
      await page.getByRole("button", { name: "Log out" }).click();
      await expect(page).toHaveURL(/\/login$/);
    }

    await page.getByLabel("Email address").fill(testEmail);
    await page.getByLabel("Password").fill(testPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    const userResult = await setupClient?.auth.admin.listUsers({ page: 1, perPage: 100 });
    userId = userResult?.data.users.find((user) => user.email === testEmail)?.id;
    expect(userId).toBeDefined();

    await page.goto("/onboarding");
    await page.getByLabel("Organization name").fill(organizationName);
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(organizationName)).toBeVisible();
    await expect(page.getByText("Role: owner")).toBeVisible();

    const organizationResult = await setupClient
      ?.from("organizations")
      .select("id")
      .eq("name", organizationName)
      .single();
    const organizationId = organizationResult?.data?.id;
    expect(organizationResult?.error).toBeNull();
    expect(organizationId).toBeDefined();
    if (organizationId) {
      organizationIds.push(organizationId);
    }

    const secondOrganizationResult = await setupClient
      ?.from("organizations")
      .insert({ name: secondOrganizationName, slug: `e2e-two-${randomUUID()}` })
      .select("id")
      .single();
    expect(secondOrganizationResult?.error).toBeNull();
    const secondOrganizationId = secondOrganizationResult?.data?.id;
    expect(secondOrganizationId).toBeDefined();
    if (!secondOrganizationId) {
      throw new Error("Second organization fixture was not created");
    }
    organizationIds.push(secondOrganizationId);

    const secondMembershipResult = await setupClient?.from("organization_members").insert({
      organization_id: secondOrganizationId ?? "",
      role: "member",
      user_id: userId ?? "",
    });
    expect(secondMembershipResult?.error).toBeNull();

    await page.reload();
    await expect(page.getByLabel("Switch organization")).toBeVisible();
    await page.getByLabel("Switch organization").selectOption(secondOrganizationId);
    await page.getByRole("button", { name: "Switch organization" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(`Current organization: ${secondOrganizationName} (member)`)).toBeVisible();
    await expect(page.getByText("Role: member")).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
