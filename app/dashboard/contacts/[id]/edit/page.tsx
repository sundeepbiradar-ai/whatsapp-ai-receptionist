import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ContactForm } from "@/components/contacts/contact-form";
import { updateContactAction } from "@/lib/domain/contacts/actions";
import { DomainError } from "@/lib/domain/errors";
import { getContact } from "@/lib/domain/contacts/repository";

type EditContactPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function EditContactPage({ params }: EditContactPageProps): Promise<React.ReactElement> {
  const { id } = await params;
  let contact;
  try {
    contact = await getContact(id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "unauthenticated") redirect("/login");
    if (error instanceof DomainError && error.code === "no_organization") redirect("/onboarding");
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href={`/dashboard/contacts/${contact.id}`}>
          Back to contact
        </Link>
        <h1 className="mt-3 text-4xl font-bold text-gray-900">Edit contact</h1>
        <section className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <ContactForm
            action={updateContactAction.bind(null, contact.id)}
            contact={contact}
            submitLabel="Save changes"
          />
        </section>
      </div>
    </main>
  );
}
