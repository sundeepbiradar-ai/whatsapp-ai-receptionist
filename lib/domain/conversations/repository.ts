import 'server-only';

import type { Database } from '@/lib/supabase/database';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DomainError, mapDomainDatabaseError } from '@/lib/domain/errors';
import { requireDomainOrganization } from '@/lib/domain/context';
import { conversationCreateSchema, conversationStatusSchema, idSchema, parseDomain, type ConversationCreateInput, type ConversationStatusInput } from '@/lib/domain/validation';

type Conversation = Database['public']['Tables']['conversations']['Row'];

export async function listConversations(): Promise<Conversation[]> {
  const context = await requireDomainOrganization();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('conversations').select('id, organization_id, contact_id, status, created_at, updated_at, last_message_at').eq('organization_id', context.currentOrganization.id).order('last_message_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).order('id', { ascending: true });
  if (error) throw mapDomainDatabaseError(error);
  return data;
}

export async function getConversation(conversationId: string): Promise<Conversation> {
  const context = await requireDomainOrganization();
  const validConversationId = parseDomain(idSchema, conversationId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('conversations').select('id, organization_id, contact_id, status, created_at, updated_at, last_message_at').eq('organization_id', context.currentOrganization.id).eq('id', validConversationId).maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('not_found', 'Conversation not found.');
  return data;
}

export async function createConversation(input: ConversationCreateInput): Promise<Conversation> {
  const context = await requireDomainOrganization();
  const values = parseDomain(conversationCreateSchema, input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('conversations').insert({ organization_id: context.currentOrganization.id, contact_id: values.contactId, status: values.status }).select('id, organization_id, contact_id, status, created_at, updated_at, last_message_at').single();
  if (error) throw mapDomainDatabaseError(error);
  return data;
}

export async function updateConversationStatus(conversationId: string, input: ConversationStatusInput): Promise<Conversation> {
  const context = await requireDomainOrganization();
  const values = parseDomain(conversationStatusSchema, input);
  const validConversationId = parseDomain(idSchema, conversationId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('conversations').update({ status: values.status }).eq('organization_id', context.currentOrganization.id).eq('id', validConversationId).select('id, organization_id, contact_id, status, created_at, updated_at, last_message_at').maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('not_found', 'Conversation not found.');
  return data;
}
