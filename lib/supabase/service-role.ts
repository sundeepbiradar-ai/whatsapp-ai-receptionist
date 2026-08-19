import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { DomainError, type DomainErrorCode } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database";

/**
 * Service-role client for the narrow set of organization-scoped, webhook-only
 * entry points. Every query built on top of this client must still filter by
 * an explicit, trusted organization id; this client bypasses RLS.
 */
export function createServiceRoleClient(errorCode: DomainErrorCode): SupabaseClient<Database> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) {
    throw new DomainError(errorCode, "The service-role database connection is unavailable.");
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}
