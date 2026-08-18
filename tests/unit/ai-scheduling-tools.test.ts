import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConversationState } from "@/lib/ai/conversation-state";
import type { SchedulingPlan } from "@/lib/ai/scheduling-conversation";
import { DomainError, type DomainErrorCode } from "@/lib/domain/errors";

type AppointmentRow = {
  id: string;
  contact_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

const store = vi.hoisted(() => ({
  conversation: null as { id: string; contact_id: string } | null,
  conversationError: null as unknown,
  settings: { timezone: "America/New_York", default_duration_minutes: 30 },
  settingsError: null as unknown,
  appointments: [] as AppointmentRow[],
  bookError: null as unknown,
  rescheduleError: null as unknown,
  cancelError: null as unknown,
  queryError: null as unknown,
}));

const book = vi.hoisted(() => vi.fn());
const reschedule = vi.hoisted(() => vi.fn());
const cancel = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
const getConversationMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/domain/conversations/repository", () => ({ getConversation: getConversationMock }));
vi.mock("@/lib/domain/appointments/repository", () => ({
  bookAppointment: book,
  rescheduleAppointment: reschedule,
  cancelAppointment: cancel,
  queryAppointments: query,
  getSchedulingSettings: vi.fn(async () => {
    if (store.settingsError) throw store.settingsError;
    return store.settings;
  }),
}));

const {
  executeSchedulingTool,
  resolveAppointmentReference,
  schedulingToolNames,
  bookAppointmentArgsSchema,
  queryAppointmentsArgsSchema,
} = await import("@/lib/ai/scheduling-tools");

const conversationId = "00000000-0000-4000-8000-000000000001";
const contactId = "00000000-0000-4000-8000-000000000002";

function state(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    organizationId: "org-1",
    conversationId,
    contactId,
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

function plan(overrides: Partial<SchedulingPlan> = {}): SchedulingPlan {
  return {
    intent: "book_appointment",
    action: "prepare_booking",
    requiresClarification: false,
    missingFields: [],
    collectedFields: {
      timezone: "America/New_York",
      localDate: "2026-03-04",
      localTime: "15:00",
      startsAt: "2026-03-04T20:00:00.000Z",
      durationMinutes: 30,
      referencesExistingAppointment: false,
    },
    nextStep: "ready_for_tool",
    reason: "ready",
    ...overrides,
  };
}

function appointment(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: "appointment-1",
    contact_id: contactId,
    starts_at: "2026-03-04T20:00:00.000Z",
    ends_at: "2026-03-04T20:30:00.000Z",
    status: "pending",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.conversation = { id: conversationId, contact_id: contactId };
  store.settings = { timezone: "America/New_York", default_duration_minutes: 30 };
  store.settingsError = null;
  store.appointments = [];
  getConversationMock.mockImplementation(async () => {
    if (store.conversationError) throw store.conversationError;
    return store.conversation;
  });
  store.conversationError = null;
  query.mockImplementation(async () => {
    if (store.queryError) throw store.queryError;
    return { appointments: store.appointments, page: 1, pageSize: 50, total: store.appointments.length };
  });
  store.queryError = null;
  book.mockImplementation(async () => {
    if (store.bookError) throw store.bookError;
    return appointment();
  });
  store.bookError = null;
  reschedule.mockImplementation(async () => {
    if (store.rescheduleError) throw store.rescheduleError;
    return appointment({ starts_at: "2026-03-05T20:00:00.000Z", ends_at: "2026-03-05T20:30:00.000Z" });
  });
  store.rescheduleError = null;
  cancel.mockImplementation(async () => {
    if (store.cancelError) throw store.cancelError;
    return appointment({ status: "cancelled" });
  });
  store.cancelError = null;
});

describe("tool taxonomy", () => {
  it("exposes exactly the four approved tools", () => {
    expect([...schedulingToolNames]).toEqual([
      "book_appointment",
      "reschedule_appointment",
      "cancel_appointment",
      "query_appointments",
    ]);
  });

  it("rejects trusted identifiers in tool arguments", () => {
    expect(
      bookAppointmentArgsSchema.safeParse({
        startsAt: "2026-03-04T20:00:00.000Z",
        durationMinutes: 30,
        organizationId: "org-evil",
      }).success
    ).toBe(false);
    expect(
      bookAppointmentArgsSchema.safeParse({
        startsAt: "2026-03-04T20:00:00.000Z",
        durationMinutes: 30,
        contactId: "contact-evil",
      }).success
    ).toBe(false);
  });

  it("bounds query arguments", () => {
    expect(queryAppointmentsArgsSchema.safeParse({ pageSize: 500 }).success).toBe(false);
    expect(queryAppointmentsArgsSchema.safeParse({ statuses: ["deleted"] }).success).toBe(false);
    expect(queryAppointmentsArgsSchema.safeParse({ organizationId: "x" }).success).toBe(false);
  });
});

describe("tool gating", () => {
  it.each([
    ["clarification required", plan({ requiresClarification: true }), "requires_clarification"],
    ["not ready", plan({ nextStep: "ask_for_date" }), "not_ready"],
    [
      "no scheduling action",
      plan({ action: "no_scheduling_action", nextStep: "no_action" }),
      "not_ready",
    ],
    [
      "a contradictory plan claims readiness without a scheduling action",
      plan({ action: "no_scheduling_action", nextStep: "ready_for_tool" }),
      "no_scheduling_action",
    ],
  ])("executes nothing when %s", async (_label, value, reason) => {
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: value });
    expect(outcome).toMatchObject({ tool: null, outcome: "not_executed", reason });
    expect(book).not.toHaveBeenCalled();
    expect(reschedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(getConversationMock).not.toHaveBeenCalled();
  });

  it("executes booking exactly once when ready", async () => {
    await executeSchedulingTool({ conversationState: state(), plan: plan() });
    expect(book).toHaveBeenCalledTimes(1);
    expect(reschedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("executes cancellation exactly once when ready", async () => {
    store.appointments = [appointment()];
    await executeSchedulingTool({
      conversationState: state(),
      plan: plan({ action: "prepare_cancellation", intent: "cancel_appointment" }),
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(book).not.toHaveBeenCalled();
  });

  it("executes reschedule exactly once when ready", async () => {
    store.appointments = [appointment()];
    await executeSchedulingTool({
      conversationState: state(),
      plan: plan({ action: "prepare_reschedule", intent: "reschedule_appointment" }),
    });
    expect(reschedule).toHaveBeenCalledTimes(1);
  });

  it("executes query exactly once when ready", async () => {
    store.appointments = [appointment()];
    await executeSchedulingTool({
      conversationState: state(),
      plan: plan({ action: "prepare_query", intent: "query_appointment" }),
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(book).not.toHaveBeenCalled();
  });

  it("refuses to act on stale conversation context", async () => {
    store.conversation = { id: conversationId, contact_id: "another-contact" };
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: plan() });
    expect(outcome).toMatchObject({ outcome: "not_executed", reason: "stale_conversation_context" });
    expect(book).not.toHaveBeenCalled();
  });

  it("does not book when the plan has no resolved instant", async () => {
    const outcome = await executeSchedulingTool({
      conversationState: state(),
      plan: plan({
        collectedFields: { ...plan().collectedFields, startsAt: null },
      }),
    });
    expect(outcome).toMatchObject({ outcome: "not_executed", reason: "missing_start" });
    expect(book).not.toHaveBeenCalled();
  });
});

describe("booking tool", () => {
  it("uses the trusted contact and conversation and derives endsAt", async () => {
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: plan() });
    expect(book).toHaveBeenCalledWith({
      contactId,
      conversationId,
      startsAt: "2026-03-04T20:00:00.000Z",
      endsAt: "2026-03-04T20:30:00.000Z",
      status: "pending",
    });
    expect(outcome).toMatchObject({
      tool: "book_appointment",
      outcome: "success",
      data: { appointment: { appointmentId: "appointment-1", status: "pending" } },
    });
  });

  it("never passes an organization id to the domain boundary", async () => {
    await executeSchedulingTool({ conversationState: state(), plan: plan() });
    expect(JSON.stringify(book.mock.calls[0])).not.toContain("organizationId");
    expect(JSON.stringify(book.mock.calls[0])).not.toContain("org-1");
  });

  it("uses the organization default duration when the plan omits one", async () => {
    store.settings = { timezone: "America/New_York", default_duration_minutes: 45 };
    await executeSchedulingTool({
      conversationState: state(),
      plan: plan({ collectedFields: { ...plan().collectedFields, durationMinutes: null } }),
    });
    expect(book.mock.calls[0]?.[0]).toMatchObject({ endsAt: "2026-03-04T20:45:00.000Z" });
  });

  it.each([
    "appointment_conflict",
    "appointment_outside_business_hours",
    "appointment_blocked_period",
    "appointment_past",
  ] as const)("maps scheduling rejection %s safely", async (code: DomainErrorCode) => {
    store.bookError = new DomainError(code, "rejected");
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: plan() });
    expect(outcome).toMatchObject({ outcome: "rejected", reason: code });
  });

  it("collapses unexpected infrastructure failures", async () => {
    store.bookError = new Error('duplicate key value violates unique constraint "appointments_pkey"');
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: plan() });
    expect(outcome).toMatchObject({ outcome: "failed", reason: "unavailable" });
    expect(JSON.stringify(outcome)).not.toContain("unique constraint");
  });

  it("does not trigger a second tool after a failure", async () => {
    store.bookError = new DomainError("appointment_conflict", "conflict");
    await executeSchedulingTool({ conversationState: state(), plan: plan() });
    expect(reschedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("appointment reference resolution", () => {
  it("resolves exactly one matching appointment", async () => {
    store.appointments = [appointment()];
    await expect(
      resolveAppointmentReference({
        contactId,
        localDate: "2026-03-04",
        localTime: "15:00",
        timezone: "America/New_York",
      })
    ).resolves.toMatchObject({ status: "resolved" });
  });

  it("reports not found when nothing matches", async () => {
    store.appointments = [appointment()];
    await expect(
      resolveAppointmentReference({
        contactId,
        localDate: "2026-03-09",
        localTime: null,
        timezone: "America/New_York",
      })
    ).resolves.toEqual({ status: "not_found" });
  });

  it("reports ambiguity instead of guessing", async () => {
    store.appointments = [
      appointment({ id: "a1", starts_at: "2026-03-04T20:00:00.000Z" }),
      appointment({ id: "a2", starts_at: "2026-03-06T20:00:00.000Z" }),
    ];
    await expect(
      resolveAppointmentReference({
        contactId,
        localDate: null,
        localTime: null,
        timezone: "America/New_York",
      })
    ).resolves.toEqual({ status: "ambiguous" });
  });

  it("excludes appointments belonging to another contact", async () => {
    store.appointments = [appointment({ id: "other", contact_id: "contact-other" })];
    await expect(
      resolveAppointmentReference({
        contactId,
        localDate: null,
        localTime: null,
        timezone: "America/New_York",
      })
    ).resolves.toEqual({ status: "not_found" });
  });

  it("only ever considers pending and confirmed appointments", async () => {
    store.appointments = [appointment()];
    await resolveAppointmentReference({
      contactId,
      localDate: null,
      localTime: null,
      timezone: "America/New_York",
    });
    expect(query).toHaveBeenCalledWith({ statuses: ["pending", "confirmed"], pageSize: 50 });
  });
});

describe("reschedule and cancellation tools", () => {
  const reschedulePlan = plan({ action: "prepare_reschedule", intent: "reschedule_appointment" });
  const cancelPlan = plan({ action: "prepare_cancellation", intent: "cancel_appointment" });

  it("reschedules a resolved appointment", async () => {
    store.appointments = [appointment()];
    const outcome = await executeSchedulingTool({
      conversationState: state(),
      plan: reschedulePlan,
    });
    expect(reschedule).toHaveBeenCalledWith("appointment-1", {
      startsAt: "2026-03-04T20:00:00.000Z",
      endsAt: "2026-03-04T20:30:00.000Z",
    });
    expect(outcome.outcome).toBe("success");
  });

  it("does not reschedule an ambiguous target", async () => {
    store.appointments = [appointment({ id: "a1" }), appointment({ id: "a2", starts_at: "2026-03-06T20:00:00.000Z" })];
    const outcome = await executeSchedulingTool({
      conversationState: state(),
      plan: reschedulePlan,
    });
    expect(outcome).toMatchObject({
      outcome: "ambiguous",
      requiresClarification: true,
      reason: "appointment_reference_ambiguous",
    });
    expect(reschedule).not.toHaveBeenCalled();
  });

  it("reports not found when there is no appointment to reschedule", async () => {
    store.appointments = [];
    const outcome = await executeSchedulingTool({
      conversationState: state(),
      plan: reschedulePlan,
    });
    expect(outcome).toMatchObject({ outcome: "not_found", requiresClarification: true });
    expect(reschedule).not.toHaveBeenCalled();
  });

  it.each(["appointment_terminal", "appointment_conflict"] as const)(
    "maps reschedule rejection %s safely",
    async (code: DomainErrorCode) => {
      store.appointments = [appointment()];
      store.rescheduleError = new DomainError(code, "rejected");
      const outcome = await executeSchedulingTool({
        conversationState: state(),
        plan: reschedulePlan,
      });
      expect(outcome).toMatchObject({ outcome: "rejected", reason: code });
    }
  );

  it("cancels through the dedicated boundary", async () => {
    store.appointments = [appointment()];
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: cancelPlan });
    expect(cancel).toHaveBeenCalledWith("appointment-1");
    expect(outcome).toMatchObject({
      tool: "cancel_appointment",
      outcome: "success",
      data: { appointment: { status: "cancelled" } },
    });
  });

  it("maps a terminal cancellation rejection safely", async () => {
    store.appointments = [appointment()];
    store.cancelError = new DomainError("appointment_terminal", "already cancelled");
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: cancelPlan });
    expect(outcome).toMatchObject({ outcome: "rejected", reason: "appointment_terminal" });
  });

  it("does not cancel an ambiguous target", async () => {
    store.appointments = [appointment({ id: "a1" }), appointment({ id: "a2", starts_at: "2026-03-06T20:00:00.000Z" })];
    const outcome = await executeSchedulingTool({
      conversationState: state(),
      plan: plan({ action: "prepare_cancellation", collectedFields: { ...plan().collectedFields, localDate: null, localTime: null } }),
    });
    expect(outcome.outcome).toBe("ambiguous");
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("query tool", () => {
  const queryPlan = plan({ action: "prepare_query", intent: "query_appointment" });

  it("returns a bounded summary for the trusted contact only", async () => {
    store.appointments = [
      appointment({ id: "mine" }),
      appointment({ id: "theirs", contact_id: "contact-other" }),
    ];
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: queryPlan });
    expect(outcome.data?.appointments).toHaveLength(1);
    expect(outcome.data?.appointments?.[0]?.appointmentId).toBe("mine");
  });

  it("requests a bounded page from the existing query boundary", async () => {
    await executeSchedulingTool({ conversationState: state(), plan: queryPlan });
    expect(query).toHaveBeenCalledWith({ statuses: ["pending", "confirmed"], pageSize: 20 });
  });

  it("maps a query failure safely", async () => {
    store.queryError = new Error("permission denied for table appointments");
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: queryPlan });
    expect(outcome).toMatchObject({ outcome: "failed", reason: "unavailable" });
    expect(JSON.stringify(outcome)).not.toContain("permission denied");
  });

  it("returns no row internals", async () => {
    store.appointments = [appointment()];
    const outcome = await executeSchedulingTool({ conversationState: state(), plan: queryPlan });
    expect(Object.keys(outcome.data?.appointments?.[0] ?? {})).toEqual([
      "appointmentId",
      "startsAt",
      "endsAt",
      "status",
    ]);
  });
});

describe("Phase 6.4 security boundary", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/ai/scheduling-tools.ts"), "utf8");

  it.each([
    "@supabase/supabase-js",
    "@/lib/supabase/server",
    "SUPABASE_SERVICE_ROLE_KEY",
    ".from(",
    ".rpc(",
    ".insert(",
    ".update(",
    ".delete(",
  ])("never reaches the database directly via %s", (specifier) => {
    expect(source).not.toContain(specifier);
  });

  it.each(["updateAppointment", "createAppointment", "createMessage", "updateConversationStatus"])(
    "never imports the disallowed operation %s",
    (symbol) => {
      expect(source).not.toContain(symbol);
    }
  );

  it("does not call the model to choose a tool", () => {
    expect(source).not.toContain("requestModelCompletion");
    expect(source).not.toContain("@/lib/ai/provider");
  });

  it("stays server-only and out of the webhook", () => {
    expect(source).toContain('import "server-only"');
    const webhook = readFileSync(
      resolve(process.cwd(), "app/api/whatsapp/webhook/route.ts"),
      "utf8"
    );
    expect(webhook).not.toContain("executeSchedulingTool");
    expect(webhook).not.toContain("@/lib/ai/");
  });
});
