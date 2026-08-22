import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { hasPasswordRecoverySession } from "@/lib/auth/recovery";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ResetPasswordPageProps = {
  searchParams?: { error?: string | string[] | undefined };
};

export const metadata: Metadata = {
  title: "Reset password - AI Customer Operations Platform",
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps): Promise<React.ReactElement> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  const hasRecovery = user ? await hasPasswordRecoverySession(user.id) : false;

  const invalidRecoveryState =
    searchParams?.error === "invalid" ||
    searchParams?.error === "expired" ||
    Boolean(searchParams?.error) ||
    Boolean(error) ||
    !user ||
    !hasRecovery;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <section className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary-700">
            AI Customer Ops
          </p>
          <h1 className="text-3xl font-bold text-gray-900">
            {invalidRecoveryState ? "Password reset unavailable" : "Set new password"}
          </h1>
          <p className="mt-2 text-gray-600">
            {invalidRecoveryState
              ? "This password reset link is invalid or has expired. Request a new reset email to continue."
              : "Choose a new secure password for your account."}
          </p>
        </div>

        {invalidRecoveryState ? (
          <div className="space-y-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
            <p>We couldn’t verify this password reset link.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link className="button-secondary w-full" href="/forgot-password">
                Request another email
              </Link>
              <Link className="button-secondary w-full" href="/login">
                Back to sign in
              </Link>
            </div>
          </div>
        ) : (
          <ResetPasswordForm />
        )}
      </section>
    </main>
  );
}
