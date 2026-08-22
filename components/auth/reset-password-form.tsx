"use client";

import { useFormState, useFormStatus } from "react-dom";

import { updatePasswordAction } from "@/lib/auth/actions";
import type { AuthActionState } from "@/lib/auth/validation";

const initialState: AuthActionState = {};

function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
      {pending ? "Updating..." : "Update password"}
    </button>
  );
}

export function ResetPasswordForm(): React.ReactElement {
  const [state, formAction] = useFormState(updatePasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="password">
          New password
        </label>
        <input
          autoComplete="new-password"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="confirmPassword">
          Confirm new password
        </label>
        <input
          autoComplete="new-password"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          id="confirmPassword"
          minLength={8}
          name="confirmPassword"
          required
          type="password"
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
