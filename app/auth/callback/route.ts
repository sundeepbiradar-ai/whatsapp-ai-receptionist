import { NextResponse, type NextRequest } from "next/server";

import { getExchangeRedirectType, setPasswordRecoverySession } from "@/lib/auth/recovery";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // The `type` param only picks a friendlier error page below; it must never
  // be used to decide whether this is a recovery flow. That decision comes
  // solely from Supabase's own redirectType, verified after code exchange.
  const isRecoveryAttempt = request.nextUrl.searchParams.get("type") === "recovery";
  const code = request.nextUrl.searchParams.get("code");
  const invalidRedirectUrl = new URL(
    isRecoveryAttempt ? "/reset-password?error=invalid" : "/login?error=callback",
    request.url
  );

  if (!code) {
    return NextResponse.redirect(invalidRedirectUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(invalidRedirectUrl);
  }

  if (getExchangeRedirectType(data) === "recovery") {
    await setPasswordRecoverySession(data.user.id);
    return NextResponse.redirect(new URL("/reset-password", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
