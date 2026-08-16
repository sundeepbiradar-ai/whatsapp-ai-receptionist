/**
 * Browser/Client-side Supabase Client
 * 
 * IMPORTANT: This client uses only the public anon key.
 * It can only access data that Supabase's Row-Level Security (RLS) policies allow.
 * 
 * Usage: Use in client components with 'use client' directive
 */

"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database";

const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const supabaseAnonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set."
  );
}

/**
 * Browser client for Supabase
 * Automatically handles session management via cookies
 * Can only perform actions allowed by RLS policies
 */
export const supabase = createBrowserClient<Database>(
  supabaseUrl as string,
  supabaseAnonKey as string
);
