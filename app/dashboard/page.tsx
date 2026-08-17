import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { logoutAction } from '@/lib/auth/actions';
import { getOrganizationContext } from '@/lib/organizations/context';
import { listContacts, listRecentContacts } from '@/lib/domain/contacts/repository';
import { listConversations } from '@/lib/domain/conversations/repository';
import { listAppointments } from '@/lib/domain/appointments/repository';
import { getRecentConversations, getUpcomingAppointments } from '@/lib/dashboard/overview';
import { OrganizationSwitcher } from '@/components/organizations/organization-switcher';
import type { Database } from '@/lib/supabase/database';

export const metadata: Metadata = {
  title: 'Dashboard - AI Customer Operations Platform',
  description: 'Application dashboard',
};

export const dynamic = 'force-dynamic';

type Contact = Database['public']['Tables']['contacts']['Row'];
type Conversation = Database['public']['Tables']['conversations']['Row'];
type Appointment = Database['public']['Tables']['appointments']['Row'];

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function formatOptionalDate(value: string | null): string {
  return value ? formatDate(value) : 'No messages yet';
}

export default async function DashboardPage(): Promise<React.ReactElement> {
  const organizationContext = await getOrganizationContext();

  if (organizationContext.status === 'unauthenticated') {
    redirect('/login');
  }

  if (organizationContext.status === 'no-organization') {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Dashboard</h1>
              <p className="mt-2 text-gray-600">Welcome back, {organizationContext.user.email ?? 'authenticated user'}.</p>
            </div>
            <form action={logoutAction}>
              <button className="button-secondary whitespace-nowrap" type="submit">Log out</button>
            </form>
          </div>
          <section className="mt-8 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-xl font-semibold text-amber-950">No organization yet</h2>
            <p className="mt-2 text-amber-900">You don&apos;t belong to an organization yet.</p>
            <Link className="button-primary mt-5" href="/onboarding">Create your organization</Link>
          </section>
        </div>
      </main>
    );
  }

  const [allContactsResult, recentContactsResult, conversationsResult, appointmentsResult] = await Promise.allSettled([
    listContacts(),
    listRecentContacts(),
    listConversations(),
    listAppointments(),
  ]);
  const hasRepositoryError = [allContactsResult, recentContactsResult, conversationsResult, appointmentsResult]
    .some((result) => result.status === 'rejected');
  const allContacts: Contact[] = allContactsResult.status === 'fulfilled' ? allContactsResult.value : [];
  const recentContacts: Contact[] = recentContactsResult.status === 'fulfilled' ? recentContactsResult.value : [];
  const conversations: Conversation[] = conversationsResult.status === 'fulfilled' ? conversationsResult.value : [];
  const appointments: Appointment[] = appointmentsResult.status === 'fulfilled' ? appointmentsResult.value : [];
  const contactMap = new Map(allContacts.map((contact) => [contact.id, contact]));
  const upcomingAppointments = getUpcomingAppointments(appointments);
  const recentConversations = getRecentConversations(conversations);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-2 text-lg text-gray-600">Welcome back, {organizationContext.user.email ?? 'authenticated user'}.</p>
            <p className="mt-2 text-sm text-gray-500">
              Current organization: {organizationContext.currentOrganization.name} ({organizationContext.currentRole})
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Role: {organizationContext.currentRole}
            </p>
            <OrganizationSwitcher context={organizationContext} />
          </div>
          <form action={logoutAction}>
            <button className="button-secondary whitespace-nowrap" type="submit">Log out</button>
          </form>
        </div>

        <nav aria-label="Dashboard sections" className="mt-8 flex flex-wrap gap-3">
          <Link className="button-secondary" href="/dashboard">Dashboard</Link>
          <Link className="button-secondary" href="/dashboard/contacts">Contacts</Link>
          <Link className="button-secondary" href="/dashboard/conversations">Conversations</Link>
          <Link className="button-secondary" href="/dashboard/appointments">Appointments</Link>
        </nav>

        {hasRepositoryError && (
          <p className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            Some dashboard information could not be loaded. Please try again.
          </p>
        )}

        <section aria-label="Organization summary" className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ['Contacts', allContacts.length, '/dashboard/contacts'],
            ['Conversations', conversations.length, '/dashboard/conversations'],
            ['Appointments', appointments.length, '/dashboard/appointments'],
          ].map(([label, value, href]) => (
            <Link className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:border-primary-300" href={href as string} key={label as string}>
              <p className="text-sm font-medium text-gray-600">{label}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
            </Link>
          ))}
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-gray-900">Recent conversations</h2>
              <Link className="text-sm font-medium text-primary-700" href="/dashboard/conversations">View all</Link>
            </div>
            {recentConversations.length === 0 ? (
              <p className="mt-5 text-gray-600">No conversations yet.</p>
            ) : (
              <ul className="mt-5 divide-y divide-gray-100">
                {recentConversations.slice(0, 5).map((conversation) => (
                  <li key={conversation.id}>
                    <Link className="block py-3 hover:bg-gray-50" href={`/dashboard/conversations/${conversation.id}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-gray-900">{contactMap.get(conversation.contact_id)?.name ?? 'Contact'}</span>
                        <span className="text-sm capitalize text-gray-600">{conversation.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{formatOptionalDate(conversation.last_message_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-gray-900">Upcoming appointments</h2>
              <Link className="text-sm font-medium text-primary-700" href="/dashboard/appointments">View all</Link>
            </div>
            {upcomingAppointments.length === 0 ? (
              <div className="mt-5">
                <p className="text-gray-600">No upcoming appointments.</p>
                <Link className="button-secondary mt-4" href="/dashboard/appointments/new">Create appointment</Link>
              </div>
            ) : (
              <ul className="mt-5 divide-y divide-gray-100">
                {upcomingAppointments.map((appointment) => (
                  <li key={appointment.id}>
                    <Link className="block py-3 hover:bg-gray-50" href={`/dashboard/appointments/${appointment.id}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-gray-900">{contactMap.get(appointment.contact_id)?.name ?? 'Contact'}</span>
                        <span className="text-sm capitalize text-gray-600">{appointment.status}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{formatDate(appointment.starts_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 lg:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-gray-900">Recent contacts</h2>
              <Link className="text-sm font-medium text-primary-700" href="/dashboard/contacts">View all</Link>
            </div>
            {recentContacts.length === 0 ? (
              <div className="mt-5">
                <p className="text-gray-600">No contacts yet.</p>
                <Link className="button-secondary mt-4" href="/dashboard/contacts/new">Add contact</Link>
              </div>
            ) : (
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentContacts.map((contact) => (
                  <li key={contact.id}>
                    <Link className="block rounded-md border border-gray-100 p-4 hover:border-primary-300" href={`/dashboard/contacts/${contact.id}`}>
                      <p className="font-medium text-gray-900">{contact.name}</p>
                      <p className="mt-1 text-sm text-gray-600">{contact.phone}</p>
                      <p className="mt-1 text-sm text-gray-500">{contact.email ?? 'No email'}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
