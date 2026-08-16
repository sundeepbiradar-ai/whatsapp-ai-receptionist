/**
 * Database Type Definitions
 * 
 * This file defines the shape of the Supabase database.
 * 
 * In Phase 2.1 (Supabase Foundation), this is an empty type placeholder.
 * Database tables and schema will be implemented in Phase 2.2 (Database Schema).
 * 
 * Once database migrations are created, this will be auto-generated from:
 * - Supabase type generation (supabase gen types)
 * - Or hand-maintained here
 * 
 * DO NOT manually create table types yet.
 * DO NOT create fake schema.
 * DO NOT import these types until tables are defined.
 */

export interface Database {
  public: {
    Tables: Record<string, unknown>;
    Views: Record<string, unknown>;
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
  };
}
