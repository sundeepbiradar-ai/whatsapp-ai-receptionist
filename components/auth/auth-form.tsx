"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import type { AuthActionState } from "@/lib/auth/validation";

type AuthFormProps = {
  mode: "login" | "signup";
  action: (
    previousState: AuthActionState,
    formData: FormData
  ) => Promise<AuthActionState>;
};

const initialState: AuthActionState = {};

function SubmitButton({ mode }: { mode: AuthFormProps["mode"] }): React.ReactElement {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary w-full" type="submit" disabled={pending}>
      {pending ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
    </button>
  );
}

export function AuthForm({ mode, action }: AuthFormProps): React.ReactElement {
  const [state, formAction] = useFormState(action, initialState);
  const isLogin = mode === "login";

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

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="block text-sm font-medium text-gray-900" htmlFor="password">
            Password
          </label>
          {isLogin && (
            <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/forgot-password">
              Forgot password?
            </Link>
          )}
        </div>
        <input
          autoComplete={isLogin ? "current-password" : "new-password"}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
        {!isLogin && <p className="mt-1 text-xs text-gray-500">Use at least 8 characters.</p>}
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

      <SubmitButton mode={mode} />

      <p className="text-center text-sm text-gray-600">
        {isLogin ? "Need an account? " : "Already have an account? "}
        <Link className="font-medium text-primary-700 hover:text-primary-800" href={isLogin ? "/signup" : "/login"}>
          {isLogin ? "Sign up" : "Log in"}
        </Link>
      </p>
    </form>
  );
}
