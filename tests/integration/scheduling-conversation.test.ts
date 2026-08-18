/* @vitest-environment node */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";
import type { ConversationState } from "@/lib/ai/conversation-state";
import type { SchedulingExtraction } from "@/lib/ai/scheduling-extraction";

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
const store = vi.hoisted(() => ({
  extraction: { date: null, time: null, mentionsExistingAppointment: false } as SchedulingExtraction,
}));

vi.mock("server-only", () => ({}));
// The model is never called; only trusted timezone loading is exercised.
vi.mock("@/lib/ai/scheduling-extraction", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/scheduling-extraction")>(
    "@/lib/ai/scheduling-extraction"
  );
  return { ...actual, extractSchedulingDetails: vi.fn(async () => store.extraction) };
});
vi.mock("@/lib/domain/context", () => ({
  requireDomainOrganization: vi.fn(async () => ({
    status: "ready",
    currentOrganization: { id: session.organizationId },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => session.client),
}));

const { planSchedulingConversation } = await import("@/lib/ai/scheduling-conversation");

function client(key: string): SupabaseClient<Database> {
  return createClient<Database>(config!.url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function conversationState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    organizationId: session.organizationId,
    conversationId: "conversation-1",
    contactId: "contact-1",
    conversationStatus: "open",
    isConversationOpen: true,
    hasRecentInboundMessage: true,
    latestInboundMessageId: "message-1",
    latestInboundMessageText: "book me in",
    detectedIntent: "book_appointment",
    requiresClarification: false,
    intentReason: "classified",
    recentMessages: [],
    ...overrides,
  };
}

integrationDescribe("Phase 6.3 scheduling conversation", () => {
  let admin: SupabaseClient<Database>;
  let organizationAId: string;
  let organizationBId: string;
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const clients = new Map<string, SupabaseClient<Database>>();

  async function createTenant(
    label: string,
    runId: string,
    timezone: string,
    durationMinutes: number
  ): Promise<string> {
    const organization = await admin
      .from("organizations")
      .insert({ name: `Sched ${label} ${runId}`, slug: `sched-${label}-${runId}` })
      .select("id")
      .single();
    if (organization.error) throw organization.error;
    const organizationId = organization.data.id;
    organizationIds.push(organizationId);

    const settings = await admin.from("organization_scheduling_settings").insert({
      organization_id: organizationId,
      timezone,
      working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      business_hours: {
        monday: { start: "09:00", end: "17:00" },
        tuesday: { start: "09:00", end: "17:00" },
        wednesday: { start: "09:00", end: "17:00" },
        thursday: { start: "09:00", end: "17:00" },
        friday: { start: "09:00", end: "17:00" },
      },
      default_duration_minutes: durationMinutes,
    });
    if (settings.error) throw settings.error;

    const email = `sched-${label}-${runId}@example.com`;
    const password = `Sched-${randomUUID()}-A9!`;
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
    return organizationId;
  }

  function useTenant(organizationId: string): void {
    session.organizationId = organizationId;
    session.client = clients.get(organizationId);
  }

  beforeAll(async () => {
    admin = client(config!.serviceRoleKey);
    const runId = randomUUID();
    organizationAId = await createTenant("a", runId, "America/New_York", 30);
    organizationBId = await createTenant("b", runId, "Asia/Kolkata", 45);
  });

  afterAll(async () => {
    if (organizationIds.length > 0)
      await admin.from("organizations").delete().in("id", organizationIds);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  });

  it("normalizes an instant using the organization's stored timezone", async () => {
    useTenant(organizationAId);
    store.extraction = { date: "2026-03-04", time: "15:00", mentionsExistingAppointment: false };
    const result = await planSchedulingConversation(conversationState());
    expect(result.collectedFields.timezone).toBe("America/New_York");
    expect(result.collectedFields.durationMinutes).toBe(30);
    expect(result.collectedFields.startsAt).toBe("2026-03-04T20:00:00.000Z");
  });

  it("resolves the same local time differently for another tenant", async () => {
    useTenant(organizationBId);
    store.extraction = { date: "2026-03-04", time: "15:00", mentionsExistingAppointment: false };
    const result = await planSchedulingConversation(conversationState());
    expect(result.collectedFields.timezone).toBe("Asia/Kolkata");
    expect(result.collectedFields.durationMinutes).toBe(45);
    expect(result.collectedFields.startsAt).toBe("2026-03-04T09:30:00.000Z");
  });

  it("creates no appointment while preparing a booking", async () => {
    useTenant(organizationAId);
    store.extraction = { date: "2026-03-04", time: "15:00", mentionsExistingAppointment: false };
    await planSchedulingConversation(conversationState());
    const appointments = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationAId);
    expect(appointments.count).toBe(0);
  });

  it("asks for clarification when the tenant has no scheduling settings", async () => {
    const runId = randomUUID();
    const organization = await admin
      .from("organizations")
      .insert({ name: `Sched none ${runId}`, slug: `sched-none-${runId}` })
      .select("id")
      .single();
    if (organization.error) throw organization.error;
    organizationIds.push(organization.data.id);

    useTenant(organizationAId);
    session.organizationId = organization.data.id;
    store.extraction = { date: "2026-03-04", time: "15:00", mentionsExistingAppointment: false };
    await expect(planSchedulingConversation(conversationState())).resolves.toMatchObject({
      nextStep: "ask_for_clarification",
      reason: "scheduling_unconfigured",
    });
  });
});
