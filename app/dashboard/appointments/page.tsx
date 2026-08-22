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

function statusBadgeClass(status: Appointment["status"]): string {
  switch (status) {
    case "confirmed":
      return "bg-green-50 text-green-700";
    case "pending":
      return "bg-amber-50 text-amber-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    case "completed":
      return "bg-gray-100 text-gray-600";
  }
}

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
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/dashboard">
          Back to dashboard
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Appointments</h1>
            <p className="mt-2 text-gray-600">Appointments for your current organization.</p>
          </div>
          <Link className="button-primary" href="/dashboard/appointments/new">
            New appointment
          </Link>
        </div>

        {errorMessage && (
          <p className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>
        )}

        {appointments.length === 0 ? (
          <section className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
            <h2 className="text-xl font-semibold text-gray-900">No appointments yet</h2>
            <p className="mt-2 text-gray-600">Create an appointment to get started.</p>
          </section>
        ) : (
          <section aria-label="Appointments" className="mt-8">
            <p className="text-sm text-gray-600">
              {appointments.length} appointment{appointments.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-4 space-y-3">
              {appointments.map((appointment) => {
                const contact = contactMap.get(appointment.contact_id);
                return (
                  <li key={appointment.id}>
                    <Link
                      className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md sm:p-5"
                      href={`/dashboard/appointments/${appointment.id}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">{contact?.name ?? "Contact"}</p>
                        {contact?.phone && <p className="mt-1 truncate text-sm text-gray-600">{contact.phone}</p>}
                        <p className="mt-1 text-xs text-gray-500">
                          {formatInTimezone(appointment.starts_at, timezone)} - {formatInTimezone(appointment.ends_at, timezone)}
                        </p>
                        {appointment.conversation_id && (
                          <span className="mt-1 inline-block text-xs font-medium text-primary-700">
                            Linked conversation
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium capitalize ${statusBadgeClass(appointment.status)}`}>
                          {appointment.status}
                        </span>
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
