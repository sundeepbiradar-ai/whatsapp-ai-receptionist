import { describe, expect, it } from 'vitest';

import {
  getDayBoundsInTimezone,
  getOpenConversations,
  getRecentConversations,
  getUpcomingAppointments,
} from '@/lib/dashboard/overview';
import type { Database } from '@/lib/supabase/database';

type Conversation = Database['public']['Tables']['conversations']['Row'];
type Appointment = Database['public']['Tables']['appointments']['Row'];

const conversation = (id: string, status: Conversation['status'] = 'open'): Conversation => ({
  id,
  organization_id: 'organization-id',
  contact_id: `contact-${id}`,
  status,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_message_at: null,
  channel: null,
  whatsapp_config_id: null,
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

  it('keeps only open conversations', () => {
    const result = getOpenConversations([
      conversation('1', 'open'),
      conversation('2', 'closed'),
      conversation('3', 'open'),
    ]);

    expect(result.map((item) => item.id)).toEqual(['1', '3']);
  });

  it('computes day bounds in UTC', () => {
    const bounds = getDayBoundsInTimezone('UTC', new Date('2026-08-21T15:30:00.000Z'));

    expect(bounds).toEqual({ startsAtFrom: '2026-08-21T00:00:00.000Z', startsAtTo: '2026-08-22T00:00:00.000Z' });
  });

  it('computes day bounds in the organization timezone', () => {
    const bounds = getDayBoundsInTimezone('Asia/Kolkata', new Date('2026-08-21T15:30:00.000Z'));

    expect(bounds).toEqual({ startsAtFrom: '2026-08-20T18:30:00.000Z', startsAtTo: '2026-08-21T18:30:00.000Z' });
  });

  it('returns null day bounds for an invalid timezone', () => {
    expect(getDayBoundsInTimezone('not-a-timezone', new Date('2026-08-21T15:30:00.000Z'))).toBeNull();
  });
});
