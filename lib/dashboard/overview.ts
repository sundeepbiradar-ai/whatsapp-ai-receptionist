import { formatLocalDateTimeInput, localDateTimeToUtc } from '@/lib/domain/appointments/scheduling';
import type { Database } from '@/lib/supabase/database';

type Contact = Database['public']['Tables']['contacts']['Row'];
type Conversation = Database['public']['Tables']['conversations']['Row'];
type Appointment = Database['public']['Tables']['appointments']['Row'];

export type DashboardOverviewData = {
  contacts: Contact[];
  conversations: Conversation[];
  appointments: Appointment[];
};

export type DashboardDayBounds = {
  startsAtFrom: string;
  startsAtTo: string;
};

export function getUpcomingAppointments(appointments: Appointment[], now = new Date()): Appointment[] {
  return appointments
    .filter((appointment) => new Date(appointment.starts_at) >= now)
    .filter((appointment) => appointment.status !== 'cancelled' && appointment.status !== 'completed')
    .slice(0, 5);
}

export function getRecentConversations(conversations: Conversation[], limit = 5): Conversation[] {
  return conversations.slice(0, limit);
}

export function getOpenConversations(conversations: Conversation[]): Conversation[] {
  return conversations.filter((conversation) => conversation.status === 'open');
}

export function getDayBoundsInTimezone(timezone: string, now = new Date()): DashboardDayBounds | null {
  try {
    const todayKey = formatLocalDateTimeInput(now.toISOString(), timezone).slice(0, 10);
    const tomorrowKey = new Date(
      Date.UTC(
        Number(todayKey.slice(0, 4)),
        Number(todayKey.slice(5, 7)) - 1,
        Number(todayKey.slice(8, 10)) + 1,
      ),
    ).toISOString().slice(0, 10);
    return {
      startsAtFrom: localDateTimeToUtc(`${todayKey}T00:00`, timezone),
      startsAtTo: localDateTimeToUtc(`${tomorrowKey}T00:00`, timezone),
    };
  } catch {
    return null;
  }
}
