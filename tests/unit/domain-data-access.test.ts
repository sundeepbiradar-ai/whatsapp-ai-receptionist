import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DomainError, mapDomainDatabaseError } from '@/lib/domain/errors';
import { appointmentCreateSchema, contactCreateSchema, messageCreateSchema } from '@/lib/domain/validation';

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
