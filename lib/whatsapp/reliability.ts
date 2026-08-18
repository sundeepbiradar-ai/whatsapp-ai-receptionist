import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/domain/errors";
import type { WhatsAppStatusEvent } from "@/lib/whatsapp/meta";
import type { Database, Json } from "@/lib/supabase/database";
import {
  isWhatsAppDeliveryStatus,
  type DeliveryTransitionOutcome,
  type WhatsAppDeliveryStatus,
} from "@/lib/whatsapp/delivery-state";

export type WhatsAppStatusOutcome =
  | DeliveryTransitionOutcome
  | "unknown_message"
  | "ignored_non_outbound";

export type WhatsAppStatusResult = {
  organizationId: string;
  providerMessageId: string;
  outcome: WhatsAppStatusOutcome;
  messageId: string | null;
  status: WhatsAppDeliveryStatus | null;
  previousStatus: WhatsAppDeliveryStatus | null;
};

type StatusRpcResult = {
  ok?: boolean;
  error_code?: string;
  outcome?: string;
  message_id?: string;
  status?: string;
  previous_status?: string;
};

const statusOutcomes: readonly WhatsAppStatusOutcome[] = [
  "applied",
  "ignored_duplicate",
  "ignored_stale",
  "ignored_terminal",
  "unknown_message",
  "ignored_non_outbound",
];

function serviceRoleClient(): SupabaseClient<Database> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) {
    throw new DomainError(
      "whatsapp_status_persistence_failed",
      "The WhatsApp delivery status could not be persisted."
    );
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function validEvent(event: WhatsAppStatusEvent): boolean {
  return (
    event.kind === "status" &&
    event.provider === "meta_whatsapp_cloud" &&
    Boolean(event.organizationId) &&
    Boolean(event.configId) &&
    Boolean(event.providerMessageId.trim()) &&
    ["sent", "delivered", "read", "failed"].includes(event.status) &&
    !Number.isNaN(new Date(event.timestamp).getTime())
  );
}

function persistenceFailure(): DomainError {
  return new DomainError(
    "whatsapp_status_persistence_failed",
    "The WhatsApp delivery status could not be persisted."
  );
}

function parseResult(value: Json, event: WhatsAppStatusEvent): WhatsAppStatusResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw persistenceFailure();
  const result = value as StatusRpcResult;
  if (!result.ok) {
    if (result.error_code === "whatsapp_tenant_mismatch") {
      throw new DomainError(
        "whatsapp_tenant_mismatch",
        "The WhatsApp status organization is invalid."
      );
    }
    if (result.error_code === "whatsapp_pipeline_input_invalid") {
      throw new DomainError(
        "whatsapp_pipeline_input_invalid",
        "The WhatsApp status event is invalid."
      );
    }
    throw persistenceFailure();
  }
  const outcome = statusOutcomes.find((candidate) => candidate === result.outcome);
  if (!outcome) throw persistenceFailure();
  return {
    organizationId: event.organizationId,
    providerMessageId: event.providerMessageId,
    outcome,
    messageId: typeof result.message_id === "string" ? result.message_id : null,
    status: isWhatsAppDeliveryStatus(result.status) ? result.status : null,
    previousStatus: isWhatsAppDeliveryStatus(result.previous_status) ? result.previous_status : null,
  };
}

export async function applyWhatsAppStatusEvent(
  event: WhatsAppStatusEvent
): Promise<WhatsAppStatusResult> {
  if (!validEvent(event)) {
    throw new DomainError(
      "whatsapp_pipeline_input_invalid",
      "The WhatsApp status event is invalid."
    );
  }
  const { data, error } = await serviceRoleClient().rpc("apply_whatsapp_message_status", {
    target_organization_id: event.organizationId,
    target_whatsapp_config_id: event.configId,
    target_provider_message_id: event.providerMessageId,
    target_status: event.status,
    target_status_at: event.timestamp,
    target_error_code: event.errorCode ?? undefined,
    target_error_message: event.errorMessage ?? undefined,
    target_provider: event.provider,
  });
  if (error) throw persistenceFailure();
  return parseResult(data, event);
}
