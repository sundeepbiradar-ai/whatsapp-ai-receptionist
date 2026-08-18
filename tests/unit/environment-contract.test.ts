import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { environmentContract, verifyEnvironment } from "@/lib/config/environment";

const scriptSource = readFileSync(resolve(process.cwd(), "scripts/verify-environment.mjs"), "utf8");

function requiredNames(): string[] {
  return environmentContract.filter((variable) => variable.required).map((variable) => variable.name);
}

describe("environment contract", () => {
  it("classifies every variable and documents it", () => {
    for (const variable of environmentContract) {
      expect(["public", "server-only", "test-only"]).toContain(variable.scope);
      expect(variable.description.length).toBeGreaterThan(10);
    }
  });

  it("never marks a secret as public", () => {
    for (const name of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "OPENAI_API_KEY",
      "WHATSAPP_RETRY_WORKER_SECRET",
    ]) {
      const variable = environmentContract.find((entry) => entry.name === name);
      expect(variable?.scope).toBe("server-only");
      expect(name.startsWith("NEXT_PUBLIC")).toBe(false);
    }
  });

  it("keeps the deploy script in sync with the contract", () => {
    for (const name of requiredNames()) {
      expect(scriptSource).toContain(name);
    }
  });

  it("reports missing required variables without printing values", () => {
    const result = verifyEnvironment({});
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(requiredNames());
  });

  it("passes when every required variable is present", () => {
    const result = verifyEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      NEXT_PUBLIC_SITE_URL: "https://app.example.com",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      OPENAI_API_KEY: "key",
      WHATSAPP_RETRY_WORKER_SECRET: "secret",
    });
    expect(result).toMatchObject({ ok: true, missing: [], warnings: [] });
  });

  it("warns when test credentials are present", () => {
    const result = verifyEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      NEXT_PUBLIC_SITE_URL: "url",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      OPENAI_API_KEY: "key",
      WHATSAPP_RETRY_WORKER_SECRET: "secret",
      SUPABASE_TEST_SERVICE_ROLE_KEY: "test",
    });
    expect(result.warnings.join(" ")).toContain("SUPABASE_TEST_SERVICE_ROLE_KEY");
  });

  it("documents every variable the application actually reads", () => {
    const documented = new Set(environmentContract.map((variable) => variable.name));
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SITE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "OPENAI_API_KEY",
      "OPENAI_INTENT_MODEL",
      "WHATSAPP_RETRY_WORKER_SECRET",
    ]) {
      expect(documented.has(name)).toBe(true);
    }
  });

  it("lists every required variable in .env.example", () => {
    const example = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    for (const variable of environmentContract) {
      expect(example).toContain(variable.name);
    }
  });
});

describe("production security headers", () => {
  const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

  it.each([
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ])("sets %s", (header) => {
    expect(config).toContain(header);
  });

  it("does not advertise the framework", () => {
    expect(config).toContain("poweredByHeader: false");
  });
});
