/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";

type Config = { url: string; anonKey: string; serviceRoleKey: string };

function loadConfig(): Config | null {
  const url = process.env["SUPABASE_TEST_URL"];
  const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
  const serviceRoleKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
  return url && anonKey && serviceRoleKey ? { url, anonKey, serviceRoleKey } : null;
}

const config = loadConfig();
const integrationDescribe = config ? describe : describe.skip;

const tenantTables = [
  "appointments",
  "contacts",
  "conversations",
  "messages",
  "organizations",
  "organization_members",
  "organization_blocked_periods",
  "organization_receptionist_settings",
  "organization_scheduling_settings",
  "organization_whatsapp_configs",
  "organization_whatsapp_secret_refs",
  "profiles",
  "whatsapp_send_jobs",
] as const;

const denyByDefaultTables = ["organization_whatsapp_secret_refs", "whatsapp_send_jobs"] as const;

const serviceRoleOnlyFunctions = [
  "apply_whatsapp_message_status",
  "claim_whatsapp_send_jobs",
  "complete_whatsapp_send_job",
  "reschedule_whatsapp_send_job",
  "terminate_whatsapp_send_job",
  "reap_whatsapp_send_job_claims",
  "process_inbound_whatsapp_message",
  "resolve_whatsapp_config",
  "resolve_whatsapp_config_for_organization",
  "resolve_whatsapp_verification_config",
] as const;

integrationDescribe("Phase 8 security posture", () => {
  // Created lazily so the suite can be collected without credentials present.
  function anonClient(): SupabaseClient<Database> {
    return createClient<Database>(config!.url, config!.anonKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  it.each(tenantTables)("denies anonymous reads from %s", async (table) => {
    const { data, error } = await anonClient().from(table).select("*").limit(1);
    // Either the grant is absent (error) or RLS filters every row.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it.each(denyByDefaultTables)("keeps %s unreachable for anonymous clients", async (table) => {
    const { error } = await anonClient().from(table).select("*").limit(1);
    expect(error).not.toBeNull();
  });

  it.each(serviceRoleOnlyFunctions)(
    "does not expose the service-only function %s to anonymous callers",
    async (fn) => {
      const { error } = await anonClient().rpc(fn as never, {} as never);
      expect(error).not.toBeNull();
    }
  );

  it("does not expose the cron worker invoker to anonymous callers", async () => {
    const { error } = await anonClient().rpc("invoke_whatsapp_retry_worker" as never);
    expect(error).not.toBeNull();
  });

  it("never returns Vault secret material to an anonymous caller", async () => {
    const { data, error } = await anonClient().rpc("resolve_whatsapp_config" as never, {
      target_provider: "meta_whatsapp_cloud",
      target_phone_number_id: "any",
    } as never);
    expect(error).not.toBeNull();
    expect(JSON.stringify(data ?? {})).not.toContain("access_token");
  });
});
