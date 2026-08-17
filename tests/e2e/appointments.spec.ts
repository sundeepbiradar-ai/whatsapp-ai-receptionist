import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "@/lib/supabase/database";

const url = process.env["E2E_SUPABASE_URL"];
const anonKey = process.env["E2E_SUPABASE_ANON_KEY"];
const serviceRoleKey = process.env["E2E_SUPABASE_SERVICE_ROLE_KEY"];
const hasEnvironment = Boolean(url && anonKey && serviceRoleKey);
const email = `appointments-${randomUUID()}@example.com`;
const password = `Appointments-${randomUUID()}-A9!`;
const organizationName = `Appointments E2E Organization ${randomUUID()}`;
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

test.describe("Appointments UI", () => {
  test.skip(
    !hasEnvironment,
    "Set E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, and E2E_SUPABASE_SERVICE_ROLE_KEY for authenticated Appointments E2E tests."
  );

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    if (admin && organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (admin && userId) await admin.auth.admin.deleteUser(userId);
  });

  test("shows the appointment list, creates an appointment, edits it, and updates status", async ({ page }) => {
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
      phone: "+15550000010",
      name: "Appointment Contact",
      email: "appointment@example.com",
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

    await page.goto("/dashboard/appointments");
    await expect(page.getByRole("heading", { name: "Appointments", exact: true })).toBeVisible();
    await expect(page.getByText("No appointments yet")).toBeVisible();

    await page.getByRole("link", { name: "New appointment" }).click();
    await expect(page).toHaveURL(/\/dashboard\/appointments\/new$/);
    await page.getByLabel("Contact").selectOption(contactId ?? "");
    await page.getByLabel("Conversation (optional)").selectOption(conversationId ?? "");
    await page.getByLabel("Starts").fill("2030-02-01T09:00");
    await page.getByLabel("Ends").fill("2030-02-01T10:00");
    await page.getByLabel("Status").selectOption("confirmed");
    await page.getByLabel("Notes (optional)").fill("Initial appointment note");
    await page.getByRole("button", { name: "Save appointment" }).click();

    await expect(page).toHaveURL(/\/dashboard\/appointments\/[0-9a-f-]+$/);
    await expect(page.getByText("Appointment details", { exact: true })).toBeVisible();
    await expect(page.getByText("Initial appointment note")).toBeVisible();

    const editLink = page.getByRole("link", { name: "Edit" });
    await expect(editLink).toHaveAttribute("href", /\/dashboard\/appointments\/[0-9a-f-]+\/edit$/);
    const editHref = await editLink.getAttribute("href");
    if (!editHref) throw new Error("Edit link did not have an href");
    await page.goto(editHref);
    await expect(page).toHaveURL(/\/dashboard\/appointments\/[0-9a-f-]+\/edit$/);
    await page.getByLabel("Notes (optional)").fill("Updated appointment note");
    await page.getByRole("button", { name: "Save appointment" }).click();
    await expect(page.getByText("Updated appointment note")).toBeVisible();

    const appointmentId = page.url().split("/").at(-1);
    if (!appointmentId) throw new Error("Appointment URL did not contain an id");
    await page.getByRole("button", { name: "Cancel appointment" }).click();
    await expect(page.getByText(/^cancelled$/)).toBeVisible();
    const cancelledAppointment = await admin?.from("appointments").select("status").eq("id", appointmentId).single();
    expect(cancelledAppointment?.error).toBeNull();
    expect(cancelledAppointment?.data?.status).toBe("cancelled");
    await page.reload();
    await expect(page.getByText(/^cancelled$/)).toBeVisible();
    await page.getByRole("link", { name: "Back to appointments" }).click();
    await expect(page).toHaveURL(/\/dashboard\/appointments$/);
    await expect(page.getByText("Updated appointment note")).toBeVisible();
  });
});
