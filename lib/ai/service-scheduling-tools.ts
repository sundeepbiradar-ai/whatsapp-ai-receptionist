import "server-only";

import type { ConversationState } from "@/lib/ai/conversation-state";
import type { SchedulingPlan } from "@/lib/ai/scheduling-conversation";
import type { SchedulingToolName, SchedulingToolResult, SchedulingToolAppointment } from "@/lib/ai/scheduling-tools";
import { getConversationForOrganization } from "@/lib/domain/conversations/service-repository";
import { queryAppointmentsForOrganizationAndContact } from "@/lib/domain/appointments/service-repository";

const maxQueryResults = 20;

function summarize(appointment: { id: string; starts_at: string; ends_at: string; status: string }): SchedulingToolAppointment {
  return { appointmentId: appointment.id, startsAt: appointment.starts_at, endsAt: appointment.ends_at, status: appointment.status };
}

function result(
  tool: SchedulingToolName | null,
  outcome: SchedulingToolResult["outcome"],
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

/**
 * Service-role counterpart to `executeSchedulingTool` for the webhook
 * orchestration path only. Read-only `query_appointments` is fully reused
 * (same tenant-scoped repository query shape). Booking, rescheduling, and
 * cancellation are NOT executed here: the underlying
 * `book_or_reschedule_appointment` RPC is `security invoker` and granted only
 * to `authenticated`, i.e. it requires a real user session and cannot be
 * safely reused by a service-role webhook caller without changing that RPC's
 * security model, which is out of scope for this sandbox change. Those
 * intents are safely reported as not executed rather than duplicating (or
 * weakening) the booking RPC's validation.
 */
export async function executeSchedulingToolForOrganization(
  organizationId: string,
  input: { conversationState: ConversationState; plan: SchedulingPlan }
): Promise<SchedulingToolResult> {
  const { conversationState, plan } = input;

  if (plan.requiresClarification) return result(null, "not_executed", "requires_clarification");
  if (plan.nextStep !== "ready_for_tool") return result(null, "not_executed", "not_ready");
  const tool = toolFor(plan);
  if (!tool) return result(null, "not_executed", "no_scheduling_action");

  const conversation = await getConversationForOrganization(organizationId, conversationState.conversationId);
  if (conversation.contact_id !== conversationState.contactId) {
    return result(tool, "not_executed", "stale_conversation_context");
  }

  if (tool !== "query_appointments") {
    return result(tool, "not_executed", "sandbox_mutation_unavailable");
  }

  const appointments = await queryAppointmentsForOrganizationAndContact(
    organizationId,
    conversation.contact_id,
    { statuses: ["pending", "confirmed"], pageSize: maxQueryResults }
  );
  return result(tool, "success", "ok", { appointments: appointments.map(summarize) });
}
