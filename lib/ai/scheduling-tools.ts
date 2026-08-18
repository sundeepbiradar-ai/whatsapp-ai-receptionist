import "server-only";

import { z } from "zod";

import type { ConversationState } from "@/lib/ai/conversation-state";
import type { SchedulingPlan } from "@/lib/ai/scheduling-conversation";
import {
  bookAppointment,
  cancelAppointment,
  getSchedulingSettings,
  queryAppointments,
  rescheduleAppointment,
} from "@/lib/domain/appointments/repository";
import { formatLocalDateTimeInput } from "@/lib/domain/appointments/scheduling";
import { getConversation } from "@/lib/domain/conversations/repository";
import { DomainError, type DomainErrorCode } from "@/lib/domain/errors";

export const schedulingToolNames = [
  "book_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "query_appointments",
] as const;

export type SchedulingToolName = (typeof schedulingToolNames)[number];

export const schedulingToolNameSchema = z.enum(schedulingToolNames);

const isoDateTime = z.string().datetime({ offset: true });

/** Trusted fields are never accepted from a plan or model: they are derived server-side. */
export const bookAppointmentArgsSchema = z
  .object({
    startsAt: isoDateTime,
    durationMinutes: z.number().int().min(1).max(1440),
    notes: z.string().trim().max(5000).optional(),
  })
  .strict();

export const rescheduleAppointmentArgsSchema = z
  .object({
    startsAt: isoDateTime,
    durationMinutes: z.number().int().min(1).max(1440),
  })
  .strict();

export const cancelAppointmentArgsSchema = z.object({}).strict();

export const queryAppointmentsArgsSchema = z
  .object({
    statuses: z.array(z.enum(["pending", "confirmed", "cancelled", "completed"])).optional(),
    startsAtFrom: isoDateTime.optional(),
    startsAtTo: isoDateTime.optional(),
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export type SchedulingToolOutcome =
  | "success"
  | "not_executed"
  | "not_found"
  | "ambiguous"
  | "rejected"
  | "failed";

export type SchedulingToolAppointment = {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

export type SchedulingToolResult = {
  tool: SchedulingToolName | null;
  outcome: SchedulingToolOutcome;
  requiresClarification: boolean;
  reason: string;
  data?: { appointment?: SchedulingToolAppointment; appointments?: SchedulingToolAppointment[] };
};

// Codes that are safe to hand to the next conversation layer. Anything else is
// collapsed to `failed` so database and infrastructure detail cannot leak.
const safeRejectionCodes = new Set<DomainErrorCode>([
  "appointment_conflict",
  "appointment_outside_business_hours",
  "appointment_blocked_period",
  "appointment_past",
  "appointment_terminal",
  "appointment_transition_invalid",
  "appointment_time_invalid",
  "appointment_duration_invalid",
  "appointment_interval_invalid",
  "appointment_local_time_invalid",
  "appointment_local_time_ambiguous",
  "appointment_reschedule_invalid",
  "appointment_relationship_invalid",
  "scheduling_configuration_unavailable",
  "not_found",
  "forbidden",
]);

const maxQueryResults = 20;
const maxResolutionCandidates = 50;

function result(
  tool: SchedulingToolName | null,
  outcome: SchedulingToolOutcome,
  reason: string,
  data?: SchedulingToolResult["data"]
): SchedulingToolResult {
  return {
    tool,
    outcome,
    requiresClarification: outcome === "ambiguous" || outcome === "not_found",
    reason,
    ...(data ? { data } : {}),
  };
}

function failureResult(tool: SchedulingToolName, error: unknown): SchedulingToolResult {
  if (error instanceof DomainError && safeRejectionCodes.has(error.code)) {
    return result(tool, "rejected", error.code);
  }
  return result(tool, "failed", "unavailable");
}

function toolFor(plan: SchedulingPlan): SchedulingToolName | null {
  switch (plan.action) {
    case "prepare_booking":
      return "book_appointment";
    case "prepare_reschedule":
      return "reschedule_appointment";
    case "prepare_cancellation":
      return "cancel_appointment";
    case "prepare_query":
      return "query_appointments";
    default:
      return null;
  }
}

function summarize(appointment: {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
}): SchedulingToolAppointment {
  return {
    appointmentId: appointment.id,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    status: appointment.status,
  };
}

function endsAtFrom(startsAt: string, durationMinutes: number): string {
  return new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString();
}

export type AppointmentResolution =
  | { status: "resolved"; appointment: SchedulingToolAppointment }
  | { status: "not_found" }
  | { status: "ambiguous" };

/**
 * Deterministic, tenant-scoped resolution of a dialogue reference. Candidates
 * always come from the authoritative query boundary, so another tenant's
 * appointment can never be selected and no identifier can be invented.
 */
export async function resolveAppointmentReference(input: {
  contactId: string;
  localDate: string | null;
  localTime: string | null;
  timezone: string;
}): Promise<AppointmentResolution> {
  const page = await queryAppointments({
    statuses: ["pending", "confirmed"],
    pageSize: maxResolutionCandidates,
  });
  const candidates = page.appointments.filter(
    (appointment) => appointment.contact_id === input.contactId
  );

  const matching = candidates.filter((appointment) => {
    const local = formatLocalDateTimeInput(appointment.starts_at, input.timezone);
    if (input.localDate && local.slice(0, 10) !== input.localDate) return false;
    if (input.localTime && local.slice(11, 16) !== input.localTime) return false;
    return true;
  });

  if (matching.length === 1) return { status: "resolved", appointment: summarize(matching[0]!) };
  if (matching.length === 0) return { status: "not_found" };
  return { status: "ambiguous" };
}

/**
 * Converts a validated Phase 6.3 plan into exactly one authoritative
 * appointment operation. Tool selection is deterministic; the model never
 * chooses a tool and never supplies tenant identifiers.
 */
export async function executeSchedulingTool(input: {
  conversationState: ConversationState;
  plan: SchedulingPlan;
}): Promise<SchedulingToolResult> {
  const { conversationState, plan } = input;

  if (plan.requiresClarification) return result(null, "not_executed", "requires_clarification");
  if (plan.nextStep !== "ready_for_tool") return result(null, "not_executed", "not_ready");
  const tool = toolFor(plan);
  if (!tool) return result(null, "not_executed", "no_scheduling_action");

  // Re-verify ownership against live data; the state object may be stale.
  let conversation: Awaited<ReturnType<typeof getConversation>>;
  try {
    conversation = await getConversation(conversationState.conversationId);
  } catch (error) {
    return failureResult(tool, error);
  }
  if (conversation.contact_id !== conversationState.contactId) {
    return result(tool, "not_executed", "stale_conversation_context");
  }
  const contactId = conversation.contact_id;

  if (tool === "query_appointments") {
    const args = queryAppointmentsArgsSchema.safeParse({
      statuses: ["pending", "confirmed"],
      pageSize: maxQueryResults,
    });
    if (!args.success) return result(tool, "failed", "invalid_arguments");
    try {
      const page = await queryAppointments(args.data);
      return result(tool, "success", "ok", {
        appointments: page.appointments
          .filter((appointment) => appointment.contact_id === contactId)
          .slice(0, maxQueryResults)
          .map(summarize),
      });
    } catch (error) {
      return failureResult(tool, error);
    }
  }

  let timezone: string;
  let defaultDurationMinutes: number;
  try {
    const settings = await getSchedulingSettings();
    timezone = settings.timezone;
    defaultDurationMinutes = settings.default_duration_minutes;
  } catch (error) {
    return failureResult(tool, error);
  }

  const durationMinutes = plan.collectedFields.durationMinutes ?? defaultDurationMinutes;

  if (tool === "book_appointment") {
    const startsAt = plan.collectedFields.startsAt;
    if (!startsAt) return result(tool, "not_executed", "missing_start");
    const args = bookAppointmentArgsSchema.safeParse({ startsAt, durationMinutes });
    if (!args.success) return result(tool, "failed", "invalid_arguments");
    try {
      const appointment = await bookAppointment({
        contactId,
        conversationId: conversation.id,
        startsAt: args.data.startsAt,
        endsAt: endsAtFrom(args.data.startsAt, args.data.durationMinutes),
        status: "pending",
      });
      return result(tool, "success", "ok", { appointment: summarize(appointment) });
    } catch (error) {
      return failureResult(tool, error);
    }
  }

  let resolution: AppointmentResolution;
  try {
    resolution = await resolveAppointmentReference({
      contactId,
      localDate: tool === "cancel_appointment" ? plan.collectedFields.localDate : null,
      localTime: tool === "cancel_appointment" ? plan.collectedFields.localTime : null,
      timezone,
    });
  } catch (error) {
    return failureResult(tool, error);
  }
  if (resolution.status === "not_found") {
    return result(tool, "not_found", "appointment_not_found");
  }
  if (resolution.status === "ambiguous") {
    return result(tool, "ambiguous", "appointment_reference_ambiguous");
  }

  if (tool === "cancel_appointment") {
    try {
      const appointment = await cancelAppointment(resolution.appointment.appointmentId);
      return result(tool, "success", "ok", { appointment: summarize(appointment) });
    } catch (error) {
      return failureResult(tool, error);
    }
  }

  const startsAt = plan.collectedFields.startsAt;
  if (!startsAt) return result(tool, "not_executed", "missing_start");
  const args = rescheduleAppointmentArgsSchema.safeParse({ startsAt, durationMinutes });
  if (!args.success) return result(tool, "failed", "invalid_arguments");
  try {
    const appointment = await rescheduleAppointment(resolution.appointment.appointmentId, {
      startsAt: args.data.startsAt,
      endsAt: endsAtFrom(args.data.startsAt, args.data.durationMinutes),
    });
    return result(tool, "success", "ok", { appointment: summarize(appointment) });
  } catch (error) {
    return failureResult(tool, error);
  }
}
