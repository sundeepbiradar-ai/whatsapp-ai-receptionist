"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DomainError } from "@/lib/domain/errors";
import {
  bookAppointment,
  cancelAppointment,
  getAppointment,
  rescheduleAppointment,
  updateAppointment,
  getSchedulingSettings,
} from "@/lib/domain/appointments/repository";
import { localDateTimeToUtc } from "@/lib/domain/appointments/scheduling";
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

function normalizeDateTime(value: string | null, timezone: string): string {
  if (!value) return "";
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return value;
  return localDateTimeToUtc(value, timezone);
}

function normalizedValues(formData: FormData, timezone: string): Record<string, FormDataEntryValue> {
  const values = getAppointmentValues(formData);
  return {
    ...values,
    startsAt: normalizeDateTime(values["startsAt"] ?? null, timezone),
    endsAt: normalizeDateTime(values["endsAt"] ?? null, timezone),
  };
}

export async function createAppointmentAction(
  _previousState: AppointmentActionState,
  formData: FormData
): Promise<AppointmentActionState> {
  let appointmentId: string | undefined;
  try {
    const settings = await getSchedulingSettings();
    const input = parseAppointmentCreate(normalizedValues(formData, settings.timezone));
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
    const settings = await getSchedulingSettings();
    const input = parseAppointmentUpdate(normalizedValues(formData, settings.timezone));
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
    if (input.status === 'cancelled') delete remainingInput.status;
    if (Object.keys(remainingInput).length > 0) {
      await updateAppointment(validId, remainingInput);
    }
    if (input.status === 'cancelled') {
      await cancelAppointment(validId);
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

export async function cancelAppointmentAction(
  appointmentId: string,
  _previousState: AppointmentActionState,
  _formData: FormData
): Promise<AppointmentActionState> {
  try {
    const validId = parseDomain(idSchema, appointmentId);
    await cancelAppointment(validId);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/appointments");
    revalidatePath(`/dashboard/appointments/${validId}`);
  } catch (error) {
    return { error: errorMessage(error) };
  }

  redirect(`/dashboard/appointments/${appointmentId}`);
}
