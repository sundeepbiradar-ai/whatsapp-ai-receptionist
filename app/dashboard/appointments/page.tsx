import Link from "next/link";
import { redirect } from "next/navigation";

import { DomainError } from "@/lib/domain/errors";
import { formatInTimezone } from "@/lib/domain/appointments/scheduling";
import { getSchedulingSettings, listAppointments } from "@/lib/domain/appointments/repository";
import { listContacts } from "@/lib/domain/contacts/repository";
import type { Database } from "@/lib/supabase/database";

type Appointment = Database["public"]["Tables"]["appointments"]["Row"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export const dynamic = "force-dynamic";

export default async function AppointmentsPage(): Promise<React.ReactElement> {
  let appointments: Appointment[] = [];
  let contacts: Contact[] = [];
  let timezone = "UTC";
  let errorMessage: string | undefined;
  try {
    const [appointmentResult, contactResult, settings] = await Promise.all([listAppointments(), listContacts(), getSchedulingSettings()]);
    appointments = appointmentResult;
    contacts = contactResult;
    timezone = settings.timezone;
  } catch (error) {
    if (error instanceof DomainError && error.code === "unauthenticated") redirect("/login");
    if (error instanceof DomainError && error.code === "no_organization") redirect("/onboarding");
    errorMessage = "We could not load appointments. Please try again.";
  }
  const contactMap = new Map(contacts.map((contact) => [contact.id, contact]));
  return (
    <main className="min-h-screen bg-gray-50"><div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <Link className="text-sm font-medium text-primary-700" href="/dashboard">Back to dashboard</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-4xl font-bold text-gray-900">Appointments</h1><p className="mt-2 text-gray-600">Appointments for your current organization.</p></div><Link className="button-primary" href="/dashboard/appointments/new">New appointment</Link></div>
      {errorMessage && <p className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>}
      {appointments.length === 0 ? <section className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center"><h2 className="text-xl font-semibold text-gray-900">No appointments yet</h2><p className="mt-2 text-gray-600">Create an appointment to get started.</p><Link className="button-primary mt-5" href="/dashboard/appointments/new">Create appointment</Link></section> : <section className="mt-8 overflow-hidden rounded-lg border border-gray-200 bg-white"><div className="divide-y divide-gray-100">{appointments.map((appointment) => <Link className="block px-5 py-4 hover:bg-gray-50" href={`/dashboard/appointments/${appointment.id}`} key={appointment.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-gray-900">{contactMap.get(appointment.contact_id)?.name ?? "Contact"}</h2><p className="mt-1 text-sm text-gray-600">{formatInTimezone(appointment.starts_at, timezone)} - {formatInTimezone(appointment.ends_at, timezone)}</p></div><span className="text-sm font-medium capitalize text-gray-700">{appointment.status}</span></div>{appointment.notes && <p className="mt-2 text-sm text-gray-600">{appointment.notes}</p>}</Link>)}</div></section>}
    </div></main>
  );
}
