'use server';

import { revalidatePath } from 'next/cache';

import {
  createBlockedPeriodEntry,
  deleteBlockedPeriodEntry,
  updateBusinessProfile,
  updateReceptionistSettings,
  updateSchedulingConfiguration,
} from '@/lib/domain/business/repository';
import { schedulingWeekdays } from '@/lib/domain/appointments/scheduling';
import { DomainError } from '@/lib/domain/errors';

export type BusinessSettingsState = { error?: string; success?: string };

const settingsPath = '/dashboard/settings';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof DomainError ? error.message : fallback;
}

function optional(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function updateBusinessProfileAction(
  _previousState: BusinessSettingsState,
  formData: FormData
): Promise<BusinessSettingsState> {
  try {
    await updateBusinessProfile({
      name: String(formData.get('name') ?? ''),
      description: optional(formData, 'description'),
      publicEmail: optional(formData, 'publicEmail'),
      publicPhone: optional(formData, 'publicPhone'),
      address: optional(formData, 'address'),
    });
  } catch (error) {
    return { error: errorMessage(error, 'We could not update the business profile.') };
  }
  revalidatePath(settingsPath);
  return { success: 'Business profile updated.' };
}

export async function updateSchedulingSettingsAction(
  _previousState: BusinessSettingsState,
  formData: FormData
): Promise<BusinessSettingsState> {
  try {
    const workingDays = schedulingWeekdays.filter((day) => formData.get(`day-${day}`) === 'on');
    const businessHours: Partial<Record<(typeof schedulingWeekdays)[number], { start: string; end: string }>> = {};
    for (const day of workingDays) {
      businessHours[day] = {
        start: String(formData.get(`start-${day}`) ?? ''),
        end: String(formData.get(`end-${day}`) ?? ''),
      };
    }
    await updateSchedulingConfiguration({
      timezone: String(formData.get('timezone') ?? ''),
      workingDays,
      businessHours,
      defaultDurationMinutes: Number(formData.get('defaultDurationMinutes') ?? Number.NaN),
    });
  } catch (error) {
    return { error: errorMessage(error, 'We could not update scheduling settings.') };
  }
  revalidatePath(settingsPath);
  return { success: 'Scheduling settings updated.' };
}

export async function createBlockedPeriodAction(
  _previousState: BusinessSettingsState,
  formData: FormData
): Promise<BusinessSettingsState> {
  try {
    await createBlockedPeriodEntry({
      startsAt: String(formData.get('startsAt') ?? ''),
      endsAt: String(formData.get('endsAt') ?? ''),
      reason: optional(formData, 'reason'),
    });
  } catch (error) {
    return { error: errorMessage(error, 'We could not create that blocked period.') };
  }
  revalidatePath(settingsPath);
  return { success: 'Blocked period created.' };
}

export async function deleteBlockedPeriodAction(
  _previousState: BusinessSettingsState,
  formData: FormData
): Promise<BusinessSettingsState> {
  try {
    await deleteBlockedPeriodEntry(String(formData.get('blockedPeriodId') ?? ''));
  } catch (error) {
    return { error: errorMessage(error, 'We could not delete that blocked period.') };
  }
  revalidatePath(settingsPath);
  return { success: 'Blocked period removed.' };
}

export async function updateReceptionistSettingsAction(
  _previousState: BusinessSettingsState,
  formData: FormData
): Promise<BusinessSettingsState> {
  try {
    await updateReceptionistSettings({
      instructions: optional(formData, 'instructions'),
      faq: optional(formData, 'faq'),
    });
  } catch (error) {
    return { error: errorMessage(error, 'We could not update receptionist settings.') };
  }
  revalidatePath(settingsPath);
  return { success: 'Receptionist settings updated.' };
}
