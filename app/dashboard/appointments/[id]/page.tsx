import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppointmentStatusForm } from "@/components/appointments/appointment-status-form";
import { cancelAppointmentAction } from "@/lib/domain/appointments/actions";
import { formatInTimezone } from "@/lib/domain/appointments/scheduling";
import { getAppointment, getSchedulingSettings } from "@/lib/domain/appointments/repository";
import { getContact } from "@/lib/domain/contacts/repository";
import { getConversation } from "@/lib/domain/conversations/repository";
import { DomainError } from "@/lib/domain/errors";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function statusBadgeClass(status: string): string {
  switch (status) {
    case "confirmed":
      return "bg-green-50 text-green-700";
    case "pending":
      return "bg-amber-50 text-amber-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    case "completed":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export default async function AppointmentDetailPage({ params }: Props): Promise<React.ReactElement> {
  const { id } = await params;
  try {
    const appointment = await getAppointment(id);
    const contact = await getContact(appointment.contact_id);
    const conversation = appointment.conversation_id ? await getConversation(appointment.conversation_id) : null;
    const settings = await getSchedulingSettings();
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/dashboard/appointments">
            Back to appointments
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">{contact.name}</h1>
              <p className="mt-2 text-gray-600">Appointment details</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${statusBadgeClass(appointment.status)}`}>
              {appointment.status}
            </span>
          </div>
          <dl className="mt-8 grid gap-4 rounded-lg border border-gray-200 bg-white p-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-gray-500">Contact</dt>
              <dd className="mt-1"><Link className="font-medium text-primary-700" href={`/dashboard/contacts/${contact.id}`}>{contact.name}</Link></dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Phone</dt>
              <dd className="mt-1 text-gray-900">{contact.phone}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Starts</dt>
              <dd className="mt-1 text-gray-900">{formatInTimezone(appointment.starts_at, settings.timezone)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Ends</dt>
              <dd className="mt-1 text-gray-900">{formatInTimezone(appointment.ends_at, settings.timezone)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-gray-500">Notes</dt>
              <dd className="mt-1 whitespace-pre-wrap text-gray-900">{appointment.notes ?? "No notes"}</dd>
            </div>
            {conversation && (
              <div>
                <dt className="text-sm text-gray-500">Conversation</dt>
                <dd className="mt-1"><Link className="text-primary-700" href={`/dashboard/conversations/${conversation.id}`}>View conversation</Link></dd>
              </div>
            )}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="button-secondary" href={`/dashboard/appointments/${appointment.id}/edit`}>Edit</Link>
            {appointment.status !== "cancelled" && appointment.status !== "completed" && (
              <AppointmentStatusForm action={cancelAppointmentAction.bind(null, appointment.id)} />
            )}
          </div>
        </div>
      </main>
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "unauthenticated") redirect("/login");
    if (error instanceof DomainError && error.code === "no_organization") redirect("/onboarding");
    notFound();
  }
}
