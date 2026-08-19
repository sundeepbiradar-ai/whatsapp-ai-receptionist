import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/domain/errors";
import type { WhatsAppInboundMessageEvent } from "@/lib/whatsapp/meta";
import type { Database, Json } from "@/lib/supabase/database";

export type InboundWhatsAppPipelineResult = {
  organizationId: string;
  contactId: string;
  conversationId: string;
  messageId: string | null;
  providerMessageId: string;
  duplicate: boolean;
};

type PipelineRpcResult = {
  ok?: boolean;
  error_code?: string;
  contact_id?: string;
  conversation_id?: string;
  message_id?: string;
  provider_message_id?: string;
};

function serviceRoleClient(): SupabaseClient<Database> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) {
    throw new DomainError(
      "whatsapp_pipeline_persistence_failed",
      "The WhatsApp message could not be persisted."
    );
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function validEvent(event: WhatsAppInboundMessageEvent): boolean {
  return (
    event.kind === "message" &&
    (event.provider === "meta_whatsapp_cloud" || event.provider === "twilio_whatsapp_sandbox") &&
    Boolean(event.organizationId) &&
    Boolean(event.configId) &&
    Boolean(event.phoneNumberId) &&
    Boolean(event.providerMessageId) &&
    Boolean(event.senderPhone) &&
    Boolean(event.text.trim()) &&
    !Number.isNaN(new Date(event.timestamp).getTime())
  );
}

function mapPipelineError(errorCode: string | undefined): DomainError {
  switch (errorCode) {
    case "whatsapp_pipeline_input_invalid":
      return new DomainError(
        "whatsapp_pipeline_input_invalid",
        "The WhatsApp message event is invalid."
      );
    case "whatsapp_tenant_mismatch":
      return new DomainError(
        "whatsapp_tenant_mismatch",
        "The WhatsApp message organization is invalid."
      );
    case "whatsapp_duplicate_provider_message":
      return new DomainError(
        "whatsapp_duplicate_provider_message",
        "The WhatsApp provider message was already received."
      );
    default:
      return new DomainError(
        "whatsapp_pipeline_persistence_failed",
        "The WhatsApp message could not be persisted."
      );
  }
}

function parseResult(
  value: Json,
  organizationId: string,
  providerMessageId: string
): InboundWhatsAppPipelineResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(
      "whatsapp_pipeline_persistence_failed",
      "The WhatsApp message could not be persisted."
    );
  }
  const result = value as PipelineRpcResult;
  if (!result.ok && result.error_code !== "whatsapp_duplicate_provider_message") {
    throw mapPipelineError(result.error_code);
  }
  const contactId = result.contact_id;
  const conversationId = result.conversation_id;
  if (typeof contactId !== "string" || typeof conversationId !== "string") {
    throw new DomainError(
      "whatsapp_pipeline_persistence_failed",
      "The WhatsApp message could not be persisted."
    );
  }
  return {
    organizationId,
    contactId,
    conversationId,
    messageId: typeof result.message_id === "string" ? result.message_id : null,
    providerMessageId,
    duplicate: result.error_code === "whatsapp_duplicate_provider_message",
  };
}

export async function processInboundWhatsAppMessage(
  event: WhatsAppInboundMessageEvent
): Promise<InboundWhatsAppPipelineResult> {
  if (!validEvent(event)) {
    throw new DomainError(
      "whatsapp_pipeline_input_invalid",
      "The WhatsApp message event is invalid."
    );
  }
  const { data, error } = await serviceRoleClient().rpc("process_inbound_whatsapp_message", {
    target_organization_id: event.organizationId,
    target_whatsapp_config_id: event.configId,
    target_sender_phone: event.senderPhone,
    target_provider_message_id: event.providerMessageId,
    target_content: event.text,
    target_created_at: event.timestamp,
    target_provider: event.provider,
  });
  if (error) {
    throw new DomainError(
      "whatsapp_pipeline_persistence_failed",
      "The WhatsApp message could not be persisted."
    );
  }
  return parseResult(data, event.organizationId, event.providerMessageId);
}
