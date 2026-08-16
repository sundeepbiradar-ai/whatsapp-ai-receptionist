import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CreateOrganizationForm } from "@/components/organizations/create-organization-form";
import { getOrganizationContext } from "@/lib/organizations/context";

export const metadata: Metadata = {
  title: "Create your organization - AI Customer Operations Platform",
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage(): Promise<React.ReactElement> {
  const context = await getOrganizationContext();

  if (context.status === "unauthenticated") {
    redirect("/login");
  }
  if (context.status === "ready") {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <section className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary-700">
          Organization setup
        </p>
        <h1 className="text-3xl font-bold text-gray-900">Create your organization</h1>
        <p className="mt-2 mb-8 text-gray-600">Create your first organization to continue.</p>
        <CreateOrganizationForm />
      </section>
    </main>
  );
}
