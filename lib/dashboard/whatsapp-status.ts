import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { mapDomainDatabaseError } from '@/lib/domain/errors';
import { requireDomainOrganization } from '@/lib/domain/context';

export type OrganizationWhatsAppStatus =
  | {
      configured: true;
      provider: string;
      displayPhoneNumber: string | null;
      isActive: boolean;
      isTestConfiguration: boolean;
    }
  | { configured: false };

/**
 * Reads the non-secret WhatsApp configuration state for the current organization.
 *
 * Only safe columns are selected. Secret references, access tokens,
 * phone number IDs and business account IDs are never read or returned.
 * A stored configuration does not prove live provider connectivity,
 * and a sandbox configuration is never presented as production-ready.
 */
export async function getOrganizationWhatsAppStatus(): Promise<OrganizationWhatsAppStatus> {
  const context = await requireDomainOrganization();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('organization_whatsapp_configs')
    .select('provider, display_phone_number, is_active')
    .eq('organization_id', context.currentOrganization.id)
    .order('is_active', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) return { configured: false };
  return {
    configured: true,
    provider: data.provider,
    displayPhoneNumber: data.display_phone_number,
    isActive: data.is_active,
    // Display-only: the production provider is Meta WhatsApp Cloud; anything else is a
    // temporary/test configuration and must not be presented as connected.
    isTestConfiguration: data.provider !== 'meta_whatsapp_cloud',
  };
}
