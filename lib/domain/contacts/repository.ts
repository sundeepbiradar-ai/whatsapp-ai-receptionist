import 'server-only';

import type { Database } from '@/lib/supabase/database';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DomainError, mapDomainDatabaseError } from '@/lib/domain/errors';
import { requireDomainOrganization } from '@/lib/domain/context';
import { contactCreateSchema, contactUpdateSchema, idSchema, parseDomain, type ContactCreateInput, type ContactUpdateInput } from '@/lib/domain/validation';

type Contact = Database['public']['Tables']['contacts']['Row'];

export async function listContacts(search?: string): Promise<Contact[]> {
  const context = await requireDomainOrganization();
  const supabase = await createServerSupabaseClient();
  let query = supabase.from('contacts').select('id, organization_id, phone, name, email, created_at, updated_at').eq('organization_id', context.currentOrganization.id);
  const normalizedSearch = search?.trim();
  if (normalizedSearch) {
    const escapedSearch = normalizedSearch.replace(/[\\%_(),]/g, '\\$&');
    query = query.or(`name.ilike.%${escapedSearch}%,phone.ilike.%${escapedSearch}%,email.ilike.%${escapedSearch}%`);
  }
  const { data, error } = await query.order('name', { ascending: true }).order('id', { ascending: true });
  if (error) throw mapDomainDatabaseError(error);
  return data;
}

export async function listRecentContacts(limit = 5): Promise<Contact[]> {
  const context = await requireDomainOrganization();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('contacts')
    .select('id, organization_id, phone, name, email, created_at, updated_at')
    .eq('organization_id', context.currentOrganization.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw mapDomainDatabaseError(error);
  return data;
}

export async function getContact(contactId: string): Promise<Contact> {
  const context = await requireDomainOrganization();
  const validContactId = parseDomain(idSchema, contactId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('contacts').select('id, organization_id, phone, name, email, created_at, updated_at').eq('organization_id', context.currentOrganization.id).eq('id', validContactId).maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('not_found', 'Contact not found.');
  return data;
}

export async function createContact(input: ContactCreateInput): Promise<Contact> {
  const context = await requireDomainOrganization();
  const values = parseDomain(contactCreateSchema, input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('contacts').insert({ organization_id: context.currentOrganization.id, phone: values.phone, name: values.name, email: values.email ?? null }).select('id, organization_id, phone, name, email, created_at, updated_at').single();
  if (error) throw mapDomainDatabaseError(error);
  return data;
}

export async function updateContact(contactId: string, input: ContactUpdateInput): Promise<Contact> {
  const context = await requireDomainOrganization();
  const values = parseDomain(contactUpdateSchema, input);
  const validContactId = parseDomain(idSchema, contactId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('contacts').update(values).eq('organization_id', context.currentOrganization.id).eq('id', validContactId).select('id, organization_id, phone, name, email, created_at, updated_at').maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('not_found', 'Contact not found.');
  return data;
}

export async function deleteContact(contactId: string): Promise<void> {
  const context = await requireDomainOrganization();
  const validContactId = parseDomain(idSchema, contactId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('contacts').delete().eq('organization_id', context.currentOrganization.id).eq('id', validContactId).select('id').maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('not_found', 'Contact not found.');
}
