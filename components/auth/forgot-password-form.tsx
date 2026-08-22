"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { requestPasswordResetAction } from "@/lib/auth/actions";
import type { AuthActionState } from "@/lib/auth/validation";

const initialState: AuthActionState = {};

function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
      {pending ? "Sending..." : "Send reset instructions"}
    </button>
  );
}

export function ForgotPasswordForm(): React.ReactElement {
  const [state, formAction] = useFormState(requestPasswordResetAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="email">
          Email address
        </label>
        <input
          autoComplete="email"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>

      {state.error && (
        <p aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p aria-live="polite" className="rounded-md bg-green-50 p-3 text-sm text-green-700" role="status">
          {state.message}
        </p>
      )}

      <SubmitButton />

      <p className="text-center text-sm text-gray-600">
        <Link className="font-medium text-primary-700 hover:text-primary-800" href="/login">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
