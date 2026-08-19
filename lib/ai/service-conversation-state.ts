import "server-only";

import { detectIntent } from "@/lib/ai/intent-classifier";
import { unknownResult, type Intent, type IntentReason } from "@/lib/ai/intent";
import type { ConversationState, ConversationStateMessage } from "@/lib/ai/conversation-state";
import { recentMessageLimit } from "@/lib/ai/conversation-state";
import { getConversationForOrganization } from "@/lib/domain/conversations/service-repository";
import { DomainError, mapDomainDatabaseError } from "@/lib/domain/errors";
import { idSchema, parseDomain } from "@/lib/domain/validation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Service-role counterpart to `buildConversationState` for the webhook
 * orchestration path only. The organization id must come from a trusted,
 * already-verified source (a resolved provider configuration), never from
 * request input. Reuses the same intent detection used by the session-bound
 * path; the session-bound `buildConversationState` is untouched.
 */
export async function buildConversationStateForOrganization(
  organizationId: string,
  conversationId: string
): Promise<ConversationState> {
  const validOrganizationId = parseDomain(idSchema, organizationId);
  const validConversationId = parseDomain(idSchema, conversationId);

  const conversation = await getConversationForOrganization(validOrganizationId, validConversationId);

  const supabase = createServiceRoleClient("whatsapp_pipeline_persistence_failed");
  const history = await supabase
    .from("messages")
    .select("id, direction, content, created_at")
    .eq("organization_id", validOrganizationId)
    .eq("conversation_id", validConversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(recentMessageLimit);
  if (history.error) throw mapDomainDatabaseError(history.error);

  const recentMessages: ConversationStateMessage[] = [...(history.data ?? [])]
    .reverse()
    .map((message) => ({
      id: message.id,
      direction: message.direction,
      content: message.content,
      createdAt: message.created_at,
    }));

  const latestInbound = [...recentMessages]
    .reverse()
    .find((message) => message.direction === "inbound");

  const intent: { intent: Intent; requiresClarification: boolean; reason: IntentReason } =
    latestInbound
      ? await detectIntent({ messageText: latestInbound.content })
      : unknownResult("no_inbound_message");

  if (conversation.channel !== "whatsapp" || !conversation.whatsapp_config_id) {
    throw new DomainError("whatsapp_conversation_invalid", "The conversation is not a WhatsApp conversation.");
  }

  return {
    organizationId: validOrganizationId,
    conversationId: validConversationId,
    contactId: conversation.contact_id,
    conversationStatus: conversation.status,
    isConversationOpen: conversation.status === "open",
    hasRecentInboundMessage: Boolean(latestInbound),
    latestInboundMessageId: latestInbound?.id ?? null,
    latestInboundMessageText: latestInbound?.content ?? null,
    detectedIntent: intent.intent,
    requiresClarification: intent.requiresClarification,
    intentReason: intent.reason,
    recentMessages,
  };
}
