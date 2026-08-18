import 'server-only';

import type { Database } from '@/lib/supabase/database';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DomainError, mapAppointmentSchedulingError, mapDomainDatabaseError } from '@/lib/domain/errors';
import { requireDomainOrganization } from '@/lib/domain/context';
import { assertWithinBusinessHours, intervalsConflict, parseSchedulingSettings } from '@/lib/domain/appointments/scheduling';
import {
  assertAppointmentStartInFuture,
  assertAppointmentContactConsistency,
  assertAppointmentUpdatePolicy,
  parseAppointmentCreate,
  parseAppointmentUpdate,
  parseAppointmentTimestamp,
  parseSchedulingInterval,
  parseDomain,
  idSchema,
  type AppointmentCreateInput,
  type AppointmentUpdateInput,
} from '@/lib/domain/validation';

type Appointment = Database['public']['Tables']['appointments']['Row'];
type SchedulingSettingsRow = Database['public']['Tables']['organization_scheduling_settings']['Row'];
type BlockedPeriod = Database['public']['Tables']['organization_blocked_periods']['Row'];

export type AppointmentQueryOptions = {
  statuses?: Database['public']['Enums']['appointment_status'][];
  startsAtFrom?: string;
  startsAtTo?: string;
  page?: number;
  pageSize?: number;
};

export type AppointmentQueryPage = {
  appointments: Appointment[];
  page: number;
  pageSize: number;
  total: number;
};

type SchedulingRpcResult = { ok?: boolean; appointment_id?: string; error_code?: string };

function rpcArgs(values: Record<string, unknown>): Database['public']['Functions']['book_or_reschedule_appointment']['Args'] {
  return values as Database['public']['Functions']['book_or_reschedule_appointment']['Args'];
}

function resolveRpcResult(data: unknown): SchedulingRpcResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new DomainError('database_error', 'The scheduling operation could not be completed.');
  }
  const result = data as SchedulingRpcResult;
  if (!result.ok) throw mapAppointmentSchedulingError(result.error_code);
  if (!result.appointment_id) throw new DomainError('database_error', 'The scheduling operation could not be completed.');
  return result;
}

function schedulingSettingsInput(row: SchedulingSettingsRow): Parameters<typeof parseSchedulingSettings>[0] {
  return {
    timezone: row['timezone'],
    working_days: row['working_days'],
    business_hours: row['business_hours'],
    default_duration_minutes: row['default_duration_minutes'],
  };
}

export async function getSchedulingSettings(): Promise<SchedulingSettingsRow> {
  const context = await requireDomainOrganization();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('organization_scheduling_settings').select('*').eq('organization_id', context.currentOrganization.id).maybeSingle();
  if (error) throw mapDomainDatabaseError(error, 'appointment');
  if (!data) throw new DomainError('scheduling_configuration_unavailable', 'Scheduling is not configured for this organization.');
  parseSchedulingSettings(schedulingSettingsInput(data));
  return data;
}

export async function createSchedulingSettings(input: Database['public']['Tables']['organization_scheduling_settings']['Insert']): Promise<SchedulingSettingsRow> {
  const context = await requireDomainOrganization();
  const values = {
    timezone: input['timezone'] ?? 'UTC',
    working_days: input['working_days'] ?? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    business_hours: input['business_hours'] ?? {},
    default_duration_minutes: input['default_duration_minutes'] ?? 30,
  };
  parseSchedulingSettings(values);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('organization_scheduling_settings').insert({
    organization_id: context.currentOrganization.id,
    timezone: values.timezone,
    working_days: values.working_days,
    business_hours: values.business_hours,
    default_duration_minutes: values.default_duration_minutes,
  }).select('*').single();
  if (error) throw mapDomainDatabaseError(error, 'appointment');
  return data;
}

export async function createBlockedPeriod(input: Omit<Database['public']['Tables']['organization_blocked_periods']['Insert'], 'organization_id'>): Promise<BlockedPeriod> {
  const context = await requireDomainOrganization();
  const interval = parseSchedulingInterval({ startsAt: input['starts_at'], endsAt: input['ends_at'] });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('organization_blocked_periods').insert({ organization_id: context.currentOrganization.id, starts_at: interval.startsAt, ends_at: interval.endsAt, reason: input['reason'] ?? null }).select('*').single();
  if (error) throw mapDomainDatabaseError(error, 'appointment');
  return data;
}

export async function checkAppointmentAvailability(input: { startsAt: string; endsAt: string }, excludeAppointmentId?: string): Promise<void> {
  const context = await requireDomainOrganization();
  const interval = parseSchedulingInterval(input);
  assertAppointmentStartInFuture(interval.startsAt);
  const settings = parseSchedulingSettings(schedulingSettingsInput(await getSchedulingSettings()));
  assertWithinBusinessHours(settings, interval.startsAt, interval.endsAt);
  const supabase = await createServerSupabaseClient();
  const blockedQuery = supabase.from('organization_blocked_periods').select('starts_at, ends_at').eq('organization_id', context.currentOrganization.id).lt('starts_at', interval.endsAt).gt('ends_at', interval.startsAt);
  const appointmentsQuery = supabase.from('appointments').select('id, starts_at, ends_at').eq('organization_id', context.currentOrganization.id).in('status', ['pending', 'confirmed']).lt('starts_at', interval.endsAt).gt('ends_at', interval.startsAt);
  const [{ data: blocked, error: blockedError }, { data: appointments, error: appointmentsError }] = await Promise.all([blockedQuery, appointmentsQuery]);
  if (blockedError) throw mapDomainDatabaseError(blockedError, 'appointment');
  if (appointmentsError) throw mapDomainDatabaseError(appointmentsError, 'appointment');
  if (blocked && blocked.length > 0) throw new DomainError('appointment_blocked_period', 'The requested time is blocked.');
  if (appointments?.some((appointment) => appointment.id !== excludeAppointmentId && intervalsConflict(interval.startsAt, interval.endsAt, appointment.starts_at, appointment.ends_at))) {
    throw new DomainError('appointment_conflict', 'The requested time is unavailable.');
  }
}

export async function bookAppointment(input: AppointmentCreateInput): Promise<Appointment> {
  const context = await requireDomainOrganization();
  const values = parseAppointmentCreate(input);
  const interval = parseSchedulingInterval({ startsAt: values.startsAt, endsAt: values.endsAt });
  await checkAppointmentAvailability(interval);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('book_or_reschedule_appointment', rpcArgs({
    operation: 'book',
    target_organization_id: context.currentOrganization.id,
    target_contact_id: values.contactId,
    target_conversation_id: values.conversationId ?? null,
    target_starts_at: interval.startsAt,
    target_ends_at: interval.endsAt,
    target_notes: values.notes ?? null,
    target_status: values.status,
  }));
  if (error) throw mapDomainDatabaseError(error, 'appointment');
  const result = resolveRpcResult(data);
  return getAppointment(result.appointment_id as string);
}

export async function rescheduleAppointment(appointmentId: string, input: { startsAt: string; endsAt: string }): Promise<Appointment> {
  const context = await requireDomainOrganization();
  const validId = parseDomain(idSchema, appointmentId);
  const interval = parseSchedulingInterval(input);
  const current = await getAppointment(validId);
  assertAppointmentUpdatePolicy(
    { status: current.status, startsAt: current.starts_at, endsAt: current.ends_at, contactId: current.contact_id, conversationId: current.conversation_id },
    { status: current.status, startsAt: interval.startsAt, endsAt: interval.endsAt, contactId: current.contact_id, conversationId: current.conversation_id },
  );
  await checkAppointmentAvailability(interval, validId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('book_or_reschedule_appointment', rpcArgs({
    operation: 'reschedule',
    target_organization_id: context.currentOrganization.id,
    target_contact_id: current.contact_id,
    target_conversation_id: current.conversation_id,
    target_starts_at: interval.startsAt,
    target_ends_at: interval.endsAt,
    target_appointment_id: validId,
    target_notes: current.notes,
  }));
  if (error) throw mapDomainDatabaseError(error, 'appointment');
  resolveRpcResult(data);
  return getAppointment(validId);
}

async function assertAppointmentRelationships(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string,
  contactId: string,
  conversationId: string | null | undefined
): Promise<void> {
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('id', contactId)
    .maybeSingle();
  if (contactError) throw mapDomainDatabaseError(contactError, 'appointment');
  if (!contact) {
    throw new DomainError('appointment_relationship_invalid', 'The appointment contact is invalid.');
  }

  if (!conversationId) return;

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, contact_id')
    .eq('organization_id', organizationId)
    .eq('id', conversationId)
    .maybeSingle();
  if (conversationError) throw mapDomainDatabaseError(conversationError, 'appointment');
  if (!conversation) {
    throw new DomainError('appointment_relationship_invalid', 'The appointment conversation is invalid.');
  }
  assertAppointmentContactConsistency(contactId, conversation.contact_id);
}

export async function listAppointments(): Promise<Appointment[]> {
  const result = await queryAppointments();
  return result.appointments;
}

export async function queryAppointments(options: AppointmentQueryOptions = {}): Promise<AppointmentQueryPage> {
  const context = await requireDomainOrganization();
  const supabase = await createServerSupabaseClient();
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 50;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new DomainError('invalid_input', 'Appointment pagination parameters are invalid.');
  }
  if (options.startsAtFrom !== undefined) parseAppointmentTimestamp(options.startsAtFrom);
  if (options.startsAtTo !== undefined) parseAppointmentTimestamp(options.startsAtTo);
  if (options.startsAtFrom && options.startsAtTo && new Date(options.startsAtTo).getTime() <= new Date(options.startsAtFrom).getTime()) {
    throw new DomainError('invalid_input', 'Appointment date range is invalid.');
  }
  const query = supabase.from('appointments').select('id, organization_id, contact_id, conversation_id, status, starts_at, ends_at, notes, created_at, updated_at', { count: 'exact' }).eq('organization_id', context.currentOrganization.id);
  if (options.statuses && options.statuses.length > 0) query.in('status', options.statuses);
  if (options.startsAtFrom) query.gte('starts_at', options.startsAtFrom);
  if (options.startsAtTo) query.lt('starts_at', options.startsAtTo);
  const offset = (page - 1) * pageSize;
  const { data, error, count } = await query.order('starts_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + pageSize - 1);
  if (error) throw mapDomainDatabaseError(error, 'appointment');
  return { appointments: data, page, pageSize, total: count ?? data.length };
}

export async function getAppointment(appointmentId: string): Promise<Appointment> {
  const context = await requireDomainOrganization();
  const validAppointmentId = parseDomain(idSchema, appointmentId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('appointments').select('id, organization_id, contact_id, conversation_id, status, starts_at, ends_at, notes, created_at, updated_at').eq('organization_id', context.currentOrganization.id).eq('id', validAppointmentId).maybeSingle();
  if (error) throw mapDomainDatabaseError(error, 'appointment');
  if (!data) throw new DomainError('not_found', 'Appointment not found.');
  return data;
}

export async function createAppointment(input: AppointmentCreateInput): Promise<Appointment> {
  return bookAppointment(input);
}

async function updateAppointmentRecord(
  appointmentId: string,
  input: AppointmentUpdateInput,
  allowCancellation = false,
): Promise<Appointment> {
  const context = await requireDomainOrganization();
  const values = parseAppointmentUpdate(input);
  if (values.startsAt !== undefined || values.endsAt !== undefined) {
    throw new DomainError('appointment_reschedule_required', 'Appointment time changes must use the rescheduling operation.');
  }
  if (values.status === 'cancelled' && !allowCancellation) {
    throw new DomainError('appointment_cancellation_required', 'Appointment cancellation must use the cancellation operation.');
  }
  const validAppointmentId = parseDomain(idSchema, appointmentId);
  const supabase = await createServerSupabaseClient();
  const { data: current, error: currentError } = await supabase
    .from('appointments')
    .select('id, organization_id, contact_id, conversation_id, status, starts_at, ends_at, notes, created_at, updated_at')
    .eq('organization_id', context.currentOrganization.id)
    .eq('id', validAppointmentId)
    .maybeSingle();
  if (currentError) throw mapDomainDatabaseError(currentError, 'appointment');
  if (!current) throw new DomainError('not_found', 'Appointment not found.');

  const nextContactId = values.contactId ?? current.contact_id;
  const nextConversationId = values.conversationId !== undefined ? values.conversationId : current.conversation_id;
  const nextStartsAt = values.startsAt ?? current.starts_at;
  const nextEndsAt = values.endsAt ?? current.ends_at;
  const nextStatus = values.status ?? current.status;
  assertAppointmentUpdatePolicy(
    {
      status: current.status,
      startsAt: current.starts_at,
      endsAt: current.ends_at,
      contactId: current.contact_id,
      conversationId: current.conversation_id,
    },
    {
      status: nextStatus,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      contactId: nextContactId,
      conversationId: nextConversationId,
    }
  );
  await assertAppointmentRelationships(
    supabase,
    context.currentOrganization.id,
    nextContactId,
    nextConversationId
  );

  const updates: Database['public']['Tables']['appointments']['Update'] = {};
  if (values.contactId !== undefined) updates.contact_id = values.contactId;
  if (values.conversationId !== undefined) updates.conversation_id = values.conversationId;
  if (values.status !== undefined) updates.status = values.status;
  if (values.startsAt !== undefined) updates.starts_at = values.startsAt;
  if (values.endsAt !== undefined) updates.ends_at = values.endsAt;
  if (values.notes !== undefined) updates.notes = values.notes;
  const { data, error } = await supabase.from('appointments').update(updates).eq('organization_id', context.currentOrganization.id).eq('id', validAppointmentId).select('id, organization_id, contact_id, conversation_id, status, starts_at, ends_at, notes, created_at, updated_at').maybeSingle();
  if (error) throw mapDomainDatabaseError(error, 'appointment');
  if (!data) throw new DomainError('not_found', 'Appointment not found.');
  return data;
}

export async function updateAppointment(appointmentId: string, input: AppointmentUpdateInput): Promise<Appointment> {
  return updateAppointmentRecord(appointmentId, input);
}

export async function cancelAppointment(appointmentId: string): Promise<Appointment> {
  const validId = parseDomain(idSchema, appointmentId);
  return updateAppointmentRecord(validId, { status: 'cancelled' }, true);
}
