import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { logoutAction } from "@/lib/auth/actions";
import { getOrganizationContext } from "@/lib/organizations/context";

export const metadata: Metadata = {
  title: "Dashboard - AI Customer Operations Platform",
  description: "Application dashboard",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage(): Promise<React.ReactElement> {
  const organizationContext = await getOrganizationContext();

  if (organizationContext.status === "unauthenticated") {
    redirect("/login");
  }
  const user = organizationContext.user;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex max-w-4xl items-start justify-between gap-6">
          <div>
            <h1 className="mb-4 text-4xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-lg text-gray-600">Welcome back, {user.email ?? "authenticated user"}.</p>
            <p className="mt-2 text-sm text-gray-500">
              Authentication confirms your identity; organization membership controls tenant access.
            </p>
          </div>
          <form action={logoutAction}>
            <button className="button-secondary whitespace-nowrap" type="submit">
              Log out
            </button>
          </form>
        </div>
        {organizationContext.status === "no-organization" && (
          <section className="mt-8 max-w-4xl rounded-lg border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-xl font-semibold text-amber-950">No organization yet</h2>
            <p className="mt-2 text-amber-900">You don&apos;t belong to an organization yet.</p>
          </section>
        )}
        {organizationContext.status === "ready" && (
          <section className="mt-8 max-w-4xl rounded-lg border border-gray-200 bg-white p-6">
            <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
              Current organization
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">
              {organizationContext.currentOrganization.name}
            </h2>
            <p className="mt-1 text-gray-600">
              Role: <span className="font-medium">{organizationContext.currentRole}</span>
            </p>
            {organizationContext.organizations.length > 1 && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-700">Organizations you belong to</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                  {organizationContext.organizations.map((organization) => (
                    <li key={organization.id}>{organization.name}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-gray-500">
                  Organization switching will be added in a future milestone.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
