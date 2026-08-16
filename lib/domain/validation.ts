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

const appointmentFields = z.object({
  contactId: uuid,
  conversationId: uuid.nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).default('pending'),
  notes: z.string().trim().max(5000, 'Notes are too long.').nullable().optional(),
});

export const appointmentCreateSchema = appointmentFields.refine(
  (value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(),
  { message: 'Appointment end must be later than its start.', path: ['endsAt'] }
);

export const appointmentUpdateSchema = appointmentFields.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one appointment field is required.'
).superRefine((value, context) => {
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: 'custom', message: 'Appointment end must be later than its start.', path: ['endsAt'] });
  }
});

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
export type ConversationCreateInput = z.infer<typeof conversationCreateSchema>;
export type ConversationStatusInput = z.infer<typeof conversationStatusSchema>;
export type MessageCreateInput = z.infer<typeof messageCreateSchema>;
export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;
export type AppointmentUpdateInput = z.infer<typeof appointmentUpdateSchema>;

export function parseDomain<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DomainError('invalid_input', result.error.issues[0]?.message ?? 'Invalid input.');
  }
  return result.data;
}
