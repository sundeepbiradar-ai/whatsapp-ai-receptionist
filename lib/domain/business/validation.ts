import { z } from 'zod';

import { schedulingWeekdays } from '@/lib/domain/appointments/scheduling';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

export const businessProfileSchema = z.object({
  name: z.string().trim().min(1, 'Business name is required.').max(200, 'Business name is too long.'),
  description: optionalText(2000),
  publicEmail: optionalText(320),
  publicPhone: optionalText(50),
  address: optionalText(500),
});

const timeOfDay = z
  .string()
  .regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/, 'Business hours must use minute-precise HH:mm values.');

const businessHoursInterval = z
  .object({ start: timeOfDay, end: timeOfDay })
  .strict()
  .refine((value) => value.start < value.end, {
    message: 'Business hours must end after they start and may not run overnight.',
  });

const optionalInterval = businessHoursInterval.nullable().optional();

const businessHoursSchema = z
  .object({
    monday: optionalInterval,
    tuesday: optionalInterval,
    wednesday: optionalInterval,
    thursday: optionalInterval,
    friday: optionalInterval,
    saturday: optionalInterval,
    sunday: optionalInterval,
  })
  .strict();

export const schedulingSettingsSchema = z
  .object({
    timezone: z.string().trim().min(1, 'A valid IANA timezone is required.').max(100),
    workingDays: z
      .array(z.enum(schedulingWeekdays))
      .min(1, 'At least one working day is required.')
      .refine((days) => new Set(days).size === days.length, 'Working days must be unique.'),
    businessHours: businessHoursSchema,
    defaultDurationMinutes: z
      .number()
      .int('Default duration must be a whole number of minutes.')
      .min(1, 'Default duration must be at least 1 minute.')
      .max(1440, 'Default duration may not exceed 1440 minutes.'),
  })
  .superRefine((value, context) => {
    for (const day of schedulingWeekdays) {
      const enabled = value.workingDays.includes(day);
      const interval = value.businessHours[day];
      if (enabled && !interval) {
        context.addIssue({
          code: 'custom',
          path: ['businessHours', day],
          message: 'Each working day requires exactly one business-hours interval.',
        });
      }
      if (!enabled && interval) {
        context.addIssue({
          code: 'custom',
          path: ['businessHours', day],
          message: 'Days that are not working days may not have business hours.',
        });
      }
    }
  });

export const blockedPeriodSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    reason: optionalText(500),
  })
  .refine((value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(), {
    message: 'A blocked period must end after it starts.',
    path: ['endsAt'],
  });

export const receptionistSettingsSchema = z.object({
  instructions: optionalText(4000),
  faq: optionalText(4000),
});

export const whatsAppMetadataSchema = z
  .object({
    phoneNumberId: z.string().trim().min(1, 'A WhatsApp phone number ID is required.').max(100),
    businessAccountId: z.string().trim().min(1, 'A WhatsApp business account ID is required.').max(100),
    displayPhoneNumber: optionalText(50),
    isActive: z.boolean(),
  })
  .strict();

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
export type SchedulingSettingsInput = z.infer<typeof schedulingSettingsSchema>;
export type BlockedPeriodInput = z.infer<typeof blockedPeriodSchema>;
export type ReceptionistSettingsInput = z.infer<typeof receptionistSettingsSchema>;
export type WhatsAppMetadataInput = z.infer<typeof whatsAppMetadataSchema>;
