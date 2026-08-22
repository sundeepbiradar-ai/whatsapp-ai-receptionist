"use client";

import Link from "next/link";
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
      {state.message && (
        <div aria-live="polite" className="space-y-3 rounded-md bg-green-50 p-3 text-sm text-green-700" role="status">
          <p>{state.message}</p>
          <Link className="font-medium text-primary-700 hover:text-primary-800" href="/login">
            Back to sign in
          </Link>
        </div>
      )}

      {!state.message && <SubmitButton />}
    </form>
  );
}
