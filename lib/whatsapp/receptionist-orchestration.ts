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
  const conversationState = await buildConversationStateForOrganization(
    input.organizationId,
    input.conversationId
  );
  const plan = await planSchedulingConversationForOrganization(input.organizationId, conversationState);
  const toolResult = await executeSchedulingToolForOrganization(input.organizationId, {
    conversationState,
    plan,
  });
  const receptionistContext = await getReceptionistContextForOrganization(input.organizationId);
  const replyText = await generateReceptionistReply({
    organizationName: receptionistContext.organizationName,
    instructions: receptionistContext.instructions,
    faq: receptionistContext.faq,
    conversationState,
    plan,
    toolResult,
  });

  const sent = await input.sendReply(replyText);
  await input.recordReply({ text: replyText, providerMessageId: sent.providerMessageId });
  return { replied: true, providerMessageId: sent.providerMessageId };
}

/**
 * Provider-agnostic inbound-to-reply orchestration: build conversation state
 * -> plan -> execute an approved scheduling tool if ready -> generate a
 * bounded, safety-constrained receptionist reply -> send it through the
 * caller-supplied outbound adapter -> record it. Intended for reuse by a
 * future Meta background worker; the Meta webhook route itself is not wired
 * to this in this change. Bounded by an overall timeout so a slow AI or
 * provider call cannot hang the caller indefinitely; on timeout or any
 * unexpected failure, no reply is sent and the caller is told so safely.
 */
export async function runReceptionistOrchestration(
  input: ReceptionistOrchestrationInput
): Promise<ReceptionistOrchestrationResult> {
  const timeoutMs = input.timeoutMs ?? defaultOrchestrationTimeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ReceptionistOrchestrationResult>((resolve) => {
    timer = setTimeout(() => resolve({ replied: false, reason: "orchestration_timeout" }), timeoutMs);
  });
  try {
    return await Promise.race([runOrchestration(input), timeout]);
  } catch {
    return { replied: false, reason: "orchestration_failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
