import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { logoutAction } from "@/lib/auth/actions";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard - AI Customer Operations Platform",
  description: "Application dashboard",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage(): Promise<React.ReactElement> {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex max-w-4xl items-start justify-between gap-6">
          <div>
            <h1 className="mb-4 text-4xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-lg text-gray-600">Welcome back, {user.email ?? "authenticated user"}.</p>
            <p className="mt-2 text-sm text-gray-500">
              Organization access will be available in a future milestone.
            </p>
          </div>
          <form action={logoutAction}>
            <button className="button-secondary whitespace-nowrap" type="submit">
              Log out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
