import 'server-only';

import { requireDomainOrganization } from '@/lib/domain/context';
import { DomainError, mapDomainDatabaseError } from '@/lib/domain/errors';
import { idSchema, parseDomain } from '@/lib/domain/validation';
import {
  assertValidTimezone,
  parseSchedulingSettings,
  type SchedulingWeekday,
} from '@/lib/domain/appointments/scheduling';
import {
  blockedPeriodSchema,
  businessProfileSchema,
  receptionistSettingsSchema,
  schedulingSettingsSchema,
  whatsAppMetadataSchema,
  type BlockedPeriodInput,
  type BusinessProfileInput,
  type ReceptionistSettingsInput,
  type SchedulingSettingsInput,
  type WhatsAppMetadataInput,
} from '@/lib/domain/business/validation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export type BusinessProfile = {
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  address: string | null;
};

export type BusinessSchedulingSettings = {
  timezone: string;
  workingDays: SchedulingWeekday[];
  businessHours: Record<string, { start: string; end: string } | null>;
  defaultDurationMinutes: number;
};

export type BusinessBlockedPeriod = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export type BusinessReceptionistSettings = {
  instructions: string | null;
  faq: string | null;
};

/** Safe metadata only: no access token, app secret, verify token or Vault reference. */
export type BusinessWhatsAppConfig = {
  id: string;
  provider: string;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhoneNumber: string | null;
  isActive: boolean;
};

export type BusinessConfiguration = {
  organizationId: string;
  role: 'owner' | 'admin' | 'member';
  canManage: boolean;
  profile: BusinessProfile;
  scheduling: BusinessSchedulingSettings | null;
  blockedPeriods: BusinessBlockedPeriod[];
  receptionist: BusinessReceptionistSettings;
  whatsApp: BusinessWhatsAppConfig[];
};

const maxBlockedPeriods = 100;

async function requireManageableOrganization() {
  const context = await requireDomainOrganization();
  const role = context.currentMembership.role;
  if (role !== 'owner' && role !== 'admin') {
    throw new DomainError('forbidden', 'Only organization owners and admins can change configuration.');
  }
  return context;
}

/**
 * Single read boundary for the authenticated organization's safe configuration.
 * The caller never supplies an organization id and the service role is not used.
 */
export async function getBusinessConfiguration(): Promise<BusinessConfiguration> {
  const context = await requireDomainOrganization();
  const organizationId = context.currentOrganization.id;
  const role = context.currentMembership.role;
  const supabase = await createServerSupabaseClient();

  const [organization, scheduling, blocked, receptionist, whatsApp] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, slug, description, public_email, public_phone, address')
      .eq('id', organizationId)
      .maybeSingle(),
    supabase
      .from('organization_scheduling_settings')
      .select('timezone, working_days, business_hours, default_duration_minutes')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('organization_blocked_periods')
      .select('id, starts_at, ends_at, reason')
      .eq('organization_id', organizationId)
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(maxBlockedPeriods),
    supabase
      .from('organization_receptionist_settings')
      .select('instructions, faq')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('organization_whatsapp_configs')
      .select('id, provider, phone_number_id, business_account_id, display_phone_number, is_active')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
  ]);

  if (organization.error) throw mapDomainDatabaseError(organization.error);
  if (scheduling.error) throw mapDomainDatabaseError(scheduling.error);
  if (blocked.error) throw mapDomainDatabaseError(blocked.error);
  if (receptionist.error) throw mapDomainDatabaseError(receptionist.error);
  if (whatsApp.error) throw mapDomainDatabaseError(whatsApp.error);
  if (!organization.data) throw new DomainError('not_found', 'Organization not found.');

  return {
    organizationId,
    role,
    canManage: role === 'owner' || role === 'admin',
    profile: {
      organizationId,
      name: organization.data.name,
      slug: organization.data.slug,
      description: organization.data.description,
      publicEmail: organization.data.public_email,
      publicPhone: organization.data.public_phone,
      address: organization.data.address,
    },
    scheduling: scheduling.data
      ? {
          timezone: scheduling.data.timezone,
          workingDays: scheduling.data.working_days as SchedulingWeekday[],
          businessHours: scheduling.data.business_hours as BusinessSchedulingSettings['businessHours'],
          defaultDurationMinutes: scheduling.data.default_duration_minutes,
        }
      : null,
    blockedPeriods: blocked.data.map((period) => ({
      id: period.id,
      startsAt: period.starts_at,
      endsAt: period.ends_at,
      reason: period.reason,
    })),
    receptionist: {
      instructions: receptionist.data?.instructions ?? null,
      faq: receptionist.data?.faq ?? null,
    },
    whatsApp: whatsApp.data.map((config) => ({
      id: config.id,
      provider: config.provider,
      phoneNumberId: config.phone_number_id,
      businessAccountId: config.business_account_id,
      displayPhoneNumber: config.display_phone_number,
      isActive: config.is_active,
    })),
  };
}

export async function updateBusinessProfile(input: BusinessProfileInput): Promise<BusinessProfile> {
  const context = await requireManageableOrganization();
  const values = parseDomain(businessProfileSchema, input);
  const organizationId = context.currentOrganization.id;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('organizations')
    .update({
      name: values.name,
      description: values.description ?? null,
      public_email: values.publicEmail ?? null,
      public_phone: values.publicPhone ?? null,
      address: values.address ?? null,
    })
    .eq('id', organizationId)
    .select('id, name, slug, description, public_email, public_phone, address')
    .maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('forbidden', 'The organization profile could not be updated.');
  return {
    organizationId,
    name: data.name,
    slug: data.slug,
    description: data.description,
    publicEmail: data.public_email,
    publicPhone: data.public_phone,
    address: data.address,
  };
}

export async function updateSchedulingConfiguration(
  input: SchedulingSettingsInput
): Promise<BusinessSchedulingSettings> {
  const context = await requireManageableOrganization();
  const values = parseDomain(schedulingSettingsSchema, input);
  assertValidTimezone(values.timezone);
  // Reuse the Phase 4 validator so scheduling semantics stay in one place.
  parseSchedulingSettings({
    timezone: values.timezone,
    working_days: values.workingDays,
    business_hours: values.businessHours,
    default_duration_minutes: values.defaultDurationMinutes,
  });

  const organizationId = context.currentOrganization.id;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('organization_scheduling_settings')
    .upsert(
      {
        organization_id: organizationId,
        timezone: values.timezone,
        working_days: values.workingDays,
        business_hours: values.businessHours,
        default_duration_minutes: values.defaultDurationMinutes,
      },
      { onConflict: 'organization_id' }
    )
    .select('timezone, working_days, business_hours, default_duration_minutes')
    .maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('forbidden', 'Scheduling configuration could not be updated.');
  return {
    timezone: data.timezone,
    workingDays: data.working_days as SchedulingWeekday[],
    businessHours: data.business_hours as BusinessSchedulingSettings['businessHours'],
    defaultDurationMinutes: data.default_duration_minutes,
  };
}

export async function createBlockedPeriodEntry(
  input: BlockedPeriodInput
): Promise<BusinessBlockedPeriod> {
  const context = await requireManageableOrganization();
  const values = parseDomain(blockedPeriodSchema, input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('organization_blocked_periods')
    .insert({
      organization_id: context.currentOrganization.id,
      starts_at: values.startsAt,
      ends_at: values.endsAt,
      reason: values.reason ?? null,
    })
    .select('id, starts_at, ends_at, reason')
    .maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('forbidden', 'The blocked period could not be created.');
  return { id: data.id, startsAt: data.starts_at, endsAt: data.ends_at, reason: data.reason };
}

export async function deleteBlockedPeriodEntry(blockedPeriodId: string): Promise<void> {
  const context = await requireManageableOrganization();
  const validId = parseDomain(idSchema, blockedPeriodId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('organization_blocked_periods')
    .delete()
    .eq('organization_id', context.currentOrganization.id)
    .eq('id', validId)
    .select('id')
    .maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('not_found', 'Blocked period not found.');
}

export async function updateReceptionistSettings(
  input: ReceptionistSettingsInput
): Promise<BusinessReceptionistSettings> {
  const context = await requireManageableOrganization();
  const values = parseDomain(receptionistSettingsSchema, input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('organization_receptionist_settings')
    .upsert(
      {
        organization_id: context.currentOrganization.id,
        instructions: values.instructions ?? null,
        faq: values.faq ?? null,
      },
      { onConflict: 'organization_id' }
    )
    .select('instructions, faq')
    .maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('forbidden', 'Receptionist settings could not be updated.');
  return { instructions: data.instructions, faq: data.faq };
}

export async function updateWhatsAppMetadata(
  configId: string,
  input: WhatsAppMetadataInput
): Promise<BusinessWhatsAppConfig> {
  const context = await requireManageableOrganization();
  const validId = parseDomain(idSchema, configId);
  const values = parseDomain(whatsAppMetadataSchema, input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('organization_whatsapp_configs')
    .update({
      phone_number_id: values.phoneNumberId,
      business_account_id: values.businessAccountId,
      display_phone_number: values.displayPhoneNumber ?? null,
      is_active: values.isActive,
    })
    .eq('organization_id', context.currentOrganization.id)
    .eq('id', validId)
    .select('id, provider, phone_number_id, business_account_id, display_phone_number, is_active')
    .maybeSingle();
  if (error) throw mapDomainDatabaseError(error);
  if (!data) throw new DomainError('not_found', 'WhatsApp configuration not found.');
  return {
    id: data.id,
    provider: data.provider,
    phoneNumberId: data.phone_number_id,
    businessAccountId: data.business_account_id,
    displayPhoneNumber: data.display_phone_number,
    isActive: data.is_active,
  };
}
