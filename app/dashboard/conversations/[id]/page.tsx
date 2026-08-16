import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ConversationStatusForm } from "@/components/conversations/status-form";
import { updateConversationStatusAction } from "@/lib/domain/conversations/actions";
import { getContact } from "@/lib/domain/contacts/repository";
import { getConversation } from "@/lib/domain/conversations/repository";
import { listMessages } from "@/lib/domain/messages/repository";
import { DomainError } from "@/lib/domain/errors";

type ConversationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export default async function ConversationDetailPage({
  params,
}: ConversationDetailPageProps): Promise<React.ReactElement> {
  const { id } = await params;
  let conversation;
  let contact;
  let messages;

  try {
    conversation = await getConversation(id);
    [contact, messages] = await Promise.all([
      getContact(conversation.contact_id),
      listMessages(conversation.id),
    ]);
  } catch (error) {
    if (error instanceof DomainError && error.code === "unauthenticated") redirect("/login");
    if (error instanceof DomainError && error.code === "no_organization") redirect("/onboarding");
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/dashboard/conversations">
          Back to conversations
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">{contact.name}</h1>
            <p className="mt-2 text-gray-600">Conversation details</p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium capitalize text-gray-700">
            {conversation.status}
          </span>
        </div>

        <section className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-gray-500">Name</dt><dd className="mt-1 font-medium text-gray-900">{contact.name}</dd></div>
            <div><dt className="text-sm text-gray-500">Phone</dt><dd className="mt-1 font-medium text-gray-900">{contact.phone}</dd></div>
            <div><dt className="text-sm text-gray-500">Email</dt><dd className="mt-1 font-medium text-gray-900">{contact.email ?? "No email"}</dd></div>
          </dl>
          <Link className="button-secondary mt-5" href={`/dashboard/contacts/${contact.id}`}>View contact</Link>
        </section>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Status</h2>
          <ConversationStatusForm
            action={updateConversationStatusAction.bind(null, conversation.id)}
            currentStatus={conversation.status}
          />
        </section>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Message history</h2>
          {messages.length === 0 ? (
            <p className="mt-4 rounded-md bg-gray-50 p-4 text-gray-600">No messages yet.</p>
          ) : (
            <ol className="mt-4 space-y-4">
              {messages.map((message) => (
                <li className={`rounded-lg p-4 ${message.direction === "inbound" ? "bg-gray-100" : "bg-primary-50"}`} key={message.id}>
                  <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                    <span className="font-medium capitalize">{message.direction}</span>
                    <time dateTime={message.created_at}>{formatDate(message.created_at)}</time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-gray-900">{message.content}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
