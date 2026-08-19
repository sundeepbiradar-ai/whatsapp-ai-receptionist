import "server-only";

import type { Database } from "@/lib/supabase/database";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { DomainError, mapDomainDatabaseError } from "@/lib/domain/errors";
import { idSchema, parseDomain } from "@/lib/domain/validation";

type Conversation = Database["public"]["Tables"]["conversations"]["Row"];

/**
 * Service-role read used only by the webhook orchestration path. The
 * organization id must come from a trusted, already-verified source (a
 * resolved provider configuration) and is never accepted from request input.
 * Every query is still explicitly scoped by organization id.
 */
export async function getConversationForOrganization(
  organizationId: string,
  conversationId: string
): Promise<Conversation> {
  const validOrganizationId = parseDomain(idSchema, organizationId);
  const validConversationId = parseDomain(idSchema, conversationId);
  const supabase = createServiceRoleClient("whatsapp_pipeline_persistence_failed");
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, organization_id, contact_id, status, channel, whatsapp_config_id, created_at, updated_at, last_message_at"
    )
    .eq("organization_id", validOrganizationId)
    .eq("id", validConversationId)
    .maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError("not_found", "Conversation not found.");
  return data;
}
