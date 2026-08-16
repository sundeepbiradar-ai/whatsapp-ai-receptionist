"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getOrganizationValues,
  getAuthErrorMessage,
  getAuthFormValues,
  type AuthActionState,
} from "@/lib/auth/validation";
import type { Database } from "@/lib/supabase/database";

const organizationIdSchema = z.string().uuid("Select a valid organization.");
const currentOrganizationCookie = "current-organization-id";

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

export async function createOrganizationAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  try {
    const { name, slug } = getOrganizationValues(formData);
    const supabase = await createServerSupabaseClient();
    const rpcResult = await supabase.rpc("create_organization", {
      organization_name: name,
      organization_slug: slug,
    } as never);
    const data = rpcResult.data as Database["public"]["Tables"]["organizations"]["Row"] | null;
    const error = rpcResult.error;

    if (error || !data) {
      if (error?.code === "23505") {
        return { error: "That organization name is already in use. Try a different name." };
      }
      return { error: "We could not create your organization. Please try again." };
    }

    const cookieStore = await cookies();
    cookieStore.set(currentOrganizationCookie, data.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      path: "/",
    });
  } catch (error) {
    return { error: getAuthErrorMessage(error) };
  }

  redirect("/dashboard");
}

export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const organizationId = organizationIdSchema.parse(formData.get("organizationId"));
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !membership) {
    redirect("/dashboard?error=organization");
  }

  const cookieStore = await cookies();
  cookieStore.set(currentOrganizationCookie, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
  });
  redirect("/dashboard");
}
