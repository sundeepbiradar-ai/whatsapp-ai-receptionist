import { describe, expect, it } from 'vitest';

import { getRecentConversations, getUpcomingAppointments } from '@/lib/dashboard/overview';
import type { Database } from '@/lib/supabase/database';

type Conversation = Database['public']['Tables']['conversations']['Row'];
type Appointment = Database['public']['Tables']['appointments']['Row'];

const conversation = (id: string): Conversation => ({
  id,
  organization_id: 'organization-id',
  contact_id: `contact-${id}`,
  status: 'open',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_message_at: null,
});

const appointment = (id: string, startsAt: string, status: Appointment['status']): Appointment => ({
  id,
  organization_id: 'organization-id',
  contact_id: `contact-${id}`,
  conversation_id: null,
  status,
  starts_at: startsAt,
  ends_at: '2026-01-02T11:00:00.000Z',
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
});

describe('dashboard overview selectors', () => {
  it('limits recent conversations deterministically', () => {
    expect(getRecentConversations([conversation('1'), conversation('2')], 1).map((item) => item.id)).toEqual(['1']);
  });

  it('keeps only future non-terminal appointments', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const result = getUpcomingAppointments([
      appointment('future', '2026-01-02T10:00:00.000Z', 'pending'),
      appointment('past', '2025-12-31T10:00:00.000Z', 'confirmed'),
      appointment('cancelled', '2026-01-03T10:00:00.000Z', 'cancelled'),
      appointment('completed', '2026-01-04T10:00:00.000Z', 'completed'),
    ], now);

    expect(result.map((item) => item.id)).toEqual(['future']);
  });
});
