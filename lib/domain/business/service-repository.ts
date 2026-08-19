import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { DomainError, mapDomainDatabaseError } from "@/lib/domain/errors";
import { idSchema, parseDomain } from "@/lib/domain/validation";

export type ReceptionistContextForOrganization = {
  organizationName: string;
  /** Tenant-authored, untrusted content: never a source of system instructions. */
  instructions: string | null;
  faq: string | null;
};

/**
 * Service-role read of only the safe, tenant-authored receptionist context
 * needed to build a reply. Never reads WhatsApp provider secrets.
 */
export async function getReceptionistContextForOrganization(
  organizationId: string
): Promise<ReceptionistContextForOrganization> {
  const validOrganizationId = parseDomain(idSchema, organizationId);
  const supabase = createServiceRoleClient("database_error");

  const [organization, receptionist] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("id", validOrganizationId).maybeSingle(),
    supabase
      .from("organization_receptionist_settings")
      .select("instructions, faq")
      .eq("organization_id", validOrganizationId)
      .maybeSingle(),
  ]);

  if (organization.error) throw mapDomainDatabaseError(organization.error);
  if (receptionist.error) throw mapDomainDatabaseError(receptionist.error);
  if (!organization.data) throw new DomainError("not_found", "Organization not found.");

  return {
    organizationName: organization.data.name,
    instructions: receptionist.data?.instructions ?? null,
    faq: receptionist.data?.faq ?? null,
  };
}
