import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { logoutAction } from '@/lib/auth/actions';
import { getOrganizationContext } from '@/lib/organizations/context';
import { listContacts, listRecentContacts } from '@/lib/domain/contacts/repository';
import { listConversations } from '@/lib/domain/conversations/repository';
import {
  getSchedulingSettings,
  queryAppointments,
  type AppointmentQueryPage,
} from '@/lib/domain/appointments/repository';
import { formatInTimezone } from '@/lib/domain/appointments/scheduling';
import {
  getDayBoundsInTimezone,
  getOpenConversations,
  getRecentConversations,
  getUpcomingAppointments,
} from '@/lib/dashboard/overview';
import { getOrganizationWhatsAppStatus, type OrganizationWhatsAppStatus } from '@/lib/dashboard/whatsapp-status';
import { OrganizationSwitcher } from '@/components/organizations/organization-switcher';
import { DashboardNav } from '@/components/layout/dashboard-nav';
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

function conversationStatusBadgeClass(status: Conversation['status']): string {
  return status === 'open' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600';
}

function appointmentStatusBadgeClass(status: Appointment['status']): string {
  switch (status) {
    case 'confirmed':
      return 'bg-green-50 text-green-700';
    case 'pending':
      return 'bg-amber-50 text-amber-700';
    case 'cancelled':
      return 'bg-red-50 text-red-700';
    case 'completed':
      return 'bg-gray-100 text-gray-600';
  }
}

function formatWhatsAppProvider(provider: string): string {
  if (provider === 'meta_whatsapp_cloud') return 'Meta WhatsApp Cloud API';
  if (provider === 'twilio_whatsapp_sandbox') return 'Twilio WhatsApp Sandbox';
  return provider;
}

export default async function DashboardPage(): Promise<React.ReactElement> {
  const organizationContext = await getOrganizationContext();

  if (organizationContext.status === 'unauthenticated') {
    redirect('/login');
  }

  if (organizationContext.status === 'no-organization') {
    redirect('/onboarding');
  }

  const now = new Date();
  const [
    allContactsResult,
    recentContactsResult,
    conversationsResult,
    appointmentTotalsResult,
    schedulingSettingsResult,
    upcomingAppointmentsResult,
    whatsappStatusResult,
  ] = await Promise.allSettled([
    listContacts(),
    listRecentContacts(),
    listConversations(),
    queryAppointments({ page: 1, pageSize: 1 }),
    getSchedulingSettings(),
    queryAppointments({ startsAtFrom: now.toISOString(), statuses: ['pending', 'confirmed'], page: 1, pageSize: 5 }),
    getOrganizationWhatsAppStatus(),
  ]);

  const timezone = schedulingSettingsResult.status === 'fulfilled' ? schedulingSettingsResult.value.timezone : 'UTC';
  const todayBounds = getDayBoundsInTimezone(timezone, now);
  const todayAppointmentsResult: PromiseSettledResult<AppointmentQueryPage> | undefined = todayBounds
    ? (await Promise.allSettled([
        queryAppointments({ startsAtFrom: todayBounds.startsAtFrom, startsAtTo: todayBounds.startsAtTo, page: 1, pageSize: 1 }),
      ]))[0]
    : undefined;

  const conversations: Conversation[] = conversationsResult.status === 'fulfilled' ? conversationsResult.value : [];
  const recentConversations = getRecentConversations(conversations);

  const hasRepositoryError = [
    allContactsResult,
    recentContactsResult,
    conversationsResult,
    appointmentTotalsResult,
    upcomingAppointmentsResult,
    todayAppointmentsResult,
  ].some((result) => result?.status === 'rejected');

  const allContacts: Contact[] = allContactsResult.status === 'fulfilled' ? allContactsResult.value : [];
  const recentContacts: Contact[] = recentContactsResult.status === 'fulfilled' ? recentContactsResult.value : [];
  const appointmentsTotal = appointmentTotalsResult.status === 'fulfilled' ? appointmentTotalsResult.value.total : 0;
  const todaysAppointmentsTotal = todayAppointmentsResult?.status === 'fulfilled' ? todayAppointmentsResult.value.total : 0;
  const upcomingAppointments = getUpcomingAppointments(
    upcomingAppointmentsResult.status === 'fulfilled' ? upcomingAppointmentsResult.value.appointments : [],
    now,
  );
  const openConversations = getOpenConversations(conversations);
  const whatsappStatus: OrganizationWhatsAppStatus | null = whatsappStatusResult.status === 'fulfilled' ? whatsappStatusResult.value : null;
  const contactMap = new Map(allContacts.map((contact) => [contact.id, contact]));

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

        <DashboardNav />

        {hasRepositoryError && (
          <p className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            Some dashboard information could not be loaded. Please try again.
          </p>
        )}

        <section aria-label="Organization summary" className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ['Contacts', allContacts.length, '/dashboard/contacts'],
            ['Conversations', conversations.length, '/dashboard/conversations'],
            ['Appointments', appointmentsTotal, '/dashboard/appointments'],
          ].map(([label, value, href]) => (
            <Link className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:border-primary-300" href={href as string} key={label as string}>
              <p className="text-sm font-medium text-gray-600">{label}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
            </Link>
          ))}
        </section>

        <section aria-label="Operational summary" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:border-primary-300" href="/dashboard/conversations">
            <p className="text-sm font-medium text-gray-600">Open conversations</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{openConversations.length}</p>
          </Link>
          <Link className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:border-primary-300" href="/dashboard/appointments">
            <p className="text-sm font-medium text-gray-600">Today&apos;s appointments</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{todaysAppointmentsTotal}</p>
          </Link>
          {whatsappStatus !== null && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-600">WhatsApp</p>
              {whatsappStatus.configured ? (
                <div className="mt-2">
                  <p className="font-semibold text-gray-900">Stored WhatsApp configuration</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {formatWhatsAppProvider(whatsappStatus.provider)}
                    {whatsappStatus.isTestConfiguration ? ' (test configuration)' : ''}
                  </p>
                  {whatsappStatus.displayPhoneNumber && (
                    <p className="mt-1 text-sm text-gray-600">{whatsappStatus.displayPhoneNumber}</p>
                  )}
                  {whatsappStatus.isTestConfiguration ? (
                    <p className="mt-2 text-xs text-gray-500">
                      Temporary test configuration while production WhatsApp setup is in progress.
                      It does not indicate that production WhatsApp is connected.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">
                      Stored configuration only. Live connectivity is not verified here.
                    </p>
                  )}
                  {!whatsappStatus.isActive && (
                    <p className="mt-1 text-xs text-gray-500">This configuration is currently inactive.</p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-600">No WhatsApp configuration found for this organization.</p>
              )}
            </div>
          )}
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
                {recentConversations.map((conversation) => {
                  const contact = contactMap.get(conversation.contact_id);
                  return (
                    <li key={conversation.id}>
                      <Link className="block py-3 hover:bg-gray-50" href={`/dashboard/conversations/${conversation.id}`}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-gray-900">{contact?.name ?? 'Contact'}</span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${conversationStatusBadgeClass(conversation.status)}`}>
                            {conversation.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{contact?.phone ?? 'Phone unavailable'}</p>
                        <p className="mt-1 text-xs text-gray-500">{formatOptionalDate(conversation.last_message_at)}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-gray-900">Upcoming appointments</h2>
              <div className="flex items-center gap-4">
                <Link className="text-sm font-medium text-primary-700" href="/dashboard/appointments/new">Create appointment</Link>
                <Link className="text-sm font-medium text-primary-700" href="/dashboard/appointments">View all</Link>
              </div>
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
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${appointmentStatusBadgeClass(appointment.status)}`}>
                          {appointment.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{formatInTimezone(appointment.starts_at, timezone)}</p>
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
                      {contact.email && <p className="mt-1 text-sm text-gray-500">{contact.email}</p>}
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
