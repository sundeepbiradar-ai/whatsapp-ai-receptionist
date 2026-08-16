"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getAuthErrorMessage,
  getAuthFormValues,
  type AuthActionState,
} from "@/lib/auth/validation";

function getSiteUrl(): string {
  return process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";
}

export async function signupAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  let sessionCreated = false;

  try {
    const { email, password } = getAuthFormValues(formData);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      },
    });

    if (error) {
      return { error: "We could not create your account. Please try again." };
    }

    sessionCreated = Boolean(data.session);
  } catch (error) {
    return { error: getAuthErrorMessage(error) };
  }

  if (sessionCreated) {
    redirect("/dashboard");
  }

  return { message: "Check your email to confirm your account." };
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  try {
    const { email, password } = getAuthFormValues(formData);
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return { error: "Invalid email or password." };
    }

  } catch (error) {
    return { error: getAuthErrorMessage(error) };
  }

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
