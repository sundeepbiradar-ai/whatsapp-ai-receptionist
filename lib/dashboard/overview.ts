import type { Database } from '@/lib/supabase/database';

type Contact = Database['public']['Tables']['contacts']['Row'];
type Conversation = Database['public']['Tables']['conversations']['Row'];
type Appointment = Database['public']['Tables']['appointments']['Row'];

export type DashboardOverviewData = {
  contacts: Contact[];
  conversations: Conversation[];
  appointments: Appointment[];
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
