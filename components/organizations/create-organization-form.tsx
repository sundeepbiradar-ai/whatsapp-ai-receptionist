"use client";

import { useFormState, useFormStatus } from "react-dom";

import { createOrganizationAction } from "@/lib/auth/actions";
import type { AuthActionState } from "@/lib/auth/validation";

function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <button className="button-primary w-full" disabled={pending} type="submit">
      {pending ? "Creating..." : "Create organization"}
    </button>
  );
}

export function CreateOrganizationForm(): React.ReactElement {
  const [state, action] = useFormState<AuthActionState, FormData>(createOrganizationAction, {});

  return (
    <form action={action} className="space-y-5" noValidate>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="organization-name">
          Organization name
        </label>
        <input
          autoComplete="organization"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          id="organization-name"
          maxLength={200}
          name="name"
          required
          type="text"
        />
      </div>
      {state.error && (
        <p aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
