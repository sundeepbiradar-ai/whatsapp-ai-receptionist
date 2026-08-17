import { describe, expect, it } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import {
  assertWithinBusinessHours,
  intervalsConflict,
  parseSchedulingSettings,
} from '@/lib/domain/appointments/scheduling';
import { parseSchedulingInterval } from '@/lib/domain/validation';

const weekdaySettings = {
  timezone: 'UTC',
  working_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  business_hours: {
    monday: { start: '09:00', end: '17:00' },
    tuesday: { start: '09:00', end: '17:00' },
    wednesday: { start: '09:00', end: '17:00' },
    thursday: { start: '09:00', end: '17:00' },
    friday: { start: '09:00', end: '17:00' },
  },
  default_duration_minutes: 30,
};

describe('appointment scheduling domain rules', () => {
  it('validates IANA timezone and scheduling JSON configuration', () => {
    expect(parseSchedulingSettings(weekdaySettings).timezone).toBe('UTC');
    expect(() => parseSchedulingSettings({ ...weekdaySettings, timezone: 'Not/A_Timezone' })).toThrowError(
      expect.objectContaining({ code: 'appointment_timezone_invalid' })
    );
    expect(() => parseSchedulingSettings({
      ...weekdaySettings,
      working_days: ['monday'],
      business_hours: { monday: { start: '17:00', end: '09:00' } },
    })).toThrowError(expect.objectContaining({ code: 'scheduling_configuration_invalid' }));
    expect(() => parseSchedulingSettings({
      ...weekdaySettings,
      working_days: ['monday'],
      business_hours: { monday: { start: '09:00', end: '17:00' }, tuesday: { start: '09:00', end: '17:00' } },
    })).toThrowError(expect.objectContaining({ code: 'scheduling_configuration_invalid' }));
  });

  it('validates interval duration, offset, and maximum length', () => {
    expect(parseSchedulingInterval({ startsAt: '2099-01-05T10:00:00Z', endsAt: '2099-01-05T10:30:00Z' })).toBeTruthy();
    expect(() => parseSchedulingInterval({ startsAt: '2099-01-05T10:00', endsAt: '2099-01-05T10:30' })).toThrowError(
      expect.objectContaining({ code: 'appointment_scheduling_input_invalid' })
    );
    expect(() => parseSchedulingInterval({ startsAt: '2099-01-05T10:30:00Z', endsAt: '2099-01-05T10:30:00Z' })).toThrowError(
      expect.objectContaining({ code: 'appointment_interval_invalid' })
    );
    expect(() => parseSchedulingInterval({ startsAt: '2099-01-05T10:00:00Z', endsAt: '2099-01-06T10:01:00Z' })).toThrowError(
      expect.objectContaining({ code: 'appointment_duration_invalid' })
    );
  });

  it('uses half-open interval conflict semantics', () => {
    expect(intervalsConflict('2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z', '2099-01-05T11:00:00Z', '2099-01-05T12:00:00Z')).toBe(false);
    expect(intervalsConflict('2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z', '2099-01-05T10:30:00Z', '2099-01-05T11:30:00Z')).toBe(true);
    expect(intervalsConflict('2099-01-05T10:00:00Z', '2099-01-05T12:00:00Z', '2099-01-05T10:30:00Z', '2099-01-05T11:00:00Z')).toBe(true);
    expect(intervalsConflict('2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z', '2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z')).toBe(true);
    expect(intervalsConflict('2099-01-05T10:30:00Z', '2099-01-05T11:30:00Z', '2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z')).toBe(true);
    expect(intervalsConflict('2099-01-05T09:30:00Z', '2099-01-05T10:30:00Z', '2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z')).toBe(true);
    expect(intervalsConflict('2099-01-05T09:00:00Z', '2099-01-05T12:00:00Z', '2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z')).toBe(true);
    expect(intervalsConflict('2099-01-05T09:00:00Z', '2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z', '2099-01-05T12:00:00Z')).toBe(false);
    expect(intervalsConflict('2099-01-05T12:00:00Z', '2099-01-05T13:00:00Z', '2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z')).toBe(false);
  });

  it('checks local business hours and timezone conversion', () => {
    const settings = parseSchedulingSettings({ ...weekdaySettings, timezone: 'America/New_York' });
    expect(() => assertWithinBusinessHours(settings, '2099-01-05T14:00:00Z', '2099-01-05T14:30:00Z')).not.toThrow();
    expect(() => assertWithinBusinessHours(settings, '2099-01-05T13:00:00Z', '2099-01-05T13:30:00Z')).toThrowError(
      expect.objectContaining({ code: 'appointment_outside_business_hours' })
    );
    expect(() => assertWithinBusinessHours(settings, '2099-01-10T14:00:00Z', '2099-01-10T14:30:00Z')).toThrowError(DomainError);
    expect(() => assertWithinBusinessHours(parseSchedulingSettings(weekdaySettings), '2099-01-05T09:00:00Z', '2099-01-05T09:30:00Z')).not.toThrow();
    expect(() => assertWithinBusinessHours(parseSchedulingSettings(weekdaySettings), '2099-01-05T16:30:00Z', '2099-01-05T17:00:00Z')).not.toThrow();
    expect(() => assertWithinBusinessHours(parseSchedulingSettings(weekdaySettings), '2099-01-05T08:59:00Z', '2099-01-05T09:30:00Z')).toThrowError(
      expect.objectContaining({ code: 'appointment_outside_business_hours' })
    );
    expect(() => assertWithinBusinessHours(parseSchedulingSettings(weekdaySettings), '2099-01-05T16:30:00Z', '2099-01-05T17:01:00Z')).toThrowError(
      expect.objectContaining({ code: 'appointment_outside_business_hours' })
    );
  });

  it('handles DST-aware local business hours', () => {
    const settings = parseSchedulingSettings({ ...weekdaySettings, timezone: 'America/New_York' });
    expect(() => assertWithinBusinessHours(settings, '2099-03-09T13:00:00Z', '2099-03-09T13:30:00Z')).not.toThrow();
    expect(() => assertWithinBusinessHours(settings, '2099-11-03T14:00:00Z', '2099-11-03T14:30:00Z')).not.toThrow();
  });
});
