"use client";

import { useFormState, useFormStatus } from "react-dom";

import type { BusinessSettingsState } from "@/lib/domain/business/actions";

type Action = (
  state: BusinessSettingsState,
  formData: FormData
) => Promise<BusinessSettingsState>;

function SubmitButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function SettingsForm({
  action,
  children,
  submitLabel,
  readOnly,
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel: string;
  readOnly: boolean;
}) {
  const [state, formAction] = useFormState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <fieldset disabled={readOnly} className="space-y-4">
        {children}
      </fieldset>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-green-700">
          {state.success}
        </p>
      ) : null}
      <SubmitButton label={submitLabel} disabled={readOnly} />
    </form>
  );
}
