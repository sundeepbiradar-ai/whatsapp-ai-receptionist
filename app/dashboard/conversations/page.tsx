import Link from "next/link";
import { redirect } from "next/navigation";

import { DomainError } from "@/lib/domain/errors";
import { listContacts } from "@/lib/domain/contacts/repository";
import { listConversations } from "@/lib/domain/conversations/repository";
import type { Database } from "@/lib/supabase/database";

type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];

type ConversationsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "No messages yet";
}

function statusBadgeClass(status: Conversation["status"]): string {
  return status === "open" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600";
}

function formatChannel(channel: string | null): string {
  if (channel === "whatsapp") return "WhatsApp";
  return channel ?? "Unknown channel";
}

export default async function ConversationsPage({
  searchParams,
}: ConversationsPageProps): Promise<React.ReactElement> {
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  let conversations: Conversation[] = [];
  let contacts: Contact[] = [];
  let errorMessage: string | undefined;

  try {
    [conversations, contacts] = await Promise.all([listConversations(), listContacts()]);
  } catch (error) {
    if (error instanceof DomainError && error.code === "unauthenticated") redirect("/login");
    if (error instanceof DomainError && error.code === "no_organization") redirect("/onboarding");
    errorMessage = "We could not load conversations. Please try again.";
  }

  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const filteredConversations = conversations.filter((conversation) => {
    if (!query) return true;
    const contact = contactsById.get(conversation.contact_id);
    return [contact?.name, contact?.phone, contact?.email, conversation.status]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(query));
  });

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <div>
          <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/dashboard">
            Back to dashboard
          </Link>
          <h1 className="mt-3 text-4xl font-bold text-gray-900">Conversations</h1>
          <p className="mt-2 text-gray-600">Conversation history for your current organization.</p>
        </div>

        <form className="mt-8 flex max-w-2xl gap-3" method="get">
          <label className="sr-only" htmlFor="conversation-search">Search conversations</label>
          <input
            className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            defaultValue={params.q ?? ""}
            id="conversation-search"
            name="q"
            placeholder="Search by contact or status"
            type="search"
          />
          <button className="button-secondary" type="submit">Search</button>
        </form>

        {errorMessage && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>
        )}

        {filteredConversations.length === 0 ? (
          <section className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              {query ? "No matching conversations" : "No conversations yet"}
            </h2>
            <p className="mt-2 text-gray-600">
              {query ? "Try a different search." : "Conversations will appear here when they are available."}
            </p>
            <Link className="button-secondary mt-5" href="/dashboard/contacts">View contacts</Link>
          </section>
        ) : (
          <section aria-label="Conversations" className="mt-8">
            <p className="text-sm text-gray-600">
              {filteredConversations.length} conversation{filteredConversations.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-4 space-y-3">
              {filteredConversations.map((conversation) => {
                const contact = contactsById.get(conversation.contact_id);
                return (
                  <li key={conversation.id}>
                    <Link
                      className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md sm:p-5"
                      href={`/dashboard/conversations/${conversation.id}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">{contact?.name ?? "Unknown contact"}</p>
                        <p className="mt-1 truncate text-sm text-gray-600">{contact?.phone ?? "Contact unavailable"}</p>
                        <p className="mt-1 text-xs text-gray-500">{formatChannel(conversation.channel)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <div className="text-right">
                          <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium capitalize ${statusBadgeClass(conversation.status)}`}>
                            {conversation.status}
                          </span>
                          <p className="mt-1 text-xs text-gray-500">{formatDate(conversation.last_message_at)}</p>
                        </div>
                        <svg
                          aria-hidden="true"
                          className="h-5 w-5 shrink-0 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
