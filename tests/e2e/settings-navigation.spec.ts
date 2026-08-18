import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "@/lib/supabase/database";

const url = process.env["E2E_SUPABASE_URL"];
const anonKey = process.env["E2E_SUPABASE_ANON_KEY"];
const serviceRoleKey = process.env["E2E_SUPABASE_SERVICE_ROLE_KEY"];
const hasEnvironment = Boolean(url && anonKey && serviceRoleKey);
const email = `settings-nav-${randomUUID()}@example.com`;
const password = `SettingsNav-${randomUUID()}-A9!`;
const organizationName = `Settings Nav E2E Organization ${randomUUID()}`;
let admin: SupabaseClient<Database> | undefined;
let userId: string | undefined;
let organizationId: string | undefined;

function adminClient(): SupabaseClient<Database> | undefined {
  if (!url || !serviceRoleKey) return undefined;
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe("Business settings navigation", () => {
  test("redirects unauthenticated visitors away from business settings", async ({ page }) => {
    await page.goto("/dashboard/settings");
    await expect(page).toHaveURL(/\/login$/);
  });

  test.describe("authenticated", () => {
    test.skip(
      !hasEnvironment,
      "Set E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, and E2E_SUPABASE_SERVICE_ROLE_KEY for authenticated settings navigation tests."
    );

    test.beforeAll(() => {
      admin = adminClient();
    });

    test.afterAll(async () => {
      if (admin && organizationId) await admin.from("organizations").delete().eq("id", organizationId);
      if (admin && userId) await admin.auth.admin.deleteUser(userId);
    });

    test("shows a business settings link that opens the settings page", async ({ page }) => {
      await page.goto("/signup");
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page).toHaveURL(/\/(dashboard|login)$/);
      if (page.url().endsWith("/login")) {
        await page.getByLabel("Email address").fill(email);
        await page.getByLabel("Password").fill(password);
        await page.getByRole("button", { name: "Log in" }).click();
      }
      await expect(page).toHaveURL(/\/dashboard$/);

      const users = await admin?.auth.admin.listUsers({ page: 1, perPage: 100 });
      userId = users?.data.users.find((user) => user.email === email)?.id;
      expect(userId).toBeDefined();

      await page.goto("/onboarding");
      await page.getByLabel("Organization name").fill(organizationName);
      await page.getByRole("button", { name: "Create organization" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      const organization = await admin
        ?.from("organizations")
        .select("id")
        .eq("name", organizationName)
        .single();
      organizationId = organization?.data?.id;
      expect(organizationId).toBeDefined();

      const settingsLink = page.getByRole("link", { name: "Business Settings" });
      await expect(settingsLink).toBeVisible();
      await expect(settingsLink).toHaveAttribute("href", "/dashboard/settings");

      await settingsLink.click();
      await expect(page).toHaveURL(/\/dashboard\/settings$/);
      await expect(page.getByRole("heading", { name: "Business settings" })).toBeVisible();
    });
  });
});
