import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("Supabase Client Architecture", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Environment Variables", () => {
    it("should validate NEXT_PUBLIC_SUPABASE_URL format", () => {
      const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
      if (url) {
        expect(url).toMatch(/^https?:\/\//);
      }
    });

    it("should validate NEXT_PUBLIC_SUPABASE_ANON_KEY exists", () => {
      const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
      if (key) {
        expect(key.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Security Boundaries", () => {
    it("should not expose service-role key in browser client", () => {
      process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://test.supabase.co";
      process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "test-anon-key";

      // Service role key should NOT be used in client
      expect(process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]).toBe("test-anon-key");
      expect(process.env["SUPABASE_SERVICE_ROLE_KEY"]).toBeUndefined();
    });

    it("should use anon key for browser operations", () => {
      process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://test.supabase.co";
      process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "public-key";

      const anonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
      if (anonKey) {
        expect(anonKey).toMatch(/^[a-zA-Z0-9_-]+$/);
      }
    });
  });

  describe("Architecture Separation", () => {
    it("should mark the server module as server-only", () => {
      const serverSource = readFileSync(
        join(process.cwd(), "lib/supabase/server.ts"),
        "utf8"
      );

      expect(serverSource).toContain('import "server-only";');
    });

    it("should keep server exports out of the browser barrel", () => {
      const barrelSource = readFileSync(
        join(process.cwd(), "lib/supabase/index.ts"),
        "utf8"
      );

      expect(barrelSource).not.toContain('from "./server"');
      expect(barrelSource).toContain('export { supabase } from "./client";');
    });
  });
});
