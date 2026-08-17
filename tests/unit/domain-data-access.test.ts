import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DomainError, mapDomainDatabaseError } from '@/lib/domain/errors';
import {
  appointmentCreateSchema,
  assertAppointmentContactConsistency,
  assertAppointmentStartInFuture,
  assertAppointmentStatusTransition,
  assertAppointmentTimeRange,
  assertAppointmentUpdatePolicy,
  contactCreateSchema,
  messageCreateSchema,
  parseAppointmentCreate,
  parseAppointmentUpdate,
} from '@/lib/domain/validation';

const repositoryFiles = [
  'appointments/repository.ts',
  'contacts/repository.ts',
  'conversations/repository.ts',
  'messages/repository.ts',
] as const;
const contactsActions = readFileSync(join(process.cwd(), 'lib/domain/contacts/actions.ts'), 'utf8');

function repositorySource(file: string): string {
  return readFileSync(join(process.cwd(), 'lib/domain', file), 'utf8');
}

describe('domain data-access validation', () => {
  it('validates contact input', () => {
    expect(contactCreateSchema.safeParse({ phone: '+10000000000', name: 'A' }).success).toBe(true);
    expect(contactCreateSchema.safeParse({ phone: '', name: 'A' }).success).toBe(false);
    expect(contactCreateSchema.safeParse({ phone: '+1', name: 'A', email: 'bad' }).success).toBe(false);
  });

  it('rejects empty messages and invalid appointment ranges', () => {
    expect(messageCreateSchema.safeParse({ conversationId: 'not-an-id', direction: 'inbound', content: 'x' }).success).toBe(false);
    expect(messageCreateSchema.safeParse({ conversationId: '00000000-0000-0000-0000-000000000001', direction: 'inbound', content: '  ' }).success).toBe(false);
    expect(appointmentCreateSchema.safeParse({ contactId: '00000000-0000-0000-0000-000000000001', startsAt: '2026-01-01T11:00:00Z', endsAt: '2026-01-01T10:00:00Z' }).success).toBe(false);
  });

  it('enforces appointment time policies with stable domain errors', () => {
    expect(() => assertAppointmentStartInFuture('2026-01-01T10:00:00.000Z', new Date('2026-01-01T10:00:00.000Z'))).toThrowError(
      expect.objectContaining({ code: 'appointment_past' })
    );
    expect(() => assertAppointmentTimeRange('2026-01-01T11:00:00.000Z', '2026-01-01T10:00:00.000Z')).toThrowError(
      expect.objectContaining({ code: 'appointment_time_invalid' })
    );
    expect(() => parseAppointmentCreate({
      contactId: '00000000-0000-0000-0000-000000000001',
      startsAt: '2026-01-01T11:00:00Z',
      endsAt: '2026-01-01T10:00:00Z',
    })).toThrowError(expect.objectContaining({ code: 'appointment_time_invalid' }));
    expect(parseAppointmentUpdate({ notes: 'Historical note' })).toEqual({ notes: 'Historical note' });
  });

  it('enforces the normal appointment status transition matrix', () => {
    expect(() => assertAppointmentStatusTransition('pending', 'confirmed')).not.toThrow();
    expect(() => assertAppointmentStatusTransition('pending', 'cancelled')).not.toThrow();
    expect(() => assertAppointmentStatusTransition('confirmed', 'completed')).not.toThrow();
    expect(() => assertAppointmentStatusTransition('confirmed', 'cancelled')).not.toThrow();
    expect(() => assertAppointmentStatusTransition('pending', 'completed')).toThrowError(
      expect.objectContaining({ code: 'appointment_transition_invalid' })
    );
    expect(() => assertAppointmentStatusTransition('cancelled', 'pending')).toThrowError(
      expect.objectContaining({ code: 'appointment_terminal' })
    );
    expect(() => assertAppointmentStatusTransition('completed', 'cancelled')).toThrowError(
      expect.objectContaining({ code: 'appointment_terminal' })
    );
  });

  it('enforces same-contact conversation relationships', () => {
    expect(() => assertAppointmentContactConsistency('contact-a', 'contact-b')).toThrowError(
      expect.objectContaining({ code: 'appointment_relationship_invalid' })
    );
    expect(() => assertAppointmentContactConsistency('contact-a', 'contact-a')).not.toThrow();
  });

  it('allows only notes and status changes after an appointment starts', () => {
    const current = {
      status: 'confirmed' as const,
      startsAt: '2026-01-01T10:00:00.000Z',
      endsAt: '2026-01-01T11:00:00.000Z',
      contactId: 'contact-a',
      conversationId: 'conversation-a',
    };
    expect(() => assertAppointmentUpdatePolicy(
      current,
      { ...current, status: 'cancelled' },
      new Date('2026-01-01T10:30:00.000Z')
    )).not.toThrow();
    expect(() => assertAppointmentUpdatePolicy(
      current,
      { ...current, contactId: 'contact-b' },
      new Date('2026-01-01T10:30:00.000Z')
    )).toThrowError(expect.objectContaining({ code: 'appointment_past' }));
    expect(() => assertAppointmentUpdatePolicy(
      { ...current, status: 'cancelled' },
      { ...current, status: 'pending' },
      new Date('2025-12-01T00:00:00.000Z')
    )).toThrowError(expect.objectContaining({ code: 'appointment_terminal' }));
  });

  it('maps database errors without exposing internals', () => {
    const duplicate = mapDomainDatabaseError({ code: '23505' });
    const failure = mapDomainDatabaseError({ code: 'unexpected' });

    expect(duplicate).toBeInstanceOf(DomainError);
    expect(duplicate.code).toBe('duplicate_contact');
    expect(failure.code).toBe('database_error');
    expect(failure.message).not.toContain('unexpected');
  });

  it('keeps every repository server-only and RLS-backed', () => {
    for (const file of repositoryFiles) {
      const source = repositorySource(file);
      expect(source).toContain('import \'server-only\';');
      expect(source).toContain('requireDomainOrganization');
      expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(source).not.toContain('@/lib/supabase/client');
    }
  });

  it('constructs explicit update objects instead of spreading input', () => {
    for (const file of repositoryFiles) {
      expect(repositorySource(file)).not.toContain('...input');
    }
  });

  it('keeps Contacts actions server-only and free of client tenant fields', () => {
    expect(contactsActions).toContain('"use server";');
    expect(contactsActions).toContain('createContact');
    expect(contactsActions).toContain('updateContact');
    expect(contactsActions).toContain('deleteContact');
    expect(contactsActions).not.toContain('organization_id');
    expect(contactsActions).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
