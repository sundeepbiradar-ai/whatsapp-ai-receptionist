"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DomainError } from "@/lib/domain/errors";
import {
  contactCreateSchema,
  contactUpdateSchema,
  idSchema,
  parseDomain,
} from "@/lib/domain/validation";
import {
  createContact,
  deleteContact,
  updateContact,
} from "@/lib/domain/contacts/repository";

export type ContactActionState = {
  error?: string;
};

function getContactErrorMessage(error: unknown): string {
  if (error instanceof DomainError) {
    return error.message;
  }
  return "We could not complete that contact operation. Please try again.";
}

function getFormValues(formData: FormData): Record<string, FormDataEntryValue> {
  return {
    email: formData.get("email") ?? "",
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
  };
}

export async function createContactAction(
  _previousState: ContactActionState,
  formData: FormData
): Promise<ContactActionState> {
  let contactId: string | undefined;
  try {
    const input = parseDomain(contactCreateSchema, getFormValues(formData));
    const contact = await createContact(input);
    contactId = contact.id;
    revalidatePath("/dashboard/contacts");
  } catch (error) {
    return { error: getContactErrorMessage(error) };
  }
  redirect(`/dashboard/contacts/${contactId}`);
}

export async function updateContactAction(
  contactId: string,
  _previousState: ContactActionState,
  formData: FormData
): Promise<ContactActionState> {
  let updatedContactId: string | undefined;
  try {
    const validContactId = parseDomain(idSchema, contactId);
    const input = parseDomain(contactUpdateSchema, getFormValues(formData));
    const contact = await updateContact(validContactId, input);
    updatedContactId = contact.id;
    revalidatePath("/dashboard/contacts");
    revalidatePath(`/dashboard/contacts/${validContactId}`);
  } catch (error) {
    return { error: getContactErrorMessage(error) };
  }
  redirect(`/dashboard/contacts/${updatedContactId}`);
}

export async function deleteContactAction(contactId: string): Promise<void> {
  try {
    const validContactId = parseDomain(idSchema, contactId);
    await deleteContact(validContactId);
    revalidatePath("/dashboard/contacts");
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") {
      redirect("/dashboard/contacts?error=not-found");
    }
    throw error;
  }
  redirect("/dashboard/contacts");
}
