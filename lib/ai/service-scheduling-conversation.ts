import "server-only";

import type { ConversationState } from "@/lib/ai/conversation-state";
import {
  emptyExtraction,
  extractSchedulingDetails,
  findContextReferents,
  type SchedulingExtraction,
} from "@/lib/ai/scheduling-extraction";
import type { SchedulingAction, SchedulingPlan, SchedulingNextStep, SchedulingReason, SchedulingField } from "@/lib/ai/scheduling-conversation";
import { getSchedulingSettingsForOrganization } from "@/lib/domain/appointments/service-repository";
import { formatLocalDateTimeInput, localDateTimeToUtc } from "@/lib/domain/appointments/scheduling";
import { DomainError } from "@/lib/domain/errors";

const schedulingIntents: Record<ConversationState["detectedIntent"], SchedulingAction> = {
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
 * Service-role counterpart to `planSchedulingConversation` for the webhook
 * orchestration path only. Reuses the same extraction/business-hours-timezone
 * helpers as the session-bound planner; only the scheduling-settings lookup
 * differs (organization-scoped service read instead of the session boundary).
 * Never books, reschedules, cancels, or queries.
 */
export async function planSchedulingConversationForOrganization(
  organizationId: string,
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
    const settings = await getSchedulingSettingsForOrganization(organizationId);
    timezone = settings.parsed.timezone;
    durationMinutes = settings.parsed.default_duration_minutes;
  } catch {
    return plan(state, action, "ask_for_clarification", "scheduling_unconfigured", []);
  }

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

  if (action === "prepare_cancellation" || action === "prepare_reschedule") {
    if (!hasResolvedReference) {
      return plan(
        state,
        action,
        contextReferents.length > 1 ? "ask_for_clarification" : "ask_for_appointment_reference",
        contextReferents.length > 1 ? "ambiguous_appointment_reference" : "missing_appointment_reference",
        ["appointment_reference"],
        collected
      );
    }
    if (action === "prepare_cancellation") {
      return plan(state, action, "ready_for_tool", "ready", [], collected);
    }
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
    const ambiguous = error instanceof DomainError && error.code === "appointment_local_time_ambiguous";
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
