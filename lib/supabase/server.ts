/**
 * Server-side Supabase Client
 * 
 * IMPORTANT: This client uses only the public anon key.
 * It uses server-side session context to maintain authentication state.
 * 
 * Usage: Use in server components and server actions
 * Security: Session context is automatically managed via cookies
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const supabaseAnonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set."
  );
}

/**
 * Create a server-side Supabase client
 * Must be called in a Server Component or Server Action
 * Automatically manages session via cookies
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    supabaseUrl as string,
    supabaseAnonKey as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesList: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesList.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as Record<string, unknown>);
          });
        },
      },
    }
  );
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
