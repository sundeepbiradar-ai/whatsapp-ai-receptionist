/**
 * Supabase Client Foundation
 * 
 * This module provides the browser client and shared Supabase types.
 * Server code must import directly from './server'.
 * 
 * Both clients use only the public anon key for security.
 * Session management is automatic via cookies.
 * Row-Level Security (RLS) policies enforce data access control.
 * 
 * Security Principles:
 * 1. Never expose the service-role key to the browser
 * 2. Never use the service-role key in client code
 * 3. Use RLS policies to enforce multi-tenant data isolation
 * 4. All auth state is managed via HTTP-only cookies
 * 5. Client and server contexts are strictly separated
 */

export { supabase } from "./client";
export type { SupabaseClient, Session, User } from "@supabase/supabase-js";
