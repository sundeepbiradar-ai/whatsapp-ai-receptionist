import "server-only";

import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  resolveOrganizationContext,
  type Organization,
  type OrganizationContext,
  type OrganizationMembership,
} from "@/lib/organizations/types";

export type { OrganizationContext } from "@/lib/organizations/types";

export async function getOrganizationContext(): Promise<OrganizationContext> {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return resolveOrganizationContext(null, [], []);
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("organization_members")
    .select("id, organization_id, user_id, role, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (membershipError) {
    throw new Error("Unable to resolve organization membership.");
  }

  const memberships: OrganizationMembership[] = membershipRows;

  if (memberships.length === 0) {
    return resolveOrganizationContext(user, [], []);
  }

  const organizationIds = memberships.map((membership) => membership.organization_id);
  const { data: organizationRows, error: organizationError } = await supabase
    .from("organizations")
    .select("id, name, slug, created_at, updated_at")
    .in("id", organizationIds);

  if (organizationError) {
    throw new Error("Unable to resolve accessible organizations.");
  }

  const organizations: Organization[] = organizationRows;

  return resolveOrganizationContext(user, memberships, organizations);
}
