/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";
import type { ConversationState } from "@/lib/ai/conversation-state";
import type { SchedulingPlan } from "@/lib/ai/scheduling-conversation";

type Config = { url: string; anonKey: string; serviceRoleKey: string };

function loadConfig(): Config | null {
  const url = process.env["SUPABASE_TEST_URL"];
  const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
  const serviceRoleKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
  return url && anonKey && serviceRoleKey ? { url, anonKey, serviceRoleKey } : null;
}

const config = loadConfig();
const integrationDescribe = config ? describe : describe.skip;

const session = vi.hoisted(() => ({ organizationId: "", client: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/domain/context", () => ({
  requireDomainOrganization: vi.fn(async () => ({
    status: "ready",
    currentOrganization: { id: session.organizationId },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => session.client),
}));

const { executeSchedulingTool } = await import("@/lib/ai/scheduling-tools");

function client(key: string): SupabaseClient<Database> {
  return createClient<Database>(config!.url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

/** Far-future weekday inside 09:00-17:00 New York business hours. */
function futureUtc(dayOffset: number, hourLocal: number): string {
  const date = new Date(Date.UTC(2030, 2, 4 + dayOffset, hourLocal + 5, 0, 0));
  return date.toISOString();
}

integrationDescribe("Phase 6.4 scheduling tools", () => {
  let admin: SupabaseClient<Database>;
  let organizationAId: string;
  let organizationBId: string;
  let contactAId: string;
  let conversationAId: string;
  let conversationBId: string;
  let contactBId: string;
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const clients = new Map<string, SupabaseClient<Database>>();

  async function createTenant(label: string, runId: string) {
    const organization = await admin
      .from("organizations")
      .insert({ name: `Tools ${label} ${runId}`, slug: `tools-${label}-${runId}` })
      .select("id")
      .single();
    if (organization.error) throw organization.error;
    const organizationId = organization.data.id;
    organizationIds.push(organizationId);

    const settings = await admin.from("organization_scheduling_settings").insert({
      organization_id: organizationId,
      timezone: "America/New_York",
      working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      business_hours: {
        monday: { start: "09:00", end: "17:00" },
        tuesday: { start: "09:00", end: "17:00" },
        wednesday: { start: "09:00", end: "17:00" },
        thursday: { start: "09:00", end: "17:00" },
        friday: { start: "09:00", end: "17:00" },
      },
      default_duration_minutes: 30,
    });
    if (settings.error) throw settings.error;

    const contact = await admin
      .from("contacts")
      .insert({ organization_id: organizationId, phone: `+1415555${runId.slice(0, 4)}${label}`, name: "Tools" })
      .select("id")
      .single();
    if (contact.error) throw contact.error;

    const conversation = await admin
      .from("conversations")
      .insert({ organization_id: organizationId, contact_id: contact.data.id, status: "open" })
      .select("id")
      .single();
    if (conversation.error) throw conversation.error;

    const email = `tools-${label}-${runId}@example.com`;
    const password = `Tools-${randomUUID()}-A9!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("user");
    userIds.push(created.data.user.id);
    const membership = await admin
      .from("organization_members")
      .insert({ organization_id: organizationId, user_id: created.data.user.id, role: "owner" });
    if (membership.error) throw membership.error;

    const authed = client(config!.anonKey);
    const signIn = await authed.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    clients.set(organizationId, authed);

    return { organizationId, contactId: contact.data.id, conversationId: conversation.data.id };
  }

  function useTenant(organizationId: string): void {
    session.organizationId = organizationId;
    session.client = clients.get(organizationId);
  }

  function state(overrides: Partial<ConversationState> = {}): ConversationState {
    return {
      organizationId: organizationAId,
      conversationId: conversationAId,
      contactId: contactAId,
      conversationStatus: "open",
      isConversationOpen: true,
      hasRecentInboundMessage: true,
      latestInboundMessageId: "message-1",
      latestInboundMessageText: "book me",
      detectedIntent: "book_appointment",
      requiresClarification: false,
      intentReason: "classified",
      recentMessages: [],
      ...overrides,
    };
  }

  function plan(overrides: Partial<SchedulingPlan> = {}): SchedulingPlan {
    return {
      intent: "book_appointment",
      action: "prepare_booking",
      requiresClarification: false,
      missingFields: [],
      collectedFields: {
        timezone: "America/New_York",
        localDate: null,
        localTime: null,
        startsAt: futureUtc(0, 10),
        durationMinutes: 30,
        referencesExistingAppointment: false,
      },
      nextStep: "ready_for_tool",
      reason: "ready",
      ...overrides,
    };
  }

  beforeAll(async () => {
    admin = client(config!.serviceRoleKey);
    const runId = randomUUID();
    const tenantA = await createTenant("a", runId);
    const tenantB = await createTenant("b", runId);
    organizationAId = tenantA.organizationId;
    contactAId = tenantA.contactId;
    conversationAId = tenantA.conversationId;
    organizationBId = tenantB.organizationId;
    contactBId = tenantB.contactId;
    conversationBId = tenantB.conversationId;
  });

  afterAll(async () => {
    if (organizationIds.length > 0)
      await admin.from("organizations").delete().in("id", organizationIds);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  });

  it("books through the authoritative Phase 4 path", async () => {
    useTenant(organizationAId);
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: plan() });
    expect(outcome).toMatchObject({ tool: "book_appointment", outcome: "success" });

    const stored = await admin
      .from("appointments")
      .select("id, organization_id, contact_id, conversation_id, status, starts_at, ends_at")
      .eq("id", outcome.data!.appointment!.appointmentId)
      .single();
    expect(stored.data).toMatchObject({
      organization_id: organizationAId,
      contact_id: contactAId,
      conversation_id: conversationAId,
      status: "pending",
    });
    expect(
      new Date(stored.data!.ends_at).getTime() - new Date(stored.data!.starts_at).getTime()
    ).toBe(30 * 60_000);
  });

  it("rejects a conflicting booking without creating a row", async () => {
    useTenant(organizationAId);
    const before = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationAId);
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: plan() });
    expect(outcome).toMatchObject({ outcome: "rejected", reason: "appointment_conflict" });
    const after = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationAId);
    expect(after.count).toBe(before.count);
  });

  it("rejects a booking outside business hours safely", async () => {
    useTenant(organizationAId);
    const outcome = await executeSchedulingTool({
      conversationState: state(),
      plan: plan({ collectedFields: { ...plan().collectedFields, startsAt: futureUtc(1, 3) } }),
    });
    expect(outcome.outcome).toBe("rejected");
    expect(outcome.reason).toBe("appointment_outside_business_hours");
  });

  it("queries only the trusted contact's appointments", async () => {
    useTenant(organizationAId);
    const outcome = await executeSchedulingTool({
      conversationState: state(),
      plan: plan({ action: "prepare_query", intent: "query_appointment" }),
    });
    expect(outcome).toMatchObject({ tool: "query_appointments", outcome: "success" });
    expect(outcome.data?.appointments?.length).toBeGreaterThan(0);
    expect(outcome.data?.appointments?.every((entry) => entry.status === "pending")).toBe(true);
  });

  it("reschedules the resolved appointment through the Phase 4 boundary", async () => {
    useTenant(organizationAId);
    const outcome = await executeSchedulingTool({
      conversationState: state(),
      plan: plan({
        action: "prepare_reschedule",
        intent: "reschedule_appointment",
        collectedFields: { ...plan().collectedFields, startsAt: futureUtc(0, 14) },
      }),
    });
    expect(outcome).toMatchObject({ tool: "reschedule_appointment", outcome: "success" });
    expect(new Date(outcome.data!.appointment!.startsAt).toISOString()).toBe(futureUtc(0, 14));
  });

  it("reports ambiguity instead of choosing between candidates", async () => {
    useTenant(organizationAId);
    const second = await executeSchedulingTool({
      conversationState: state(),
      plan: plan({ collectedFields: { ...plan().collectedFields, startsAt: futureUtc(1, 11) } }),
    });
    expect(second.outcome).toBe("success");

    const outcome = await executeSchedulingTool({
      conversationState: state(),
      plan: plan({ action: "prepare_cancellation", intent: "cancel_appointment" }),
    });
    expect(outcome).toMatchObject({ outcome: "ambiguous", requiresClarification: true });

    const active = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationAId)
      .in("status", ["pending", "confirmed"]);
    expect(active.count).toBe(2);
  });

  it("cancels the appointment identified by its local time", async () => {
    useTenant(organizationAId);
    const outcome = await executeSchedulingTool({
      conversationState: state(),
      plan: plan({
        action: "prepare_cancellation",
        intent: "cancel_appointment",
        collectedFields: { ...plan().collectedFields, localTime: "11:00" },
      }),
    });
    expect(outcome).toMatchObject({ tool: "cancel_appointment", outcome: "success" });
    expect(outcome.data?.appointment?.status).toBe("cancelled");
  });

  it("never resolves another tenant's appointment", async () => {
    useTenant(organizationBId);
    const outcome = await executeSchedulingTool({
      conversationState: state({
        organizationId: organizationBId,
        conversationId: conversationBId,
        contactId: contactBId,
      }),
      plan: plan({ action: "prepare_cancellation", intent: "cancel_appointment" }),
    });
    expect(outcome).toMatchObject({ outcome: "not_found", requiresClarification: true });
  });

  it("refuses to act when the conversation belongs to another tenant", async () => {
    useTenant(organizationBId);
    const outcome = await executeSchedulingTool({
      conversationState: state({
        organizationId: organizationBId,
        conversationId: conversationAId,
        contactId: contactBId,
      }),
      plan: plan(),
    });
    expect(["not_found", "failed", "rejected"]).toContain(outcome.outcome);
    expect(outcome.outcome).not.toBe("success");
  });
});
