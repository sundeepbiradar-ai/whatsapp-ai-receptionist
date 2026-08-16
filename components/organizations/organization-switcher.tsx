import { switchOrganizationAction } from "@/lib/auth/actions";
import type { OrganizationContext } from "@/lib/organizations/types";

export function OrganizationSwitcher({
  context,
}: {
  context: Extract<OrganizationContext, { status: "ready" }>;
}): React.ReactElement | null {
  if (context.organizations.length < 2) {
    return null;
  }

  return (
    <form action={switchOrganizationAction} className="mt-6 max-w-sm">
      <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="organizationId">
        Switch organization
      </label>
      <select
        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        defaultValue={context.currentOrganization.id}
        id="organizationId"
        name="organizationId"
      >
        {context.organizations.map((organization) => {
          const membership = context.memberships.find(
            (candidate) => candidate.organization_id === organization.id
          );
          return (
            <option key={organization.id} value={organization.id}>
              {organization.name}{membership ? ` (${membership.role})` : ""}
            </option>
          );
        })}
      </select>
      <button className="button-secondary mt-3" type="submit">
        Switch organization
      </button>
    </form>
  );
}
