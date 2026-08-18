#!/usr/bin/env node
// Fails a deploy when a required server variable is missing. Prints names only,
// never values. Kept dependency-free so it can run before build steps;
// tests/unit/environment-contract.test.ts asserts it stays in sync with
// lib/config/environment.ts.

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const testOnly = ["SUPABASE_TEST_URL", "SUPABASE_TEST_ANON_KEY", "SUPABASE_TEST_SERVICE_ROLE_KEY"];

const missing = required.filter((name) => !process.env[name]?.trim());

for (const name of testOnly) {
  if (process.env[name]) {
    process.stdout.write(
      `warning: ${name} is set; test credentials must not be present in production.\n`
    );
  }
}
if (!process.env["OPENAI_API_KEY"]?.trim()) {
  process.stdout.write("warning: OPENAI_API_KEY is unset; intent detection will return unknown.\n");
}
if (!process.env["WHATSAPP_RETRY_WORKER_SECRET"]?.trim()) {
  process.stdout.write(
    "warning: WHATSAPP_RETRY_WORKER_SECRET is unset; the retry endpoint is disabled.\n"
  );
}

if (missing.length > 0) {
  process.stderr.write(`Missing required environment variables: ${missing.join(", ")}\n`);
  process.exit(1);
}

process.stdout.write("Environment contract satisfied.\n");
