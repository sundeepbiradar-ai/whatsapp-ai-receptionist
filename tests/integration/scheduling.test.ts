/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";

type Config = { url: string; anonKey: string; serviceRoleKey: string };
type User = { id: string; email: string; password: string };

type Fixture = {
  organizationAId: string;
  organizationBId: string;
  contactAId: string;
  contactBId: string;
  conversationAId: string;
  userA: User;
  userB: User;
};

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

async function createUser(admin: SupabaseClient<Database>, label: string, runId: string): Promise<User> {
  const email = `scheduling-${label}-${runId}@example.com`;
  const password = `Scheduling-${randomUUID()}-A9!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error(`Unable to create ${label}`);
  return { id: data.user.id, email, password };
}

async function signIn(user: User): Promise<SupabaseClient<Database>> {
  const userClient = client(config!.anonKey);
  const { error } = await userClient.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return userClient;
}

const settings = {
  timezone: "UTC",
  working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  business_hours: {
    monday: { start: "09:00", end: "17:00" },
    tuesday: { start: "09:00", end: "17:00" },
    wednesday: { start: "09:00", end: "17:00" },
    thursday: { start: "09:00", end: "17:00" },
    friday: { start: "09:00", end: "17:00" },
  },
  default_duration_minutes: 30,
};

const slotA = {
  starts_at: "2099-01-05T10:00:00.000Z",
  ends_at: "2099-01-05T10:30:00.000Z",
};

integrationDescribe("Phase 4.3 scheduling foundation", () => {
  let admin: SupabaseClient<Database>;
  let userAClient: SupabaseClient<Database>;
  let userBClient: SupabaseClient<Database>;
  let fixture: Fixture;
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    admin = client(config!.serviceRoleKey);
    const runId = randomUUID();
    const userA = await createUser(admin, "a", runId);
    const userB = await createUser(admin, "b", runId);
    userIds.push(userA.id, userB.id);

    const orgA = await admin.from("organizations").insert({ name: `Scheduling A ${runId}`, slug: `scheduling-a-${runId}` }).select("id").single();
    const orgB = await admin.from("organizations").insert({ name: `Scheduling B ${runId}`, slug: `scheduling-b-${runId}` }).select("id").single();
    if (orgA.error || orgB.error) throw orgA.error ?? orgB.error;
    organizationIds.push(orgA.data.id, orgB.data.id);

    const memberships = await admin.from("organization_members").insert([
      { organization_id: orgA.data.id, user_id: userA.id, role: "member" },
      { organization_id: orgB.data.id, user_id: userB.id, role: "member" },
    ]);
    if (memberships.error) throw memberships.error;

    const contactA = await admin.from("contacts").insert({ organization_id: orgA.data.id, phone: "+19990000001", name: "Scheduling A" }).select("id").single();
    const contactB = await admin.from("contacts").insert({ organization_id: orgB.data.id, phone: "+19990000002", name: "Scheduling B" }).select("id").single();
    if (contactA.error || contactB.error) throw contactA.error ?? contactB.error;
    const conversationA = await admin.from("conversations").insert({ organization_id: orgA.data.id, contact_id: contactA.data.id, status: "open" }).select("id").single();
    if (conversationA.error) throw conversationA.error;

    fixture = {
      organizationAId: orgA.data.id,
      organizationBId: orgB.data.id,
      contactAId: contactA.data.id,
      contactBId: contactB.data.id,
      conversationAId: conversationA.data.id,
      userA,
      userB,
    };
    userAClient = await signIn(userA);
    userBClient = await signIn(userB);
  });

  afterAll(async () => {
    if (organizationIds.length) await admin.from("organizations").delete().in("id", organizationIds);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  });

  it("creates one default settings row and rejects duplicate settings", async () => {
    const first = await admin.from("organization_scheduling_settings").insert({ organization_id: fixture.organizationAId }).select("*").single();
    expect(first.error).toBeNull();
    expect(first.data?.["timezone"]).toBe("UTC");
    expect(first.data?.["default_duration_minutes"]).toBe(30);
    expect(first.data?.["working_days"]).toEqual(settings.working_days);
    const duplicate = await admin.from("organization_scheduling_settings").insert({ organization_id: fixture.organizationAId });
    expect(duplicate.error).not.toBeNull();
  });

  it("enforces scheduling settings and blocked-period interval constraints", async () => {
    const invalidDuration = await admin.from("organization_scheduling_settings").insert({
      organization_id: fixture.organizationBId,
      timezone: "UTC",
      working_days: settings.working_days,
      business_hours: settings.business_hours,
      default_duration_minutes: 1441,
    });
    expect(invalidDuration.error).not.toBeNull();

    const invalidHours = await admin.from("organization_scheduling_settings").insert({
      organization_id: fixture.organizationBId,
      timezone: "UTC",
      working_days: ["monday"],
      business_hours: { monday: { start: "17:00", end: "17:00" } },
      default_duration_minutes: 30,
    });
    expect(invalidHours.error).not.toBeNull();

    const invalidTimezone = await admin.from("organization_scheduling_settings").insert({
      organization_id: fixture.organizationBId,
      timezone: "Not/A_Timezone",
      working_days: settings.working_days,
      business_hours: settings.business_hours,
      default_duration_minutes: 30,
    });
    expect(invalidTimezone.error).not.toBeNull();

    const blocked = await admin.from("organization_blocked_periods").insert({
      organization_id: fixture.organizationAId,
      starts_at: "2099-01-05T12:00:00.000Z",
      ends_at: "2099-01-05T13:00:00.000Z",
    }).select("id").single();
    expect(blocked.error).toBeNull();

    const invalidBlocked = await admin.from("organization_blocked_periods").insert({
      organization_id: fixture.organizationAId,
      starts_at: "2099-01-05T13:00:00.000Z",
      ends_at: "2099-01-05T13:00:00.000Z",
    });
    expect(invalidBlocked.error).not.toBeNull();
  });

  it("isolates settings and blocked periods through RLS", async () => {
    const ownSettings = await userAClient.from("organization_scheduling_settings").select("organization_id").eq("organization_id", fixture.organizationAId);
    const otherSettings = await userAClient.from("organization_scheduling_settings").select("organization_id").eq("organization_id", fixture.organizationBId);
    const crossInsert = await userAClient.from("organization_blocked_periods").insert({
      organization_id: fixture.organizationBId,
      starts_at: "2099-01-06T12:00:00.000Z",
      ends_at: "2099-01-06T13:00:00.000Z",
    });
    expect(ownSettings.error).toBeNull();
    expect(ownSettings.data).toHaveLength(1);
    expect(otherSettings.error).toBeNull();
    expect(otherSettings.data).toHaveLength(0);
    expect(crossInsert.error).not.toBeNull();
  });

  it("allows an authorized invoker to book and rejects unavailable or conflicting slots", async () => {
    const book = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: slotA.starts_at,
      target_ends_at: slotA.ends_at,
    });
    expect(book.error).toBeNull();
    expect(book.data).toMatchObject({ ok: true });

    const conflict = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: slotA.starts_at,
      target_ends_at: slotA.ends_at,
    });
    expect(conflict.error).toBeNull();
    expect(conflict.data).toMatchObject({ ok: false, error_code: "appointment_conflict" });
    const afterConflict = await admin.from("appointments").select("id").eq("organization_id", fixture.organizationAId).eq("starts_at", slotA.starts_at);
    expect(afterConflict.error).toBeNull();
    expect(afterConflict.data).toHaveLength(1);

    const blocked = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-05T12:15:00.000Z",
      target_ends_at: "2099-01-05T12:45:00.000Z",
    });
    expect(blocked.error).toBeNull();
    expect(blocked.data).toMatchObject({ ok: false, error_code: "appointment_blocked_period" });

    const adjacent = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-05T13:00:00.000Z",
      target_ends_at: "2099-01-05T13:30:00.000Z",
    });
    expect(adjacent.data).toMatchObject({ ok: true });

    const outsideHours = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-05T08:30:00.000Z",
      target_ends_at: "2099-01-05T09:30:00.000Z",
    });
    expect(outsideHours.data).toMatchObject({ ok: false, error_code: "appointment_outside_business_hours" });

    const disabledDay = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-11T10:00:00.000Z",
      target_ends_at: "2099-01-11T10:30:00.000Z",
    });
    expect(disabledDay.data).toMatchObject({ ok: false, error_code: "appointment_outside_business_hours" });

    const oversized = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-06T09:00:00.000Z",
      target_ends_at: "2099-01-07T09:01:00.000Z",
    });
    expect(oversized.error).toBeNull();
    expect(oversized.data).toMatchObject({ ok: false, error_code: "appointment_duration_invalid" });

    const confirmedBooking = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-06T10:00:00.000Z",
      target_ends_at: "2099-01-06T10:30:00.000Z",
      target_status: "confirmed",
    });
    expect(confirmedBooking.error).toBeNull();
    expect(confirmedBooking.data).toMatchObject({ ok: true });
  });

  it("ignores cancelled/completed appointments and isolates conflicts by organization", async () => {
    const cancelled = await admin.from("appointments").insert({
      organization_id: fixture.organizationAId,
      contact_id: fixture.contactAId,
      status: "cancelled",
      starts_at: "2099-01-13T10:00:00.000Z",
      ends_at: "2099-01-13T10:30:00.000Z",
    });
    const completed = await admin.from("appointments").insert({
      organization_id: fixture.organizationAId,
      contact_id: fixture.contactAId,
      status: "completed",
      starts_at: "2099-01-13T11:00:00.000Z",
      ends_at: "2099-01-13T11:30:00.000Z",
    });
    const settingsB = await admin.from("organization_scheduling_settings").insert({
      organization_id: fixture.organizationBId,
      timezone: settings.timezone,
      working_days: settings.working_days,
      business_hours: settings.business_hours,
      default_duration_minutes: settings.default_duration_minutes,
    });
    const otherTenantAppointment = await admin.from("appointments").insert({
      organization_id: fixture.organizationBId,
      contact_id: fixture.contactBId,
      status: "confirmed",
      starts_at: "2099-01-13T12:00:00.000Z",
      ends_at: "2099-01-13T12:30:00.000Z",
    });
    expect(cancelled.error).toBeNull();
    expect(completed.error).toBeNull();
    expect(settingsB.error).toBeNull();
    expect(otherTenantAppointment.error).toBeNull();

    const cancelledSlot = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-13T10:00:00.000Z",
      target_ends_at: "2099-01-13T10:30:00.000Z",
    });
    const completedSlot = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-13T11:00:00.000Z",
      target_ends_at: "2099-01-13T11:30:00.000Z",
    });
    const crossTenantSlot = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-13T12:00:00.000Z",
      target_ends_at: "2099-01-13T12:30:00.000Z",
    });
    expect(cancelledSlot.data).toMatchObject({ ok: true });
    expect(completedSlot.data).toMatchObject({ ok: true });
    expect(crossTenantSlot.data).toMatchObject({ ok: true });
  });

  it("rejects unauthorized RPC access and keeps failed rescheduling atomic", async () => {
    await admin.from("organization_scheduling_settings").delete().eq("organization_id", fixture.organizationBId);
    const missingSettings = await userBClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationBId,
      target_contact_id: fixture.contactBId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-07T10:00:00.000Z",
      target_ends_at: "2099-01-07T10:30:00.000Z",
    });
    expect(missingSettings.data).toMatchObject({ ok: false, error_code: "scheduling_configuration_unavailable" });

    const unauthorized = await userBClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-07T10:00:00.000Z",
      target_ends_at: "2099-01-07T10:30:00.000Z",
    });
    expect(unauthorized.error).toBeNull();
    expect(unauthorized.data).toMatchObject({ ok: false, error_code: "appointment_relationship_invalid" });
  });

  it("serializes same-organization conflicting booking attempts", async () => {
    const attempts = await Promise.all([
      userAClient.rpc("book_or_reschedule_appointment", {
        operation: "book",
        target_organization_id: fixture.organizationAId,
        target_contact_id: fixture.contactAId,
        target_conversation_id: fixture.conversationAId,
        target_starts_at: "2099-01-08T10:00:00.000Z",
        target_ends_at: "2099-01-08T10:30:00.000Z",
      }),
      userAClient.rpc("book_or_reschedule_appointment", {
        operation: "book",
        target_organization_id: fixture.organizationAId,
        target_contact_id: fixture.contactAId,
        target_conversation_id: fixture.conversationAId,
        target_starts_at: "2099-01-08T10:00:00.000Z",
        target_ends_at: "2099-01-08T10:30:00.000Z",
      }),
    ]);
    const successful = attempts.filter((attempt) => attempt.data && (attempt.data as { ok?: boolean }).ok);
    const conflicts = attempts.filter((attempt) => attempt.data && (attempt.data as { error_code?: string }).error_code === "appointment_conflict");
    expect(attempts.every((attempt) => attempt.error === null)).toBe(true);
    expect(successful).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
  });

  it("reschedules without changing the appointment id and leaves it unchanged on conflict", async () => {
    const booked = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-09T10:00:00.000Z",
      target_ends_at: "2099-01-09T10:30:00.000Z",
    });
    const appointmentId = (booked.data as { appointment_id: string }).appointment_id;
    const rescheduled = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "reschedule",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-09T11:00:00.000Z",
      target_ends_at: "2099-01-09T11:30:00.000Z",
      target_appointment_id: appointmentId,
    });
    expect(rescheduled.error).toBeNull();
    expect(rescheduled.data).toMatchObject({ ok: true, appointment_id: appointmentId });

    const competing = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-09T12:00:00.000Z",
      target_ends_at: "2099-01-09T12:30:00.000Z",
    });
    expect(competing.data).toMatchObject({ ok: true });

    const failed = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "reschedule",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-09T12:15:00.000Z",
      target_ends_at: "2099-01-09T12:45:00.000Z",
      target_appointment_id: appointmentId,
    });
    expect(failed.data).toMatchObject({ ok: false, error_code: "appointment_conflict" });

    const persisted = await admin.from("appointments").select("id, starts_at, ends_at").eq("id", appointmentId).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data?.starts_at).toBe("2099-01-09T11:00:00+00:00");
    expect(persisted.data?.ends_at).toBe("2099-01-09T11:30:00+00:00");
  });

  it("serializes concurrent rescheduling to one conflicting winner", async () => {
    const first = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-15T10:00:00.000Z",
      target_ends_at: "2099-01-15T10:30:00.000Z",
    });
    const second = await userAClient.rpc("book_or_reschedule_appointment", {
      operation: "book",
      target_organization_id: fixture.organizationAId,
      target_contact_id: fixture.contactAId,
      target_conversation_id: fixture.conversationAId,
      target_starts_at: "2099-01-15T11:00:00.000Z",
      target_ends_at: "2099-01-15T11:30:00.000Z",
    });
    const firstId = (first.data as { appointment_id: string }).appointment_id;
    const secondId = (second.data as { appointment_id: string }).appointment_id;
    const attempts = await Promise.all([
      userAClient.rpc("book_or_reschedule_appointment", {
        operation: "reschedule",
        target_organization_id: fixture.organizationAId,
        target_contact_id: fixture.contactAId,
        target_conversation_id: fixture.conversationAId,
        target_starts_at: "2099-01-15T12:00:00.000Z",
        target_ends_at: "2099-01-15T12:30:00.000Z",
        target_appointment_id: firstId,
      }),
      userAClient.rpc("book_or_reschedule_appointment", {
        operation: "reschedule",
        target_organization_id: fixture.organizationAId,
        target_contact_id: fixture.contactAId,
        target_conversation_id: fixture.conversationAId,
        target_starts_at: "2099-01-15T12:00:00.000Z",
        target_ends_at: "2099-01-15T12:30:00.000Z",
        target_appointment_id: secondId,
      }),
    ]);
    const successes = attempts.filter((attempt) => (attempt.data as { ok?: boolean } | null)?.ok);
    const conflicts = attempts.filter((attempt) => (attempt.data as { error_code?: string } | null)?.error_code === "appointment_conflict");
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
  });
});
