"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DomainError } from "@/lib/domain/errors";
import {
  bookAppointment,
  getAppointment,
  rescheduleAppointment,
  updateAppointment,
} from "@/lib/domain/appointments/repository";
import {
  appointmentStatusSchema,
  idSchema,
  parseAppointmentCreate,
  parseAppointmentUpdate,
  parseDomain,
} from "@/lib/domain/validation";

export type AppointmentActionState = { error?: string };

function errorMessage(error: unknown): string {
  return error instanceof DomainError
    ? error.message
    : "We could not complete that appointment operation. Please try again.";
}

function getAppointmentValues(formData: FormData): Record<string, string | null> {
  return {
    contactId: String(formData.get("contactId") ?? ""),
    conversationId: formData.get("conversationId") ? String(formData.get("conversationId")) : null,
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    status: String(formData.get("status") ?? "pending"),
    notes: formData.get("notes") ? String(formData.get("notes")) : null,
  };
}

function normalizeDateTime(value: string | null): string {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString();
}

function normalizedValues(formData: FormData): Record<string, FormDataEntryValue> {
  const values = getAppointmentValues(formData);
  return {
    ...values,
    startsAt: normalizeDateTime(values["startsAt"] ?? null),
    endsAt: normalizeDateTime(values["endsAt"] ?? null),
  };
}

export async function createAppointmentAction(
  _previousState: AppointmentActionState,
  formData: FormData
): Promise<AppointmentActionState> {
  let appointmentId: string | undefined;
  try {
    const input = parseAppointmentCreate(normalizedValues(formData));
    const appointment = await bookAppointment(input);
    appointmentId = appointment.id;
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/appointments");
  } catch (error) {
    return { error: errorMessage(error) };
  }

  if (!appointmentId) {
    return { error: "We could not complete that appointment operation. Please try again." };
  }

  redirect(`/dashboard/appointments/${appointmentId}`);
}

export async function updateAppointmentAction(
  appointmentId: string,
  _previousState: AppointmentActionState,
  formData: FormData
): Promise<AppointmentActionState> {
  try {
    const validId = parseDomain(idSchema, appointmentId);
    const input = parseAppointmentUpdate(normalizedValues(formData));
    const current = await getAppointment(validId);
    const startsAt = input.startsAt ?? current.starts_at;
    const endsAt = input.endsAt ?? current.ends_at;
    const scheduleChanged =
      new Date(startsAt).getTime() !== new Date(current.starts_at).getTime() ||
      new Date(endsAt).getTime() !== new Date(current.ends_at).getTime();
    if (scheduleChanged) {
      await rescheduleAppointment(validId, { startsAt, endsAt });
    }
    const remainingInput = {
      contactId: input.contactId,
      conversationId: input.conversationId,
      status: input.status,
      notes: input.notes,
    };
    if (Object.keys(remainingInput).length > 0) {
      await updateAppointment(validId, remainingInput);
    }
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/appointments");
    revalidatePath(`/dashboard/appointments/${validId}`);
  } catch (error) {
    return { error: errorMessage(error) };
  }

  redirect(`/dashboard/appointments/${appointmentId}`);
}

export async function updateAppointmentStatusAction(
  appointmentId: string,
  _previousState: AppointmentActionState,
  formData: FormData
): Promise<AppointmentActionState> {
  try {
    const validId = parseDomain(idSchema, appointmentId);
    const status = parseDomain(appointmentStatusSchema, {
      status: formData.get("status"),
    });
    await updateAppointment(validId, status);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/appointments");
    revalidatePath(`/dashboard/appointments/${validId}`);
  } catch (error) {
    return { error: errorMessage(error) };
  }

  redirect(`/dashboard/appointments/${appointmentId}`);
}
