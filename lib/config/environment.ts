/**
 * Server-only environment contract. Import from server code or run the
 * `verify:env` script; never import from a client component.
 */

export type EnvScope = "public" | "server-only" | "test-only";

export type EnvVariable = {
  name: string;
  scope: EnvScope;
  required: boolean;
  description: string;
};

export const environmentContract: EnvVariable[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    scope: "public",
    required: true,
    description: "Supabase project URL. Safe to expose to the browser.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    scope: "public",
    required: true,
    description: "Supabase anon key. RLS is the security boundary, not this key.",
  },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    scope: "public",
    required: true,
    description: "Absolute site URL used to build auth callback redirects.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    scope: "server-only",
    required: true,
    description: "Used only by the WhatsApp pipeline, status correlation and retry worker.",
  },
  {
    name: "OPENAI_API_KEY",
    scope: "server-only",
    required: false,
    description: "Intent detection. Unset disables classification; results fall back to unknown.",
  },
  {
    name: "OPENAI_INTENT_MODEL",
    scope: "server-only",
    required: false,
    description: "Overrides the default intent model.",
  },
  {
    name: "WHATSAPP_RETRY_WORKER_SECRET",
    scope: "server-only",
    required: false,
    description:
      "Bearer secret for POST /api/internal/whatsapp/retry. Unset disables the endpoint. Must match the whatsapp_retry_worker_secret Vault entry used by pg_cron.",
  },
  {
    name: "SUPABASE_TEST_URL",
    scope: "test-only",
    required: false,
    description:
      "Dedicated non-production test project. Integration tests and the WhatsApp test harness target guard. Never set in production.",
  },
  {
    name: "SUPABASE_TEST_ANON_KEY",
    scope: "test-only",
    required: false,
    description: "Integration tests only. Never set in production.",
  },
  {
    name: "SUPABASE_TEST_SERVICE_ROLE_KEY",
    scope: "test-only",
    required: false,
    description: "Integration tests only. Never set in production.",
  },
  {
    name: "WHATSAPP_TEST_HARNESS_ENABLED",
    scope: "test-only",
    required: false,
    description:
      "Set to \"true\" to enable the POST /api/test/whatsapp/meta-harness development harness. Also requires NEXT_PUBLIC_SUPABASE_URL to equal SUPABASE_TEST_URL, and is always disabled when NODE_ENV is production. Never set in production.",
  },
];

export type EnvVerificationResult = {
  ok: boolean;
  missing: string[];
  warnings: string[];
};

export function verifyEnvironment(env: Record<string, string | undefined>): EnvVerificationResult {
  const missing = environmentContract
    .filter((variable) => variable.required && !env[variable.name]?.trim())
    .map((variable) => variable.name);

  const warnings: string[] = [];
  for (const variable of environmentContract) {
    if (variable.scope === "test-only" && env[variable.name]) {
      warnings.push(`${variable.name} is set; test credentials must not be present in production.`);
    }
  }
  if (!env["OPENAI_API_KEY"]?.trim()) {
    warnings.push("OPENAI_API_KEY is unset; intent detection will always return unknown.");
  }
  if (!env["WHATSAPP_RETRY_WORKER_SECRET"]?.trim()) {
    warnings.push(
      "WHATSAPP_RETRY_WORKER_SECRET is unset; the durable retry endpoint is disabled."
    );
  }

  return { ok: missing.length === 0, missing, warnings };
}
