"use client";

import { useFormState, useFormStatus } from "react-dom";

import type { ConversationActionState } from "@/lib/domain/conversations/actions";

type StatusFormProps = {
  action: (
    previousState: ConversationActionState,
    formData: FormData
  ) => Promise<ConversationActionState>;
  currentStatus: "open" | "closed";
};

function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <button className="button-secondary" disabled={pending} type="submit">
      {pending ? "Updating..." : "Update status"}
    </button>
  );
}

export function ConversationStatusForm({ action, currentStatus }: StatusFormProps): React.ReactElement {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="conversation-status">
          Status
        </label>
        <select
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          defaultValue={currentStatus}
          id="conversation-status"
          name="status"
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <SubmitButton />
      {state.error && (
        <p aria-live="polite" className="basis-full rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
