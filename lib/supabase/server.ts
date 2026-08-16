/**
 * Server-side Supabase Client
 * 
 * IMPORTANT: This client uses only the public anon key.
 * It uses server-side session context to maintain authentication state.
 * 
 * Usage: Use in server components and server actions
 * Security: Session context is automatically managed via cookies
 */

import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database";

/**
 * Create a server-side Supabase client
 * Must be called in a Server Component or Server Action
 * Automatically manages session via cookies
 */
type TypedServerSupabaseClient = SupabaseClient<Database, "public", "public", Database["public"]>;

export async function createServerSupabaseClient(): Promise<TypedServerSupabaseClient> {
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseAnonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set."
    );
  }

  const cookieStore = await cookies();

  // @supabase/ssr 0.1.0 passes its schema generic in the older SupabaseClient
  // position; the runtime client is the same and this preserves the approved
  // generated public schema for typed repository operations.
  return createServerClient<Database>(
    supabaseUrl as string,
    supabaseAnonKey as string,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set(name, "", { ...options, maxAge: 0 });
        },
      },
    }
  ) as unknown as TypedServerSupabaseClient;
}

/**
 * Get the current Supabase client for server-side operations
 * This is a shorthand for creating a server client in Server Components
 * 
 * @returns Server-side Supabase client with current session
 */
export async function getServerSupabaseClient() {
  return createServerSupabaseClient();
}
