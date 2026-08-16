import Link from "next/link";
import { redirect } from "next/navigation";

import { ContactForm } from "@/components/contacts/contact-form";
import { createContactAction } from "@/lib/domain/contacts/actions";
import { getOrganizationContext } from "@/lib/organizations/context";

export const dynamic = "force-dynamic";

export default async function NewContactPage(): Promise<React.ReactElement> {
  const context = await getOrganizationContext();
  if (context.status === "unauthenticated") redirect("/login");
  if (context.status === "no-organization") redirect("/onboarding");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/dashboard/contacts">
          Back to contacts
        </Link>
        <h1 className="mt-3 text-4xl font-bold text-gray-900">New contact</h1>
        <p className="mt-2 text-gray-600">Add a contact to your current organization.</p>
        <section className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <ContactForm action={createContactAction} submitLabel="Create contact" />
        </section>
      </div>
    </main>
  );
}
