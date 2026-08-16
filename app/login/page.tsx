import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { loginAction } from "@/lib/auth/actions";

export const metadata: Metadata = {
  title: "Log in - AI Customer Operations Platform",
};

export default function LoginPage(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <section className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary-700">
            AI Customer Ops
          </p>
          <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
          <p className="mt-2 text-gray-600">Log in to access your dashboard.</p>
        </div>
        <AuthForm action={loginAction} mode="login" />
      </section>
    </main>
  );
}
