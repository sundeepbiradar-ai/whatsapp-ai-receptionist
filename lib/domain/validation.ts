import { z } from 'zod';

import { DomainError } from '@/lib/domain/errors';

export const idSchema = z.string().uuid('Expected a valid identifier.');
const uuid = idSchema;
const optionalEmail = z.string().trim().email('Enter a valid email address.').nullable().optional();

export const contactCreateSchema = z.object({
  phone: z.string().trim().min(1, 'Phone is required.').max(50, 'Phone is too long.'),
  name: z.string().trim().min(1, 'Name is required.').max(200, 'Name is too long.'),
  email: optionalEmail,
});

export const contactUpdateSchema = contactCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one contact field is required.'
);

export const conversationCreateSchema = z.object({
  contactId: uuid,
  status: z.enum(['open', 'closed']).default('open'),
});

export const conversationStatusSchema = z.object({
  status: z.enum(['open', 'closed']),
});

export const messageCreateSchema = z.object({
  conversationId: uuid,
  direction: z.enum(['inbound', 'outbound']),
  content: z.string().trim().min(1, 'Message content is required.'),
});

const appointmentStatusValues = ['pending', 'confirmed', 'cancelled', 'completed'] as const;
const appointmentStatusEnum = z.enum(appointmentStatusValues);

const appointmentFields = z.object({
  contactId: uuid,
  conversationId: uuid.nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  status: appointmentStatusEnum,
  notes: z.string().trim().max(5000, 'Notes are too long.').nullable().optional(),
});

export const appointmentCreateSchema = appointmentFields.extend({
  status: appointmentStatusEnum.default('pending'),
}).refine(
  (value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(),
  { message: 'Appointment end must be later than its start.', path: ['endsAt'] }
);

export const appointmentStatusSchema = z.object({
  status: appointmentStatusEnum,
});

export const appointmentUpdateSchema = appointmentFields.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one appointment field is required.'
).superRefine((value, context) => {
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: 'custom', message: 'Appointment end must be later than its start.', path: ['endsAt'] });
  }
});

export const schedulingIntervalSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
}).superRefine((value, context) => {
  const duration = new Date(value.endsAt).getTime() - new Date(value.startsAt).getTime();
  if (duration <= 0) {
    context.addIssue({ code: 'custom', message: 'Appointment interval must have a positive duration.', path: ['endsAt'] });
  } else if (duration > 24 * 60 * 60 * 1000) {
    context.addIssue({ code: 'custom', message: 'Appointment duration cannot exceed 24 hours.', path: ['endsAt'] });
  }
});

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
export type ConversationCreateInput = z.infer<typeof conversationCreateSchema>;
export type ConversationStatusInput = z.infer<typeof conversationStatusSchema>;
export type MessageCreateInput = z.infer<typeof messageCreateSchema>;
export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;
export type AppointmentStatusInput = z.infer<typeof appointmentStatusSchema>;
export type AppointmentUpdateInput = z.infer<typeof appointmentUpdateSchema>;
export type SchedulingIntervalInput = z.infer<typeof schedulingIntervalSchema>;

export type AppointmentStatus = (typeof appointmentStatusValues)[number];

function parseAppointment<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const timeIssue = result.error.issues.some(
      (issue) => issue.path[0] === 'endsAt' && issue.message === 'Appointment end must be later than its start.'
    );
    if (timeIssue) {
      throw new DomainError('appointment_time_invalid', 'Appointment end must be later than its start.');
    }
    throw new DomainError('invalid_input', result.error.issues[0]?.message ?? 'Invalid input.');
  }
  return result.data;
}

export function parseAppointmentCreate(input: unknown): AppointmentCreateInput {
  return parseAppointment(appointmentCreateSchema, input);
}

export function parseAppointmentUpdate(input: unknown): AppointmentUpdateInput {
  return parseAppointment(appointmentUpdateSchema, input);
}

export function parseSchedulingInterval(input: unknown): SchedulingIntervalInput {
  const result = schedulingIntervalSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    if (issue?.message === 'Appointment interval must have a positive duration.') {
      throw new DomainError('appointment_interval_invalid', issue.message);
    }
    if (issue?.message === 'Appointment duration cannot exceed 24 hours.') {
      throw new DomainError('appointment_duration_invalid', issue.message);
    }
    throw new DomainError('appointment_scheduling_input_invalid', issue?.message ?? 'Invalid scheduling input.');
  }
  return result.data;
}

export function parseAppointmentTimestamp(input: unknown): string {
  const result = z.string().datetime({ offset: true }).safeParse(input);
  if (!result.success) {
    throw new DomainError('invalid_input', 'Appointment date filters require an offset-aware timestamp.');
  }
  return result.data;
}

export function assertAppointmentTimeRange(startsAt: string, endsAt: string): void {
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new DomainError('appointment_time_invalid', 'Appointment end must be later than its start.');
  }
}

export function assertAppointmentContactConsistency(
  appointmentContactId: string,
  conversationContactId: string
): void {
  if (appointmentContactId !== conversationContactId) {
    throw new DomainError(
      'appointment_relationship_invalid',
      'The appointment conversation must belong to the appointment contact.'
    );
  }
}

export function assertAppointmentStartInFuture(startsAt: string, now = new Date()): void {
  if (new Date(startsAt).getTime() <= now.getTime()) {
    throw new DomainError('appointment_past', 'Appointment start time must be in the future.');
  }
}

const allowedAppointmentTransitions: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  cancelled: [],
  completed: [],
};

export function assertAppointmentStatusTransition(
  currentStatus: AppointmentStatus,
  nextStatus: AppointmentStatus
): void {
  if (currentStatus === nextStatus) return;

  if (!allowedAppointmentTransitions[currentStatus].includes(nextStatus)) {
    if (currentStatus === 'cancelled' || currentStatus === 'completed') {
      throw new DomainError(
        'appointment_terminal',
        'Cancelled and completed appointments cannot be changed.'
      );
    }
    throw new DomainError(
      'appointment_transition_invalid',
      `Appointment cannot change from ${currentStatus} to ${nextStatus}.`
    );
  }
}

type AppointmentPolicyState = {
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  contactId: string;
  conversationId: string | null;
};

export function assertAppointmentUpdatePolicy(
  current: AppointmentPolicyState,
  next: AppointmentPolicyState,
  now = new Date()
): void {
  if (current.status === 'cancelled' || current.status === 'completed') {
    throw new DomainError('appointment_terminal', 'Cancelled and completed appointments cannot be changed.');
  }

  assertAppointmentTimeRange(next.startsAt, next.endsAt);
  if (next.startsAt !== current.startsAt) {
    assertAppointmentStartInFuture(next.startsAt, now);
  }

  const appointmentHasStarted = new Date(current.startsAt).getTime() <= now.getTime();
  if (appointmentHasStarted && (
    next.startsAt !== current.startsAt ||
    next.endsAt !== current.endsAt ||
    next.contactId !== current.contactId ||
    next.conversationId !== current.conversationId
  )) {
    throw new DomainError(
      'appointment_past',
      'Started appointments cannot change their scheduled time, contact, or conversation.'
    );
  }

  if (next.status !== current.status) {
    assertAppointmentStatusTransition(current.status, next.status);
  }
}

export function parseDomain<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DomainError('invalid_input', result.error.issues[0]?.message ?? 'Invalid input.');
  }
  return result.data;
}
