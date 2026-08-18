"use client";

import { useFormState, useFormStatus } from "react-dom";

import type { AppointmentActionState } from "@/lib/domain/appointments/actions";
import { formatLocalDateTimeInput } from "@/lib/domain/appointments/scheduling";

type Option = { id: string; label: string };
type AppointmentFormProps = {
  action: (previous: AppointmentActionState, formData: FormData) => Promise<AppointmentActionState>;
  contacts: Option[];
  conversations: Option[];
  timezone: string;
  appointment?: {
    contact_id: string;
    conversation_id: string | null;
    starts_at: string;
    ends_at: string;
    status: "pending" | "confirmed" | "cancelled" | "completed";
    notes: string | null;
  };
};

function localValue(value: string | null | undefined, timezone: string): string {
  if (!value) return "";
  return formatLocalDateTimeInput(value, timezone);
}

function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();
  return <button className="button-primary" disabled={pending} type="submit">{pending ? "Saving..." : "Save appointment"}</button>;
}

export function AppointmentForm({ action, contacts, conversations, timezone, appointment }: AppointmentFormProps): React.ReactElement {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="contactId">Contact</label>
        <select className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900" defaultValue={appointment?.contact_id ?? ""} id="contactId" name="contactId" required>
          <option value="">Select a contact</option>
          {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.label}</option>)}
        </select>
        {contacts.length === 0 && <p className="mt-2 text-sm text-gray-600">Create a contact before scheduling an appointment.</p>}
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="conversationId">Conversation (optional)</label>
        <select className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900" defaultValue={appointment?.conversation_id ?? ""} id="conversationId" name="conversationId">
          <option value="">No conversation</option>
          {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.label}</option>)}
        </select>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="startsAt">Starts</label>
          <input className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900" defaultValue={localValue(appointment?.starts_at, timezone)} id="startsAt" name="startsAt" required type="datetime-local" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="endsAt">Ends</label>
          <input className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900" defaultValue={localValue(appointment?.ends_at, timezone)} id="endsAt" name="endsAt" required type="datetime-local" />
        </div>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="status">Status</label>
        <select className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900" defaultValue={appointment?.status ?? "pending"} id="status" name="status">
          <option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option>
        </select>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="notes">Notes (optional)</label>
        <textarea className="block min-h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900" defaultValue={appointment?.notes ?? ""} id="notes" maxLength={5000} name="notes" />
      </div>
      {state.error && <p aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
