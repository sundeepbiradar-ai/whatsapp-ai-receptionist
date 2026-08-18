import 'server-only';

import type { Database } from '@/lib/supabase/database';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DomainError, mapDomainDatabaseError } from '@/lib/domain/errors';
import { requireDomainOrganization } from '@/lib/domain/context';
import { idSchema, messageCreateSchema, parseDomain, type MessageCreateInput } from '@/lib/domain/validation';

type Message = Database['public']['Tables']['messages']['Row'];

const messageColumns =
  'id, organization_id, conversation_id, direction, content, provider, provider_message_id, delivery_status, delivery_status_at, delivery_error_code, delivery_error_message, created_at';

export async function listMessages(conversationId: string): Promise<Message[]> {
  const context = await requireDomainOrganization();
  const validConversationId = parseDomain(idSchema, conversationId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('messages').select(messageColumns).eq('organization_id', context.currentOrganization.id).eq('conversation_id', validConversationId).order('created_at', { ascending: true }).order('id', { ascending: true });
  if (error) throw mapDomainDatabaseError(error);
  return data;
}

export async function getMessage(messageId: string): Promise<Message> {
  const context = await requireDomainOrganization();
  const validMessageId = parseDomain(idSchema, messageId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('messages').select(messageColumns).eq('organization_id', context.currentOrganization.id).eq('id', validMessageId).maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('not_found', 'Message not found.');
  return data;
}

export async function createMessage(input: MessageCreateInput): Promise<Message> {
  const context = await requireDomainOrganization();
  const values = parseDomain(messageCreateSchema, input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('messages').insert({ organization_id: context.currentOrganization.id, conversation_id: values.conversationId, direction: values.direction, content: values.content }).select(messageColumns).single();
  if (error) throw mapDomainDatabaseError(error);
  return data;
}
