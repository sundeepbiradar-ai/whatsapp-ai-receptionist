import "server-only";

import { buildConversationStateForOrganization } from "@/lib/ai/service-conversation-state";
import { planSchedulingConversationForOrganization } from "@/lib/ai/service-scheduling-conversation";
import { executeSchedulingToolForOrganization } from "@/lib/ai/service-scheduling-tools";
import { generateReceptionistReply } from "@/lib/ai/receptionist-reply";
import { getReceptionistContextForOrganization } from "@/lib/domain/business/service-repository";

const defaultOrchestrationTimeoutMs = 15_000;

export type ReceptionistOrchestrationInput = {
  organizationId: string;
  conversationId: string;
  /** Send the generated reply text through a provider-specific outbound adapter. */
  sendReply: (text: string) => Promise<{ providerMessageId: string }>;
  /** Persist the already-sent reply as an outbound message, provider-specific. */
  recordReply: (input: { text: string; providerMessageId: string }) => Promise<void>;
  timeoutMs?: number;
};

export type ReceptionistOrchestrationResult =
  | { replied: true; providerMessageId: string }
  | { replied: false; reason: string };

async function runOrchestration(
  input: ReceptionistOrchestrationInput
): Promise<ReceptionistOrchestrationResult> {
  try {
    console.error("whatsapp_orchestration_stage", {
      stage: "conversation_state_start",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });
    const conversationState = await buildConversationStateForOrganization(
      input.organizationId,
      input.conversationId
    );
    console.error("whatsapp_orchestration_stage", {
      stage: "conversation_state_success",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });

    console.error("whatsapp_orchestration_stage", {
      stage: "scheduling_plan_start",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });
    const plan = await planSchedulingConversationForOrganization(input.organizationId, conversationState);
    console.error("whatsapp_orchestration_stage", {
      stage: "scheduling_plan_success",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });

    console.error("whatsapp_orchestration_stage", {
      stage: "scheduling_tool_start",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });
    const toolResult = await executeSchedulingToolForOrganization(input.organizationId, {
      conversationState,
      plan,
    });
    console.error("whatsapp_orchestration_stage", {
      stage: "scheduling_tool_success",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });

    console.error("whatsapp_orchestration_stage", {
      stage: "receptionist_context_start",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });
    const receptionistContext = await getReceptionistContextForOrganization(input.organizationId);
    console.error("whatsapp_orchestration_stage", {
      stage: "receptionist_context_success",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });

    console.error("whatsapp_orchestration_stage", {
      stage: "reply_generation_start",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });
    const replyText = await generateReceptionistReply({
      organizationName: receptionistContext.organizationName,
      instructions: receptionistContext.instructions,
      faq: receptionistContext.faq,
      conversationState,
      plan,
      toolResult,
    });
    console.error("whatsapp_orchestration_stage", {
      stage: "reply_generation_success",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });

    console.error("whatsapp_orchestration_stage", {
      stage: "outbound_send_start",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });
    const sent = await input.sendReply(replyText);
    console.error("whatsapp_orchestration_stage", {
      stage: "outbound_send_success",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });

    console.error("whatsapp_orchestration_stage", {
      stage: "outbound_record_start",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });
    await input.recordReply({ text: replyText, providerMessageId: sent.providerMessageId });
    console.error("whatsapp_orchestration_stage", {
      stage: "outbound_record_success",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });

    return { replied: true, providerMessageId: sent.providerMessageId };
  } catch (error) {
    console.error("whatsapp_orchestration_stage", {
      stage: "orchestration_failed",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Provider-agnostic inbound-to-reply orchestration: build conversation state
 * -> plan -> execute an approved scheduling tool if ready -> generate a
 * bounded, safety-constrained receptionist reply -> send it through the
 * caller-supplied outbound adapter -> record it. Called by the durable Meta
 * AI worker; the webhook only persists and queues inbound work. Bounded by an
 * overall timeout so a slow AI or
 * provider call cannot hang the caller indefinitely; on timeout or any
 * unexpected failure, no reply is sent and the caller is told so safely.
 */
export async function runReceptionistOrchestration(
  input: ReceptionistOrchestrationInput
): Promise<ReceptionistOrchestrationResult> {
  const timeoutMs = input.timeoutMs ?? defaultOrchestrationTimeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ReceptionistOrchestrationResult>((resolve) => {
    timer = setTimeout(() => {
      console.error("whatsapp_orchestration_stage", {
        stage: "orchestration_timeout",
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        timeoutMs,
      });
      resolve({ replied: false, reason: "orchestration_timeout" });
    }, timeoutMs);
  });
  try {
    return await Promise.race([runOrchestration(input), timeout]);
  } catch (error) {
    console.error("whatsapp_orchestration_stage", {
      stage: "orchestration_failed",
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { replied: false, reason: "orchestration_failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
