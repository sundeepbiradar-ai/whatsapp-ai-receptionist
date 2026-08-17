import type { User } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type OrganizationMembership = Database["public"]["Tables"]["organization_members"]["Row"];
type OrganizationRole = Database["public"]["Enums"]["organization_role"];

export type { Organization, OrganizationMembership };

export type OrganizationContext =
  | {
      status: "unauthenticated";
      user: null;
      organizations: [];
      currentOrganization: null;
      currentMembership: null;
      currentRole: null;
    }
  | {
      status: "no-organization";
      user: User;
      organizations: [];
      currentOrganization: null;
      currentMembership: null;
      currentRole: null;
    }
  | {
      status: "ready";
      user: User;
      organizations: Organization[];
      memberships: OrganizationMembership[];
      currentOrganization: Organization;
      currentMembership: OrganizationMembership;
      currentRole: OrganizationRole;
    };

export function resolveOrganizationContext(
  user: User | null,
  memberships: OrganizationMembership[],
  organizations: Organization[]
): OrganizationContext {
  if (!user) {
    return {
      status: "unauthenticated",
      user: null,
      organizations: [],
      currentOrganization: null,
      currentMembership: null,
      currentRole: null,
    };
  }

  const membershipByOrganizationId = new Map(
    memberships.map((membership) => [membership.organization_id, membership])
  );
  const authorizedOrganizations = organizations
    .filter((organization) => membershipByOrganizationId.has(organization.id))
    .sort((first, second) => first.created_at.localeCompare(second.created_at));

  if (authorizedOrganizations.length === 0) {
    return {
      status: "no-organization",
      user,
      organizations: [],
      currentOrganization: null,
      currentMembership: null,
      currentRole: null,
    };
  }

  const currentOrganization = authorizedOrganizations[0];

  if (!currentOrganization) {
    throw new Error("Organization context resolution failed.");
  }

  const currentMembership = membershipByOrganizationId.get(currentOrganization.id);

  if (!currentMembership) {
    throw new Error("Organization context membership resolution failed.");
  }

  return {
    status: "ready",
    user,
    organizations: authorizedOrganizations,
    memberships,
    currentOrganization,
    currentMembership,
    currentRole: currentMembership.role,
  };
}
