import 'server-only';

import type { Database } from '@/lib/supabase/database';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DomainError, mapDomainDatabaseError } from '@/lib/domain/errors';
import { requireDomainOrganization } from '@/lib/domain/context';
import { appointmentCreateSchema, appointmentUpdateSchema, idSchema, parseDomain, type AppointmentCreateInput, type AppointmentUpdateInput } from '@/lib/domain/validation';

type Appointment = Database['public']['Tables']['appointments']['Row'];

export async function listAppointments(): Promise<Appointment[]> {
  const context = await requireDomainOrganization();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('appointments').select('id, organization_id, contact_id, conversation_id, status, starts_at, ends_at, notes, created_at, updated_at').eq('organization_id', context.currentOrganization.id).order('starts_at', { ascending: true }).order('id', { ascending: true });
  if (error) throw mapDomainDatabaseError(error);
  return data;
}

export async function getAppointment(appointmentId: string): Promise<Appointment> {
  const context = await requireDomainOrganization();
  const validAppointmentId = parseDomain(idSchema, appointmentId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('appointments').select('id, organization_id, contact_id, conversation_id, status, starts_at, ends_at, notes, created_at, updated_at').eq('organization_id', context.currentOrganization.id).eq('id', validAppointmentId).maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('not_found', 'Appointment not found.');
  return data;
}

export async function createAppointment(input: AppointmentCreateInput): Promise<Appointment> {
  const context = await requireDomainOrganization();
  const values = parseDomain(appointmentCreateSchema, input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('appointments').insert({ organization_id: context.currentOrganization.id, contact_id: values.contactId, conversation_id: values.conversationId ?? null, status: values.status, starts_at: values.startsAt, ends_at: values.endsAt, notes: values.notes ?? null }).select('id, organization_id, contact_id, conversation_id, status, starts_at, ends_at, notes, created_at, updated_at').single();
  if (error) throw mapDomainDatabaseError(error);
  return data;
}

export async function updateAppointment(appointmentId: string, input: AppointmentUpdateInput): Promise<Appointment> {
  const context = await requireDomainOrganization();
  const values = parseDomain(appointmentUpdateSchema, input);
  const validAppointmentId = parseDomain(idSchema, appointmentId);
  const supabase = await createServerSupabaseClient();
  const updates: Database['public']['Tables']['appointments']['Update'] = {};
  if (values.contactId !== undefined) updates.contact_id = values.contactId;
  if (values.conversationId !== undefined) updates.conversation_id = values.conversationId;
  if (values.status !== undefined) updates.status = values.status;
  if (values.startsAt !== undefined) updates.starts_at = values.startsAt;
  if (values.endsAt !== undefined) updates.ends_at = values.endsAt;
  if (values.notes !== undefined) updates.notes = values.notes;
  const { data, error } = await supabase.from('appointments').update(updates).eq('organization_id', context.currentOrganization.id).eq('id', validAppointmentId).select('id, organization_id, contact_id, conversation_id, status, starts_at, ends_at, notes, created_at, updated_at').maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('not_found', 'Appointment not found.');
  return data;
}
