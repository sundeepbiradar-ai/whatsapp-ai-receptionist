import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAppointment,
  updateAppointment,
} from '@/lib/domain/appointments/repository';

vi.mock('server-only', () => ({}));

const organizationId = '11111111-1111-4111-8111-111111111111';
const appointmentId = '22222222-2222-4222-8222-222222222222';
const contactId = '33333333-3333-4333-8333-333333333333';
const otherContactId = '44444444-4444-4444-8444-444444444444';
const conversationId = '55555555-5555-4555-8555-555555555555';
const otherConversationId = '66666666-6666-4666-8666-666666666666';

const currentOrganization = {
  id: organizationId,
  name: 'Test organization',
  slug: 'test-organization',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const appointment = (overrides: Record<string, unknown> = {}) => ({
  id: appointmentId,
  organization_id: organizationId,
  contact_id: contactId,
  conversation_id: conversationId,
  status: 'pending' as const,
  starts_at: '2099-01-01T10:00:00.000Z',
  ends_at: '2099-01-01T11:00:00.000Z',
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

type QueryResult = { data: unknown; error: null | { code?: string; message?: string } };

function query(result: QueryResult): Record<string, unknown> {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

const state = vi.hoisted(() => ({
  appointmentResult: { data: null as unknown, error: null as null | { code?: string; message?: string } },
  contactResult: {
    data: { id: '33333333-3333-4333-8333-333333333333' } as { id: string } | null,
    error: null as null | { code?: string; message?: string },
  },
  conversationResult: {
    data: {
      id: '55555555-5555-4555-8555-555555555555',
      contact_id: '33333333-3333-4333-8333-333333333333',
    },
    error: null,
  },
  updateResult: { data: null as unknown, error: null as null | { code?: string; message?: string } },
}));

vi.mock('@/lib/domain/context', () => ({
  requireDomainOrganization: vi.fn(async () => ({
    status: 'ready',
    currentOrganization,
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === 'contacts') return query(state.contactResult);
      if (table === 'conversations') return query(state.conversationResult);
      return {
        select: vi.fn(() => query(state.appointmentResult)),
        insert: vi.fn(() => ({
          select: vi.fn(() => query(state.appointmentResult)),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => query(state.updateResult)),
          })),
        })),
      };
    }),
  })),
}));

function expectDomainError(operation: Promise<unknown>, code: string): Promise<void> {
  return expect(operation).rejects.toMatchObject({ code });
}

describe('appointment repository domain rules', () => {
  beforeEach(() => {
    state.appointmentResult = { data: null, error: null };
    state.contactResult = { data: { id: contactId }, error: null };
    state.conversationResult = { data: { id: conversationId, contact_id: contactId }, error: null };
    state.updateResult = { data: null, error: null };
  });

  it('rejects past creation and accepts valid future creation', async () => {
    await expectDomainError(
      createAppointment({
        contactId,
        startsAt: '2020-01-01T10:00:00.000Z',
        endsAt: '2020-01-01T11:00:00.000Z',
        status: 'pending',
      }),
      'appointment_past'
    );

    const futureAppointment = appointment({ starts_at: '2099-01-01T10:00:00.000Z' });
    state.appointmentResult = { data: futureAppointment, error: null };
    await expect(createAppointment({
      contactId,
      conversationId,
      startsAt: '2099-01-01T10:00:00.000Z',
      endsAt: '2099-01-01T11:00:00.000Z',
      status: 'pending',
    })).resolves.toEqual(futureAppointment);
  });

  it.each([
    ['pending', 'confirmed'],
    ['pending', 'cancelled'],
    ['confirmed', 'completed'],
    ['confirmed', 'cancelled'],
  ] as const)('allows %s -> %s through the repository', async (currentStatus, nextStatus) => {
    state.appointmentResult = { data: appointment({ status: currentStatus }), error: null };
    state.updateResult = { data: appointment({ status: nextStatus }), error: null };

    await expect(updateAppointment(appointmentId, { status: nextStatus })).resolves.toMatchObject({
      status: nextStatus,
    });
  });

  it.each([
    ['pending', 'completed', 'appointment_transition_invalid'],
    ['confirmed', 'pending', 'appointment_transition_invalid'],
    ['cancelled', 'pending', 'appointment_terminal'],
    ['cancelled', 'confirmed', 'appointment_terminal'],
    ['cancelled', 'cancelled', 'appointment_terminal'],
    ['completed', 'pending', 'appointment_terminal'],
    ['completed', 'confirmed', 'appointment_terminal'],
    ['completed', 'cancelled', 'appointment_terminal'],
  ] as const)('rejects %s -> %s through the repository', async (currentStatus, nextStatus, errorCode) => {
    state.appointmentResult = { data: appointment({ status: currentStatus }), error: null };

    await expectDomainError(
      updateAppointment(appointmentId, { status: nextStatus }),
      errorCode
    );
  });

  it('allows unchanged active status updates', async () => {
    state.appointmentResult = { data: appointment({ status: 'confirmed' }), error: null };
    state.updateResult = { data: appointment({ status: 'confirmed', notes: 'Updated' }), error: null };

    await expect(updateAppointment(appointmentId, { notes: 'Updated', status: 'confirmed' }))
      .resolves.toMatchObject({ status: 'confirmed', notes: 'Updated' });
  });

  it.each(['cancelled', 'completed'] as const)('rejects normal edits to %s appointments', async (status) => {
    state.appointmentResult = { data: appointment({ status }), error: null };

    await expectDomainError(updateAppointment(appointmentId, { notes: 'Correction' }), 'appointment_terminal');
    await expectDomainError(updateAppointment(appointmentId, { status: status === 'cancelled' ? 'pending' : 'confirmed' }), 'appointment_terminal');
  });

  it('allows historical notes and cancellation but rejects historical schedule and relationship changes', async () => {
    state.appointmentResult = {
      data: appointment({
        status: 'confirmed',
        starts_at: '2020-01-01T10:00:00.000Z',
        ends_at: '2020-01-01T11:00:00.000Z',
      }),
      error: null,
    };
    state.updateResult = { data: appointment({ status: 'cancelled' }), error: null };

    await expect(updateAppointment(appointmentId, { notes: 'Reconciled' })).resolves.toBeTruthy();
    await expect(updateAppointment(appointmentId, { status: 'cancelled' })).resolves.toBeTruthy();
    await expectDomainError(updateAppointment(appointmentId, { endsAt: '2020-01-01T12:00:00.000Z' }), 'appointment_past');
    await expectDomainError(updateAppointment(appointmentId, { contactId: otherContactId }), 'appointment_past');
    await expectDomainError(updateAppointment(appointmentId, { conversationId: otherConversationId }), 'appointment_past');
  });

  it.each(['pending', 'confirmed'] as const)('allows past %s cancellation for reconciliation', async (status) => {
    state.appointmentResult = {
      data: appointment({
        status,
        starts_at: '2020-01-01T10:00:00.000Z',
        ends_at: '2020-01-01T11:00:00.000Z',
      }),
      error: null,
    };
    state.updateResult = { data: appointment({ status: 'cancelled' }), error: null };

    await expect(updateAppointment(appointmentId, { status: 'cancelled' }))
      .resolves.toMatchObject({ status: 'cancelled' });
  });

  it('rejects a same-organization conversation belonging to another contact', async () => {
    state.appointmentResult = { data: appointment(), error: null };
    state.conversationResult = { data: { id: otherConversationId, contact_id: otherContactId }, error: null };

    await expectDomainError(
      updateAppointment(appointmentId, { conversationId: otherConversationId }),
      'appointment_relationship_invalid'
    );
  });

  it('accepts a same-contact conversation and preserves cancellation as a status mutation', async () => {
    state.appointmentResult = { data: appointment({ status: 'confirmed' }), error: null };
    state.updateResult = { data: appointment({ status: 'cancelled' }), error: null };

    await expect(updateAppointment(appointmentId, { conversationId, status: 'cancelled' }))
      .resolves.toMatchObject({ status: 'cancelled', id: appointmentId });
  });

  it('maps appointment database failures safely and logs their details', async () => {
    const error = { code: '23503', details: 'internal detail', message: 'internal message' };
    state.contactResult = { data: null, error };

    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expectDomainError(createAppointment({
      contactId,
      startsAt: '2099-01-01T10:00:00.000Z',
      endsAt: '2099-01-01T11:00:00.000Z',
      status: 'pending',
    }), 'appointment_relationship_invalid');
    expect(logSpy).toHaveBeenCalledWith('Appointment database operation failed.', expect.objectContaining(error));
    logSpy.mockRestore();
  });
});