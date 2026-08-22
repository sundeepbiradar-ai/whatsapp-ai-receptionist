import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { DomainError, mapDomainDatabaseError } from "@/lib/domain/errors";
import { idSchema, parseDomain } from "@/lib/domain/validation";

/**
 * Records an already-sent Meta Cloud reply against the conversation. This is a
 * narrow, single-purpose insert used only after a successful outbound provider
 * send and only with a trusted organization id resolved from verified config.
 */
export async function recordOutboundMetaReply(input: {
  organizationId: string;
  conversationId: string;
  text: string;
  providerMessageId: string;
}): Promise<{ messageId: string }> {
  const organizationId = parseDomain(idSchema, input.organizationId);
  const conversationId = parseDomain(idSchema, input.conversationId);
  const supabase = createServiceRoleClient("whatsapp_pipeline_persistence_failed");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: "outbound",
      content: input.text,
      provider: "meta_whatsapp_cloud",
      provider_message_id: input.providerMessageId,
      delivery_status: "sent",
      delivery_status_at: now,
    })
    .select("id")
    .single();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) {
    throw new DomainError(
      "whatsapp_pipeline_persistence_failed",
      "The WhatsApp reply could not be recorded."
    );
  }
  return { messageId: data.id };
}

/**
 * Records an already-sent Twilio sandbox reply against the conversation. This
 * is a narrow, single-purpose insert (not a generic mutation surface): it is
 * only ever called after a successful outbound provider send, and only with a
 * trusted organization id resolved from verified provider configuration.
 */
export async function recordOutboundTwilioReply(input: {
  organizationId: string;
  conversationId: string;
  text: string;
  providerMessageId: string;
}): Promise<{ messageId: string }> {
  const organizationId = parseDomain(idSchema, input.organizationId);
  const conversationId = parseDomain(idSchema, input.conversationId);
  const supabase = createServiceRoleClient("whatsapp_pipeline_persistence_failed");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: "outbound",
      content: input.text,
      provider: "twilio_whatsapp_sandbox",
      provider_message_id: input.providerMessageId,
      delivery_status: "sent",
      delivery_status_at: now,
    })
    .select("id")
    .single();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) {
    throw new DomainError(
      "whatsapp_pipeline_persistence_failed",
      "The WhatsApp reply could not be recorded."
    );
  }
  return { messageId: data.id };
}
