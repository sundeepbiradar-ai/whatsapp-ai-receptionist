import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260816000000_create_multi_tenant_foundation.sql"
);
const migration = readFileSync(migrationPath, "utf8");

describe("Phase 2.2 database migration contract", () => {
  it("defines only the initial multi-tenant tables", () => {
    expect(migration).toContain("create table public.profiles");
    expect(migration).toContain("create table public.organizations");
    expect(migration).toContain("create table public.organization_members");
    expect(migration).not.toContain("create table public.users");
  });

  it("references Supabase Auth without duplicating auth.users", () => {
    expect(migration).toContain("references auth.users (id) on delete cascade");
    expect(migration).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(migration).not.toContain("password");
  });

  it("constrains roles and duplicate organization membership", () => {
    expect(migration).toContain(
      "create type public.organization_role as enum ('owner', 'admin', 'member')"
    );
    expect(migration).toContain(
      "constraint organization_members_organization_user_key unique (organization_id, user_id)"
    );
    expect(migration).toContain("slug text not null unique");
  });

  it("enables RLS and defines all operation policies", () => {
    expect(migration.match(/enable row level security;/g)).toHaveLength(3);
    expect(migration.match(/^create policy /gm)).toHaveLength(12);
    expect(migration).toContain("using (id = auth.uid())");
    expect(migration).toContain("public.is_organization_member(id)");
    expect(migration).toContain("public.is_organization_member(organization_id)");
    expect(migration).toContain("with check (false)");
  });

  it("grants table access without bypassing RLS", () => {
    expect(migration).toContain("to anon, authenticated;");
    expect(migration).toContain("to service_role;");
    expect(migration).toContain("grant select, insert, update, delete");
  });

  it("hardens the non-recursive membership helper", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function public.is_organization_member");
    expect(migration).toContain(
      "grant execute on function public.is_organization_member(uuid, uuid) to authenticated"
    );
  });
});
