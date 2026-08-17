import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "@/lib/supabase/database";

const url = process.env["E2E_SUPABASE_URL"];
const anonKey = process.env["E2E_SUPABASE_ANON_KEY"];
const serviceRoleKey = process.env["E2E_SUPABASE_SERVICE_ROLE_KEY"];
const hasEnvironment = Boolean(url && anonKey && serviceRoleKey);
const email = `contacts-${randomUUID()}@example.com`;
const password = `Contacts-${randomUUID()}-A9!`;
const organizationName = `Contacts E2E Organization ${randomUUID()}`;
let admin: SupabaseClient<Database> | undefined;
let userId: string | undefined;
let organizationId: string | undefined;

test.describe("Contacts UI", () => {
  test.skip(
    !hasEnvironment,
    "Set E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, and E2E_SUPABASE_SERVICE_ROLE_KEY for authenticated Contacts E2E tests."
  );

  test.beforeAll(() => {
    if (url && serviceRoleKey) {
      admin = createClient<Database>(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  });

  test.afterAll(async () => {
    if (admin && organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (admin && userId) await admin.auth.admin.deleteUser(userId);
  });

  test("creates, views, edits, and deletes a contact", async ({ page }) => {
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
    await page.goto("/onboarding");
    await page.getByLabel("Organization name").fill(organizationName);
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const users = await admin?.auth.admin.listUsers({ page: 1, perPage: 100 });
    userId = users?.data.users.find((user) => user.email === email)?.id;
    expect(userId).toBeDefined();
    const organization = await admin?.from("organizations").select("id").eq("name", organizationName).single();
    organizationId = organization?.data?.id;
    expect(organization?.error).toBeNull();

    await page.goto("/dashboard/contacts");
    await expect(page.getByText("No contacts yet.")).toBeVisible();
    await page.getByRole("link", { name: "Create contact" }).click();
    await page.getByLabel("Name").fill("Ada Lovelace");
    await page.getByLabel("Phone").fill("+15550000001");
    await page.getByLabel("Email (optional)").fill("ada@example.com");
    await page.getByRole("button", { name: "Create contact" }).click();

    await expect(page).toHaveURL(/\/dashboard\/contacts\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible();
    const editLink = page.getByRole("link", { name: "Edit" });
    await expect(editLink).toHaveAttribute("href", /\/dashboard\/contacts\/[0-9a-f-]+\/edit$/);
    const editHref = await editLink.getAttribute("href");
    if (!editHref) throw new Error("Edit link did not have an href");
    await page.goto(editHref);
    await expect(page).toHaveURL(/\/dashboard\/contacts\/[0-9a-f-]+\/edit$/);
    await page.getByLabel("Name").fill("Ada Byron Lovelace");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: "Ada Byron Lovelace" })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete contact" }).click();
    await expect(page).toHaveURL(/\/dashboard\/contacts$/);
    await expect(page.getByText("Ada Byron Lovelace")).not.toBeVisible();
  });
});
