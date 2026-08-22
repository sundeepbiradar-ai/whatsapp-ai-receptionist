import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DeleteContactButton } from "@/components/contacts/delete-contact-button";
import { deleteContactAction } from "@/lib/domain/contacts/actions";
import { DomainError } from "@/lib/domain/errors";
import { getContact } from "@/lib/domain/contacts/repository";
import { formatPhoneForDisplay } from "@/lib/utils/phone";

type ContactDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({ params }: ContactDetailPageProps): Promise<React.ReactElement> {
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
      <div className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/dashboard/contacts">
          Back to contacts
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">{contact.name}</h1>
            <p className="mt-2 text-gray-600">Contact details</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button-secondary" href={`/dashboard/contacts/${contact.id}/edit`}>Edit</Link>
            <DeleteContactButton action={deleteContactAction.bind(null, contact.id)} />
          </div>
        </div>
        <dl className="mt-8 grid gap-4 rounded-lg border border-gray-200 bg-white p-6 sm:grid-cols-2">
          <div><dt className="text-sm text-gray-500">Phone</dt><dd className="mt-1 font-medium text-gray-900">{formatPhoneForDisplay(contact.phone)}</dd></div>
          <div><dt className="text-sm text-gray-500">Email</dt><dd className="mt-1 font-medium text-gray-900">{contact.email ?? "No email"}</dd></div>
          <div><dt className="text-sm text-gray-500">Created</dt><dd className="mt-1 text-gray-700">{new Date(contact.created_at).toLocaleString()}</dd></div>
          <div><dt className="text-sm text-gray-500">Updated</dt><dd className="mt-1 text-gray-700">{new Date(contact.updated_at).toLocaleString()}</dd></div>
        </dl>
      </div>
    </main>
  );
}
