import { cookies } from "next/headers";

/**
 * This cookie is only ever written by app/auth/callback/route.ts, and only
 * after Supabase's own PKCE code exchange reports `redirectType === "recovery"`
 * (see GoTrueClient#_exchangeCodeForSession). It is never derived from a URL
 * query parameter, which is client-controlled and cannot authorize anything.
 *
 * The value is the recovering user's id (not a bare boolean) so a stale or
 * copied cookie cannot be replayed against a different signed-in session.
 */
export const passwordRecoveryCookie = "password-recovery-session";
export const passwordRecoveryCookieMaxAge = 60 * 15;

/**
 * The recovery authorization is deliberately consumed as soon as the password
 * changes, so the success confirmation cannot live on the gated form render.
 * It is a fixed, app-controlled path (no caller-supplied redirect target) that
 * only renders a static confirmation and grants no authorization by itself.
 */
export const passwordResetSuccessStatus = "updated";
export const passwordResetSuccessPath = `/reset-password?status=${passwordResetSuccessStatus}`;

export const passwordRecoveryCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env["NODE_ENV"] === "production",
  path: "/",
  maxAge: passwordRecoveryCookieMaxAge,
};

export async function hasPasswordRecoverySession(userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(passwordRecoveryCookie)?.value;
  return Boolean(value) && value === userId;
}

export async function setPasswordRecoverySession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(passwordRecoveryCookie, userId, passwordRecoveryCookieOptions);
}

export async function clearPasswordRecoverySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(passwordRecoveryCookie, "", { ...passwordRecoveryCookieOptions, maxAge: 0 });
}

/**
 * auth-js returns `redirectType: "recovery"` at runtime from
 * exchangeCodeForSession() for PKCE codes that originated from
 * resetPasswordForEmail(), but this field is not part of the installed
 * version's public AuthTokenResponse type. This guard is the single place
 * that reaches into that unstable shape; everything else only sees the
 * narrowed "recovery" | null result. Anything other than the exact literal
 * "recovery" (missing field, wrong type, unexpected value) fails closed.
 */
export function getExchangeRedirectType(data: unknown): "recovery" | null {
  if (typeof data !== "object" || data === null || !("redirectType" in data)) {
    return null;
  }

  const { redirectType } = data as { redirectType: unknown };
  return redirectType === "recovery" ? "recovery" : null;
}
