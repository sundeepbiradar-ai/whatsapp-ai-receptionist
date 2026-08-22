import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { hasPasswordRecoverySession, passwordResetSuccessStatus } from "@/lib/auth/recovery";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ResetPasswordSearchParams = {
  error?: string | string[] | undefined;
  status?: string | string[] | undefined;
};

type ResetPasswordPageProps = {
  searchParams?: Promise<ResetPasswordSearchParams> | undefined;
};

export const metadata: Metadata = {
  title: "Reset password - AI Customer Operations Platform",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function ResetPasswordShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <section className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary-700">
            AI Customer Ops
          </p>
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          <p className="mt-2 text-gray-600">{description}</p>
        </div>
        {children}
      </section>
    </main>
  );
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps): Promise<React.ReactElement> {
  const params = (await searchParams) ?? {};
  const errorParam = firstValue(params.error);
  const statusParam = firstValue(params.status);

  // Checked before the recovery gate: the reset is already complete and its
  // authorization intentionally consumed, so this state must stay stable.
  if (statusParam === passwordResetSuccessStatus) {
    return (
      <ResetPasswordShell
        description="Your password has been changed successfully. Sign in with your new password."
        title="Password updated"
      >
        <div className="space-y-4 rounded-md bg-green-50 p-4 text-sm text-green-700" role="status">
          <p>You have been signed out of the password reset session.</p>
          <Link className="button-primary w-full" href="/login">
            Sign in
          </Link>
        </div>
      </ResetPasswordShell>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  const hasRecovery = user ? await hasPasswordRecoverySession(user.id) : false;

  const invalidRecoveryState = Boolean(errorParam) || Boolean(error) || !user || !hasRecovery;

  if (invalidRecoveryState) {
    return (
      <ResetPasswordShell
        description="This password reset link is invalid or has expired. Request a new reset email to continue."
        title="Password reset unavailable"
      >
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
      </ResetPasswordShell>
    );
  }

  return (
    <ResetPasswordShell
      description="Choose a new secure password for your account."
      title="Set new password"
    >
      <ResetPasswordForm />
    </ResetPasswordShell>
  );
}
