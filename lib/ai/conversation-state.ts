import "server-only";

import { detectIntent } from "@/lib/ai/intent-classifier";
import { unknownResult, type Intent, type IntentReason } from "@/lib/ai/intent";
import { requireDomainOrganization } from "@/lib/domain/context";
import { DomainError, mapDomainDatabaseError } from "@/lib/domain/errors";
import { idSchema, parseDomain } from "@/lib/domain/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const recentMessageLimit = 20;

export type ConversationStateMessage = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  createdAt: string;
};

export type ConversationState = {
  organizationId: string;
  conversationId: string;
  contactId: string;
  conversationStatus: "open" | "closed";
  isConversationOpen: boolean;
  hasRecentInboundMessage: boolean;
  latestInboundMessageId: string | null;
  latestInboundMessageText: string | null;
  detectedIntent: Intent;
  requiresClarification: boolean;
  intentReason: IntentReason;
  recentMessages: ConversationStateMessage[];
};

/**
 * Derives read-only conversation state. The organization is taken from the
 * authenticated session, never from the caller, so a conversation id alone
 * cannot reach another tenant.
 */
export async function buildConversationState(input: {
  conversationId: string;
}): Promise<ConversationState> {
  const context = await requireDomainOrganization();
  const organizationId = context.currentOrganization.id;
  const conversationId = parseDomain(idSchema, input.conversationId);
  const supabase = await createServerSupabaseClient();

  const conversation = await supabase
    .from("conversations")
    .select("id, contact_id, status")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle();
  if (conversation.error) throw mapDomainDatabaseError(conversation.error);
  if (!conversation.data) throw new DomainError("not_found", "Conversation not found.");

  // Newest-first with a bound, then reversed, so the window is the most recent
  // messages rather than the oldest.
  const history = await supabase
    .from("messages")
    .select("id, direction, content, created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
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

  const intent = latestInbound
    ? await detectIntent({ messageText: latestInbound.content })
    : unknownResult("no_inbound_message");

  return {
    organizationId,
    conversationId,
    contactId: conversation.data.contact_id,
    conversationStatus: conversation.data.status,
    isConversationOpen: conversation.data.status === "open",
    hasRecentInboundMessage: Boolean(latestInbound),
    latestInboundMessageId: latestInbound?.id ?? null,
    latestInboundMessageText: latestInbound?.content ?? null,
    detectedIntent: intent.intent,
    requiresClarification: intent.requiresClarification,
    intentReason: intent.reason,
    recentMessages,
  };
}
