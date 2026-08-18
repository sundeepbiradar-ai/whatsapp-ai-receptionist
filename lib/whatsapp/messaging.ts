import "server-only";

import { requireDomainOrganization } from "@/lib/domain/context";
import { DomainError, mapDomainDatabaseError } from "@/lib/domain/errors";
import { idSchema, parseDomain } from "@/lib/domain/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { metaWhatsAppProvider } from "@/lib/whatsapp/configuration";
import {
  classifyWhatsAppFailure,
  whatsAppRetryAfterSeconds,
  type WhatsAppFailureClass,
} from "@/lib/whatsapp/failures";
import { sendWhatsAppText } from "@/lib/whatsapp/outbound";
import { computeNextAttemptAt, type RetryDelayOptions } from "@/lib/whatsapp/retry-policy";

export type SendWhatsAppConversationMessageInput = {
  conversationId: string;
  text: string;
  random?: () => number;
};

export type SendWhatsAppConversationMessageResult = {
  messageId: string;
  conversationId: string;
  providerMessageId: string;
  deliveryStatus: "sent";
};

export type WhatsAppSendFailure = {
  code: DomainError["code"];
  failureClass: WhatsAppFailureClass;
};

const maxTextLength = 4096;

function failureFrom(error: unknown): WhatsAppSendFailure {
  const code = error instanceof DomainError ? error.code : "whatsapp_provider_response_invalid";
  return { code, failureClass: classifyWhatsAppFailure(code) };
}

/**
 * Reserve -> send -> correlate. There is no cross-boundary atomicity across an
 * HTTP provider call, so the reserved row stays durable: a retryable failure
 * leaves the message pending with exactly one live retry job, an ambiguous
 * outcome becomes `unconfirmed` and is never retried automatically, and a
 * permanent failure becomes `failed`.
 */
export async function sendWhatsAppConversationMessage(
  input: SendWhatsAppConversationMessageInput
): Promise<SendWhatsAppConversationMessageResult> {
  const context = await requireDomainOrganization();
  const organizationId = context.currentOrganization.id;
  const conversationId = parseDomain(idSchema, input.conversationId);
  const text = input.text.trim();
  if (!text || text.length > maxTextLength) {
    throw new DomainError("whatsapp_message_invalid", "The WhatsApp message text is invalid.");
  }

  const supabase = await createServerSupabaseClient();
  const conversation = await supabase
    .from("conversations")
    .select("id, contact_id, channel, whatsapp_config_id")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle();
  if (conversation.error) throw mapDomainDatabaseError(conversation.error);
  if (!conversation.data) throw new DomainError("not_found", "Conversation not found.");
  if (conversation.data.channel !== "whatsapp" || !conversation.data.whatsapp_config_id) {
    throw new DomainError(
      "whatsapp_conversation_invalid",
      "The conversation is not a WhatsApp conversation."
    );
  }

  const contact = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("organization_id", organizationId)
    .eq("id", conversation.data.contact_id)
    .maybeSingle();
  if (contact.error) throw mapDomainDatabaseError(contact.error);
  if (!contact.data?.phone) {
    throw new DomainError("whatsapp_destination_invalid", "The WhatsApp destination is invalid.");
  }

  const reserved = await supabase
    .from("messages")
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: "outbound",
      content: text,
      provider: metaWhatsAppProvider,
      delivery_status: "pending",
      delivery_status_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (reserved.error) throw mapDomainDatabaseError(reserved.error);
  const messageId = reserved.data.id;

  async function settleMessage(
    status: "failed" | "unconfirmed",
    failure: WhatsAppSendFailure
  ): Promise<void> {
    await supabase
      .from("messages")
      .update({
        delivery_status: status,
        delivery_status_at: new Date().toISOString(),
        delivery_error_code: failure.code,
        delivery_error_message: failure.failureClass,
      })
      .eq("organization_id", organizationId)
      .eq("id", messageId);
  }

  let providerMessageId: string;
  try {
    const sent = await sendWhatsAppText({
      organizationId,
      to: contact.data.phone,
      text,
    });
    providerMessageId = sent.providerMessageId;
  } catch (error) {
    const failure = failureFrom(error);
    if (failure.failureClass === "retryable") {
      const delayOptions: RetryDelayOptions = {
        retryAfterSeconds: whatsAppRetryAfterSeconds(error),
        ...(input.random ? { random: input.random } : {}),
      };
      // The message stays pending so the durable worker can claim exactly one job.
      const enqueued = await supabase.rpc("enqueue_whatsapp_send_job", {
        target_organization_id: organizationId,
        target_message_id: messageId,
        target_next_attempt_at: computeNextAttemptAt(1, delayOptions),
        target_error_code: failure.code,
        target_error_message: failure.failureClass,
      });
      if (enqueued.error) await settleMessage("unconfirmed", failure);
    } else {
      await settleMessage(failure.failureClass === "ambiguous" ? "unconfirmed" : "failed", failure);
    }
    throw error instanceof DomainError
      ? error
      : new DomainError(
          "whatsapp_provider_response_invalid",
          "The WhatsApp provider response is invalid."
        );
  }

  const correlated = await supabase
    .from("messages")
    .update({
      provider_message_id: providerMessageId,
      delivery_status: "sent",
      delivery_status_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", messageId)
    .select("id")
    .maybeSingle();
  if (correlated.error || !correlated.data) {
    // The provider accepted the message but correlation failed. This is
    // ambiguous, so it is never retried automatically.
    await settleMessage("unconfirmed", {
      code: "whatsapp_message_unconfirmed",
      failureClass: "ambiguous",
    });
    throw new DomainError(
      "whatsapp_message_unconfirmed",
      "The WhatsApp message was sent but could not be confirmed."
    );
  }

  return {
    messageId,
    conversationId,
    providerMessageId,
    deliveryStatus: "sent",
  };
}
