"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DomainError } from "@/lib/domain/errors";
import { updateConversationStatus } from "@/lib/domain/conversations/repository";
import { conversationStatusSchema, idSchema, parseDomain } from "@/lib/domain/validation";

export type ConversationActionState = {
  error?: string;
};

function getConversationErrorMessage(error: unknown): string {
  if (error instanceof DomainError) {
    return error.message;
  }
  return "We could not update that conversation. Please try again.";
}

export async function updateConversationStatusAction(
  conversationId: string,
  _previousState: ConversationActionState,
  formData: FormData
): Promise<ConversationActionState> {
  try {
    const validConversationId = parseDomain(idSchema, conversationId);
    const input = parseDomain(conversationStatusSchema, {
      status: formData.get("status"),
    });
    await updateConversationStatus(validConversationId, input);
    revalidatePath("/dashboard/conversations");
    revalidatePath(`/dashboard/conversations/${validConversationId}`);
  } catch (error) {
    return { error: getConversationErrorMessage(error) };
  }

  redirect(`/dashboard/conversations/${conversationId}`);
}
