import Link from "next/link";
import { redirect } from "next/navigation";

import { listContacts } from "@/lib/domain/contacts/repository";
import { DomainError } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];

type ContactsPageProps = {
  searchParams: Promise<{ q?: string; error?: string }>;
};

export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: ContactsPageProps): Promise<React.ReactElement> {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  let contacts: Contact[] = [];
  let errorMessage: string | undefined;

  try {
    contacts = await listContacts(query);
  } catch (error) {
    if (error instanceof DomainError && error.code === "unauthenticated") {
      redirect("/login");
    }
    if (error instanceof DomainError && error.code === "no_organization") {
      redirect("/onboarding");
    }
    errorMessage = "We could not load contacts. Please try again.";
    contacts = [];
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/dashboard">
              Back to dashboard
            </Link>
            <h1 className="mt-3 text-4xl font-bold text-gray-900">Contacts</h1>
            <p className="mt-2 text-gray-600">Contacts belonging to your current organization.</p>
          </div>
          <Link className="button-primary" href="/dashboard/contacts/new">
            New contact
          </Link>
        </div>

        <form className="mt-8 flex max-w-2xl gap-3" method="get">
          <label className="sr-only" htmlFor="contact-search">Search contacts</label>
          <input
            className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            defaultValue={query}
            id="contact-search"
            name="q"
            placeholder="Search by name, phone, or email"
            type="search"
          />
          <button className="button-secondary" type="submit">Search</button>
        </form>

        {params.error === "not-found" && (
          <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="status">
            That contact was not found.
          </p>
        )}
        {errorMessage && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {errorMessage}
          </p>
        )}

        {contacts.length === 0 ? (
          <section className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              {query ? "No matching contacts" : "No contacts yet."}
            </h2>
            <p className="mt-2 text-gray-600">
              {query ? "Try a different search." : "Create your first contact to get started."}
            </p>
            {!query && <Link className="button-primary mt-5" href="/dashboard/contacts/new">Create contact</Link>}
          </section>
        ) : (
          <section className="mt-8 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4 text-sm text-gray-600">
              {contacts.length} contact{contacts.length === 1 ? "" : "s"}
            </div>
            <div className="divide-y divide-gray-100">
              {contacts.map((contact) => (
                <Link className="block px-5 py-4 hover:bg-gray-50" href={`/dashboard/contacts/${contact.id}`} key={contact.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-gray-900">{contact.name}</h2>
                      <p className="mt-1 text-sm text-gray-600">{contact.phone}</p>
                    </div>
                    <p className="text-sm text-gray-600">{contact.email ?? "No email"}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
