import Link from "next/link";
import { redirect } from "next/navigation";

import { AppointmentForm } from "@/components/appointments/appointment-form";
import { createAppointmentAction } from "@/lib/domain/appointments/actions";
import { getSchedulingSettings } from "@/lib/domain/appointments/repository";
import { listContacts } from "@/lib/domain/contacts/repository";
import { listConversations } from "@/lib/domain/conversations/repository";
import { getOrganizationContext } from "@/lib/organizations/context";

export const dynamic = "force-dynamic";

export default async function NewAppointmentPage(): Promise<React.ReactElement> {
  const context = await getOrganizationContext();
  if (context.status === "unauthenticated") redirect("/login");
  if (context.status === "no-organization") redirect("/onboarding");
  const [contacts, conversations, settings] = await Promise.all([listContacts(), listConversations(), getSchedulingSettings()]);
  return <main className="min-h-screen bg-gray-50"><div className="container mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8"><Link className="text-sm font-medium text-primary-700" href="/dashboard/appointments">Back to appointments</Link><h1 className="mt-3 text-4xl font-bold text-gray-900">New appointment</h1><section className="mt-8 rounded-lg border border-gray-200 bg-white p-6"><AppointmentForm action={createAppointmentAction} timezone={settings.timezone} contacts={contacts.map((c) => ({ id: c.id, label: `${c.name} (${c.phone})` }))} conversations={conversations.map((c) => ({ id: c.id, label: `${c.status} conversation` }))} /></section></div></main>;
}
