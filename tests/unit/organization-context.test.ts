import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";

import {
  resolveOrganizationContext,
  type OrganizationContext,
} from "@/lib/organizations/types";
import type { Database } from "@/lib/supabase/database";

type Organization = Pick<
  Database["public"]["Tables"]["organizations"]["Row"],
  "id" | "name" | "slug" | "created_at" | "updated_at"
>;
type Membership = Database["public"]["Tables"]["organization_members"]["Row"];

const user: User = {
  app_metadata: {},
  aud: "authenticated",
  confirmed_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  email: "user@example.com",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  id: "user-id",
  identities: [],
  is_anonymous: false,
  phone: "",
  role: "authenticated",
  updated_at: "2026-01-01T00:00:00.000Z",
  user_metadata: {},
};

const organizations: Organization[] = [
  {
    id: "organization-b",
    name: "Organization B",
    slug: "organization-b",
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "organization-a",
    name: "Organization A",
    slug: "organization-a",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

const memberships: Membership[] = [
  {
    id: "membership-b",
    organization_id: "organization-b",
    user_id: user.id,
    role: "admin",
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "membership-a",
    organization_id: "organization-a",
    user_id: user.id,
    role: "member",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

const organizationA = organizations.find((organization) => organization.id === "organization-a");
const organizationB = organizations.find((organization) => organization.id === "organization-b");
const membershipA = memberships.find((membership) => membership.id === "membership-a");
const membershipB = memberships.find((membership) => membership.id === "membership-b");

if (!organizationA || !organizationB || !membershipA || !membershipB) {
  throw new Error("Organization context fixtures are incomplete");
}

function expectStatus(context: OrganizationContext, status: OrganizationContext["status"]): void {
  expect(context.status).toBe(status);
}

function expectReady(context: OrganizationContext): Extract<OrganizationContext, { status: "ready" }> {
  if (context.status !== "ready") {
    throw new Error(`Expected ready organization context, received ${context.status}`);
  }
  return context;
}

describe("organization context", () => {
  it("handles a missing session", () => {
    const context = resolveOrganizationContext(null, [], []);

    expectStatus(context, "unauthenticated");
    expect(context.currentOrganization).toBeNull();
  });

  it("handles a user with no organizations", () => {
    const context = resolveOrganizationContext(user, [], []);

    expectStatus(context, "no-organization");
    if (context.status !== "no-organization") {
      throw new Error(`Expected no-organization context, received ${context.status}`);
    }
    expect(context.user.id).toBe(user.id);
    expect(context.organizations).toHaveLength(0);
  });

  it("resolves a single organization's role", () => {
    const context = resolveOrganizationContext(user, [membershipB], [organizationB]);
    const readyContext = expectReady(context);

    expectStatus(readyContext, "ready");
    expect(readyContext.currentOrganization.name).toBe("Organization B");
    expect(readyContext.currentRole).toBe("admin");
  });

  it("supports multiple organizations and chooses the oldest deterministically", () => {
    const context = resolveOrganizationContext(user, memberships, organizations);

    const readyContext = expectReady(context);

    expectStatus(readyContext, "ready");
    expect(readyContext.organizations.map((organization) => organization.id)).toEqual([
      "organization-a",
      "organization-b",
    ]);
    expect(readyContext.currentOrganization.id).toBe("organization-a");
    expect(readyContext.currentRole).toBe("member");
  });

  it("does not authorize an organization without a matching membership", () => {
    const context = resolveOrganizationContext(user, [membershipB], [organizationA]);

    expectStatus(context, "no-organization");
  });
});
