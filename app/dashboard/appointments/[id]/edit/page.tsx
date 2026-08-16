import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppointmentForm } from "@/components/appointments/appointment-form";
import { updateAppointmentAction } from "@/lib/domain/appointments/actions";
import { getAppointment } from "@/lib/domain/appointments/repository";
import { listContacts } from "@/lib/domain/contacts/repository";
import { listConversations } from "@/lib/domain/conversations/repository";
import { DomainError } from "@/lib/domain/errors";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EditAppointmentPage({ params }: Props): Promise<React.ReactElement> {
  const { id } = await params;
  try {
    const appointment = await getAppointment(id);
    const [contacts, conversations] = await Promise.all([listContacts(), listConversations()]);
    return <main className="min-h-screen bg-gray-50"><div className="container mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8"><Link className="text-sm font-medium text-primary-700" href={`/dashboard/appointments/${appointment.id}`}>Back to appointment</Link><h1 className="mt-3 text-4xl font-bold text-gray-900">Edit appointment</h1><section className="mt-8 rounded-lg border border-gray-200 bg-white p-6"><AppointmentForm action={updateAppointmentAction.bind(null, appointment.id)} appointment={appointment} contacts={contacts.map((c) => ({ id: c.id, label: `${c.name} (${c.phone})` }))} conversations={conversations.map((c) => ({ id: c.id, label: `${c.status} conversation` }))} /></section></div></main>;
  } catch (error) {
    if (error instanceof DomainError && error.code === "unauthenticated") redirect("/login");
    if (error instanceof DomainError && error.code === "no_organization") redirect("/onboarding");
    notFound();
  }
}
