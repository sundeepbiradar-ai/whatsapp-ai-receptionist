import "server-only";

import type { ConversationState } from "@/lib/ai/conversation-state";
import type { Intent } from "@/lib/ai/intent";
import {
  emptyExtraction,
  extractSchedulingDetails,
  findContextReferents,
  type SchedulingExtraction,
} from "@/lib/ai/scheduling-extraction";
import { getSchedulingSettings } from "@/lib/domain/appointments/repository";
import {
  formatLocalDateTimeInput,
  localDateTimeToUtc,
} from "@/lib/domain/appointments/scheduling";
import { DomainError } from "@/lib/domain/errors";

export type SchedulingAction =
  | "prepare_booking"
  | "prepare_reschedule"
  | "prepare_cancellation"
  | "prepare_query"
  | "no_scheduling_action";

export type SchedulingNextStep =
  | "ask_for_date"
  | "ask_for_time"
  | "ask_for_appointment_reference"
  | "ask_for_clarification"
  | "ready_for_tool"
  | "no_action";

export type SchedulingField = "date" | "time" | "appointment_reference";

export type SchedulingReason =
  | "ready"
  | "intent_requires_clarification"
  | "no_scheduling_intent"
  | "missing_date"
  | "missing_time"
  | "missing_appointment_reference"
  | "ambiguous_appointment_reference"
  | "local_time_invalid"
  | "local_time_ambiguous"
  | "scheduling_unconfigured";

export type SchedulingPlan = {
  intent: Intent;
  action: SchedulingAction;
  requiresClarification: boolean;
  missingFields: SchedulingField[];
  collectedFields: {
    timezone: string | null;
    localDate: string | null;
    localTime: string | null;
    startsAt: string | null;
    durationMinutes: number | null;
    referencesExistingAppointment: boolean;
  };
  nextStep: SchedulingNextStep;
  reason: SchedulingReason;
};

const schedulingIntents: Record<Intent, SchedulingAction> = {
  book_appointment: "prepare_booking",
  reschedule_appointment: "prepare_reschedule",
  cancel_appointment: "prepare_cancellation",
  query_appointment: "prepare_query",
  general_question: "no_scheduling_action",
  greeting: "no_scheduling_action",
  unknown: "no_scheduling_action",
};

function plan(
  state: ConversationState,
  action: SchedulingAction,
  nextStep: SchedulingNextStep,
  reason: SchedulingReason,
  missingFields: SchedulingField[],
  collected: Partial<SchedulingPlan["collectedFields"]> = {}
): SchedulingPlan {
  return {
    intent: state.detectedIntent,
    action,
    requiresClarification: nextStep === "ask_for_clarification",
    missingFields,
    collectedFields: {
      timezone: null,
      localDate: null,
      localTime: null,
      startsAt: null,
      durationMinutes: null,
      referencesExistingAppointment: false,
      ...collected,
    },
    nextStep,
    reason,
  };
}

/**
 * Derives the next scheduling dialogue step. It never books, reschedules,
 * cancels or queries: it only reports what Phase 6.4 would still need.
 */
export async function planSchedulingConversation(
  state: ConversationState
): Promise<SchedulingPlan> {
  const action = schedulingIntents[state.detectedIntent];

  if (state.requiresClarification) {
    return plan(state, "no_scheduling_action", "ask_for_clarification", "intent_requires_clarification", []);
  }
  if (action === "no_scheduling_action") {
    return plan(state, action, "no_action", "no_scheduling_intent", []);
  }

  let timezone: string;
  let durationMinutes: number;
  try {
    const settings = await getSchedulingSettings();
    timezone = settings.timezone;
    durationMinutes = settings.default_duration_minutes;
  } catch {
    return plan(state, action, "ask_for_clarification", "scheduling_unconfigured", []);
  }

  // Appointment queries need no caller-supplied fields under the Phase 4.7 contract.
  if (action === "prepare_query") {
    return plan(state, action, "ready_for_tool", "ready", [], { timezone, durationMinutes });
  }

  const messageText = state.latestInboundMessageText ?? "";
  const referenceDate = formatLocalDateTimeInput(new Date().toISOString(), timezone).slice(0, 10);
  const extraction: SchedulingExtraction =
    (await extractSchedulingDetails({ messageText, referenceDate, timezone })) ?? emptyExtraction;

  const contextReferents = findContextReferents(
    state.recentMessages.map((message) => message.content)
  );
  const hasExplicitReference = extraction.mentionsExistingAppointment || extraction.time !== null;
  const hasResolvedReference = hasExplicitReference || contextReferents.length === 1;
  const collected = {
    timezone,
    durationMinutes,
    localDate: extraction.date,
    localTime: extraction.time,
    referencesExistingAppointment: hasResolvedReference,
  };

  if (action === "prepare_cancellation") {
    if (!hasResolvedReference) {
      return plan(
        state,
        action,
        contextReferents.length > 1 ? "ask_for_clarification" : "ask_for_appointment_reference",
        contextReferents.length > 1
          ? "ambiguous_appointment_reference"
          : "missing_appointment_reference",
        ["appointment_reference"],
        collected
      );
    }
    return plan(state, action, "ready_for_tool", "ready", [], collected);
  }

  if (action === "prepare_reschedule" && !hasResolvedReference) {
    return plan(
      state,
      action,
      contextReferents.length > 1 ? "ask_for_clarification" : "ask_for_appointment_reference",
      contextReferents.length > 1
        ? "ambiguous_appointment_reference"
        : "missing_appointment_reference",
      ["appointment_reference"],
      collected
    );
  }

  if (!extraction.date) {
    return plan(state, action, "ask_for_date", "missing_date", ["date"], collected);
  }
  if (!extraction.time) {
    return plan(state, action, "ask_for_time", "missing_time", ["time"], collected);
  }

  try {
    const startsAt = localDateTimeToUtc(`${extraction.date}T${extraction.time}`, timezone);
    return plan(state, action, "ready_for_tool", "ready", [], { ...collected, startsAt });
  } catch (error) {
    const ambiguous =
      error instanceof DomainError && error.code === "appointment_local_time_ambiguous";
    return plan(
      state,
      action,
      "ask_for_clarification",
      ambiguous ? "local_time_ambiguous" : "local_time_invalid",
      ["time"],
      collected
    );
  }
}
