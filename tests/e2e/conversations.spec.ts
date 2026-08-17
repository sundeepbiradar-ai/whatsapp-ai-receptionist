import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "@/lib/supabase/database";

const url = process.env["E2E_SUPABASE_URL"];
const anonKey = process.env["E2E_SUPABASE_ANON_KEY"];
const serviceRoleKey = process.env["E2E_SUPABASE_SERVICE_ROLE_KEY"];
const hasEnvironment = Boolean(url && anonKey && serviceRoleKey);
const email = `conversations-${randomUUID()}@example.com`;
const password = `Conversations-${randomUUID()}-A9!`;
const organizationName = `Conversations E2E Organization ${randomUUID()}`;
let admin: SupabaseClient<Database> | undefined;
let userId: string | undefined;
let organizationId: string | undefined;
let contactId: string | undefined;
let conversationId: string | undefined;

function adminClient(): SupabaseClient<Database> | undefined {
  if (!url || !serviceRoleKey) return undefined;
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe("Conversations UI", () => {
  test.skip(
    !hasEnvironment,
    "Set E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, and E2E_SUPABASE_SERVICE_ROLE_KEY for authenticated Conversations E2E tests."
  );

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    if (admin && organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (admin && userId) await admin.auth.admin.deleteUser(userId);
  });

  test("shows conversation history, contact information, and status changes", async ({ page }) => {
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

    const organization = await admin?.from("organizations").select("id").eq("name", organizationName).single();
    organizationId = organization?.data?.id;
    expect(organization?.error).toBeNull();
    expect(organizationId).toBeDefined();

    const contact = await admin?.from("contacts").insert({
      organization_id: organizationId ?? "",
      phone: "+15550000002",
      name: "Grace Hopper",
      email: "grace@example.com",
    }).select("id").single();
    contactId = contact?.data?.id;
    expect(contact?.error).toBeNull();
    expect(contactId).toBeDefined();

    const conversation = await admin?.from("conversations").insert({
      organization_id: organizationId ?? "",
      contact_id: contactId ?? "",
      status: "open",
    }).select("id").single();
    conversationId = conversation?.data?.id;
    expect(conversation?.error).toBeNull();
    expect(conversationId).toBeDefined();

    const messages = await admin?.from("messages").insert([
      { organization_id: organizationId ?? "", conversation_id: conversationId ?? "", direction: "inbound", content: "Hello from Grace" },
      { organization_id: organizationId ?? "", conversation_id: conversationId ?? "", direction: "outbound", content: "Hello, how can we help?" },
    ]);
    expect(messages?.error).toBeNull();

    await page.goto("/dashboard/conversations");
    await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
    await expect(page.getByText("Grace Hopper")).toBeVisible();
    const conversationLink = page.getByRole("link", { name: /Grace Hopper/ });
    await expect(conversationLink).toHaveAttribute("href", /\/dashboard\/conversations\/[0-9a-f-]+$/);
    const conversationHref = await conversationLink.getAttribute("href");
    if (!conversationHref) throw new Error("Conversation link did not have an href");
    await page.goto(conversationHref);
    await expect(page).toHaveURL(/\/dashboard\/conversations\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Grace Hopper" })).toBeVisible();
    await expect(page.getByText("grace@example.com")).toBeVisible();
    await expect(page.getByText("Hello from Grace")).toBeVisible();
    await expect(page.getByText("Hello, how can we help?")).toBeVisible();

    await page.getByLabel("Status").selectOption("closed");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText("closed", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to conversations" }).click();
    await expect(page).toHaveURL(/\/dashboard\/conversations$/);
  });
});
