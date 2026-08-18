import { DomainError } from '@/lib/domain/errors';

export const schedulingWeekdays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type SchedulingWeekday = (typeof schedulingWeekdays)[number];
export type BusinessHoursInterval = { start: string; end: string };
export type BusinessHours = Partial<Record<SchedulingWeekday, BusinessHoursInterval | null>>;
export type SchedulingSettings = {
  timezone: string;
  working_days: SchedulingWeekday[];
  business_hours: BusinessHours;
  default_duration_minutes: number;
};

type SchedulingSettingsInput = {
  timezone: unknown;
  working_days: unknown;
  business_hours: unknown;
  default_duration_minutes: unknown;
};

type LocalTime = { date: string; weekday: SchedulingWeekday; minutes: number };

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function localParts(timestamp: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values['year']}-${values['month']}-${values['day']}T${values['hour']}:${values['minute']}:${values['second']}`;
}

export function localDateTimeToUtc(value: string, timezone: string): string {
  assertValidTimezone(timezone);
  const match = localDateTimePattern.exec(value);
  if (!match) {
    throw new DomainError('appointment_local_time_invalid', 'Appointment local time must use YYYY-MM-DDTHH:mm format.');
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '00'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  if (new Date(naive).toISOString().slice(0, 19) !== `${value.length === 16 ? `${value}:00` : value}`) {
    throw new DomainError('appointment_local_time_invalid', 'Appointment local time is invalid.');
  }

  const matches: number[] = [];
  const searchStart = naive - 36 * 60 * 60 * 1000;
  const searchEnd = naive + 36 * 60 * 60 * 1000;
  const requested = `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}`;
  for (let candidate = searchStart; candidate <= searchEnd; candidate += 60 * 1000) {
    if (localParts(new Date(candidate), timezone) === requested) matches.push(candidate);
  }
  if (matches.length === 0) {
    throw new DomainError('appointment_local_time_invalid', 'Appointment local time does not exist in the organization timezone.');
  }
  if (matches.length > 1) {
    throw new DomainError('appointment_local_time_ambiguous', 'Appointment local time is ambiguous in the organization timezone.');
  }
  return new Date(matches[0] as number).toISOString();
}

export function formatInTimezone(timestamp: string, timezone: string): string {
  assertValidTimezone(timezone);
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new DomainError('appointment_scheduling_input_invalid', 'Invalid scheduling timestamp.');
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatLocalDateTimeInput(timestamp: string, timezone: string): string {
  assertValidTimezone(timezone);
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new DomainError('appointment_scheduling_input_invalid', 'Invalid scheduling timestamp.');
  }
  return localParts(date, timezone).slice(0, 16);
}

function isWeekday(value: unknown): value is SchedulingWeekday {
  return typeof value === 'string' && (schedulingWeekdays as readonly string[]).includes(value);
}

function parseMinute(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) return null;
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function assertValidTimezone(timezone: unknown): asserts timezone is string {
  if (typeof timezone !== 'string' || timezone.trim().length === 0) {
    throw new DomainError('appointment_timezone_invalid', 'A valid IANA timezone is required.');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new DomainError('appointment_timezone_invalid', 'A valid IANA timezone is required.');
  }
}

export function parseSchedulingSettings(input: SchedulingSettingsInput): SchedulingSettings {
  assertValidTimezone(input.timezone);
  if (!Array.isArray(input.working_days) || input.working_days.some((day) => !isWeekday(day))) {
    throw new DomainError('scheduling_configuration_invalid', 'Working days are invalid.');
  }
  const workingDays = input.working_days as SchedulingWeekday[];
  if (new Set(workingDays).size !== workingDays.length) {
    throw new DomainError('scheduling_configuration_invalid', 'Working days must be unique.');
  }
  if (!input.business_hours || typeof input.business_hours !== 'object' || Array.isArray(input.business_hours)) {
    throw new DomainError('scheduling_configuration_invalid', 'Business hours are invalid.');
  }
  const businessHours = input.business_hours as Record<string, unknown>;
  const parsedHours: BusinessHours = {};
  for (const day of schedulingWeekdays) {
    const value = businessHours[day];
    if (!workingDays.includes(day)) {
      if (value !== undefined && value !== null) {
        throw new DomainError('scheduling_configuration_invalid', 'Disabled days cannot have business hours.');
      }
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new DomainError('scheduling_configuration_invalid', 'Enabled days require one business-hours interval.');
    }
    const interval = value as Record<string, unknown>;
    const start = parseMinute(interval['start']);
    const end = parseMinute(interval['end']);
    if (start === null || end === null || start >= end || Object.keys(interval).length !== 2) {
      throw new DomainError('scheduling_configuration_invalid', 'Business-hours intervals must be minute-precise and non-overnight.');
    }
    parsedHours[day] = { start: interval['start'] as string, end: interval['end'] as string };
  }
  if (typeof input.default_duration_minutes !== 'number' || !Number.isInteger(input.default_duration_minutes) || input.default_duration_minutes < 1 || input.default_duration_minutes > 1440) {
    throw new DomainError('scheduling_configuration_invalid', 'Default appointment duration must be between 1 and 1440 minutes.');
  }
  return {
    timezone: input.timezone,
    working_days: workingDays,
    business_hours: parsedHours,
    default_duration_minutes: input.default_duration_minutes,
  };
}

function localTime(timestamp: string, timezone: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayValue = values['weekday'];
  const year = values['year'];
  const month = values['month'];
  const day = values['day'];
  const hour = values['hour'];
  const minute = values['minute'];
  if (!weekdayValue || !year || !month || !day || !hour || !minute) {
    throw new DomainError('appointment_scheduling_input_invalid', 'Invalid scheduling timestamp.');
  }
  const weekday = weekdayValue.toLowerCase() as SchedulingWeekday;
  return {
    date: `${year}-${month}-${day}`,
    weekday,
    minutes: Number(hour) * 60 + Number(minute),
  };
}

export function assertWithinBusinessHours(settings: SchedulingSettings, startsAt: string, endsAt: string): void {
  const start = localTime(startsAt, settings.timezone);
  const end = localTime(endsAt, settings.timezone);
  const interval = settings.business_hours[start.weekday];
  if (start.date !== end.date || !interval || !settings.working_days.includes(start.weekday)) {
    throw new DomainError('appointment_outside_business_hours', 'The appointment is outside business hours.');
  }
  const startMinutes = parseMinute(interval.start);
  const endMinutes = parseMinute(interval.end);
  if (startMinutes === null || endMinutes === null || start.minutes < startMinutes || end.minutes > endMinutes) {
    throw new DomainError('appointment_outside_business_hours', 'The appointment is outside business hours.');
  }
}

export function intervalsConflict(
  requestedStartsAt: string,
  requestedEndsAt: string,
  existingStartsAt: string,
  existingEndsAt: string,
): boolean {
  return new Date(requestedStartsAt).getTime() < new Date(existingEndsAt).getTime()
    && new Date(requestedEndsAt).getTime() > new Date(existingStartsAt).getTime();
}
