# Deployment Guide

## 1. Deployment model

The application is a Next.js modular monolith deployed to a Next.js-compatible host. Supabase is a separate managed dependency providing PostgreSQL, Auth, Vault, `pg_cron`, and `pg_net`. Meta WhatsApp Cloud API and OpenAI are external provider dependencies.

The exact hosting provider is not fixed in the repository. The host must support:

- Node.js 22.x or a compatible current runtime.
- Next.js production build and `next start`/platform equivalent.
- HTTPS with a stable public URL.
- Server-only environment secrets.
- Long enough request handling for webhook and provider boundaries.
- Platform or WAF rate limiting before production traffic.

## 2. Prerequisites

- Node.js 22.x for parity with CI.
- npm and Git.
- A Supabase project for deployment.
- Supabase CLI for migration management, installed separately if needed.
- Meta Developer App and WhatsApp Cloud API configuration for live integration.
- OpenAI API key only if live intent classification is enabled.
- A deployment host with DNS and TLS.

## 3. Local development

```bash
git clone https://github.com/sundeepbiradar-ai/whatsapp-ai-receptionist.git
cd whatsapp-ai-receptionist
npm ci
cp .env.example .env.local
```

Set at minimum:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

For server paths, set a non-production service-role key only in the ignored local environment. Do not use production credentials locally.

Start the application:

```bash
npm run dev
```

Open `http://localhost:3000`.

Check the environment contract:

```bash
npm run verify:env
```

## 4. Pre-deployment verification

Run locally or in CI:

```bash
npm ci
npm run verify:env
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Run integration tests against a disposable Supabase project or local Supabase:

```bash
npm run test:integration
```

Run browser tests when the required browser/test environment is available:

```bash
npm run test:e2e
```

Do not proceed with a failed typecheck, lint, unit suite, integration suite, or production build.

## 5. Supabase production setup

### 5.1 Apply schema

From the repository root:

```bash
supabase login
supabase link --project-ref <production-project-ref>
supabase db push
```

For a new disposable environment, verify the full migration chain from scratch. Never run `db reset` against production.

### 5.2 Confirm database security

Verify in the Supabase dashboard or SQL checks:

- RLS is enabled on every public table.
- `organization_whatsapp_secret_refs` has no `anon`/`authenticated` policies.
- `whatsapp_send_jobs` has no `anon`/`authenticated` policies.
- Security-definer functions have fixed search paths and restricted execute grants.
- Vault is available and service-only Vault functions are present.
- Foreign keys, unique provider IDs, and retry-job constraints exist.

### 5.3 Configure Supabase services

- Enable `pg_cron` and confirm `pg_net` is available.
- Confirm the `whatsapp-retry-worker` cron job exists and runs every minute.
- Create Vault secrets per tenant for provider access token, app secret, and verify token references.
- Create Vault entries named `whatsapp_retry_worker_url` and `whatsapp_retry_worker_secret` after the application URL is known.
- The cron invoker remains intentionally inert until both worker entries exist.

If the schema changed, regenerate types:

```bash
supabase gen types typescript --local > lib/supabase/database.ts
```

Use the production project endpoint instead of `--local` when generating from a reviewed non-production/production schema according to the team's credential policy.

## 6. Application environment

Configure these in the hosting platform, never in source control:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=https://your-production-domain.example
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
OPENAI_API_KEY=<optional-server-only-key>
OPENAI_INTENT_MODEL=<optional-model-name>
WHATSAPP_RETRY_WORKER_SECRET=<server-only-worker-secret>
```

Do not configure `SUPABASE_TEST_*` variables in production. Do not put Meta access tokens, app secrets, or verify tokens in environment variables; use Vault.

Run the deploy gate in the deployment environment:

```bash
npm run verify:env
```

The command must report no missing required variables. Warnings for intentionally disabled OpenAI or retry features must be understood and approved.

## 7. Build and release

The host should execute:

```bash
npm ci
npm run verify:env
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Deploy the generated Next.js application using the host's supported production command. For a generic Node host:

```bash
npm start
```

Set the public DNS record to the host, enable TLS, and set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin. Authentication callbacks depend on this value.

## 8. Meta WhatsApp configuration

After the application has a stable HTTPS URL:

1. Configure the Meta webhook callback as `https://<domain>/api/whatsapp/webhook`.
2. Complete GET verification with the tenant's Vault-backed verify token.
3. Configure the organization WhatsApp metadata: phone number ID, business account ID, display number, and active state.
4. Store the access token and app secret through the approved Vault references.
5. Subscribe the Meta app to inbound message and message-status events.
6. Send a controlled inbound test message.
7. Verify the contact, open conversation, inbound message, provider ID, and duplicate-event behavior.
8. Send a controlled outbound test through the trusted application path.
9. Verify delivery callbacks advance status monotonically.

## 9. Retry worker configuration

After deployment, set Vault values:

- `whatsapp_retry_worker_url`: `https://<domain>/api/internal/whatsapp/retry`
- `whatsapp_retry_worker_secret`: the same high-entropy value as `WHATSAPP_RETRY_WORKER_SECRET`

Then verify:

- A request without the bearer secret is rejected.
- A correct worker request claims only due jobs.
- A retryable provider failure creates/reschedules one job.
- A permanent failure creates no job.
- A spent job becomes `dead`.
- An ambiguous provider result remains `unconfirmed` and is not retried.
- `cron.job` shows the expected schedule and recent executions.

## 10. Smoke tests after release

```bash
curl -fsS https://<domain>/api/health
```

Then manually verify:

- Sign up and log in.
- Complete onboarding and load the protected dashboard.
- Create/read a contact.
- Create and update business settings as owner/admin.
- Confirm a member can read permitted settings but cannot perform restricted writes.
- Create, reschedule, cancel, and query an appointment in the configured timezone.
- Confirm two tenants cannot read or mutate one another's records.
- Verify the Meta webhook GET challenge and one inbound message.
- Verify status callbacks and retry behavior if production credentials are enabled.
- Verify live OpenAI classification only if `OPENAI_API_KEY` is configured.

## 11. Monitoring and operations

Monitor:

- Application error logs and request latency.
- `/api/health` availability.
- Authentication callback failures.
- PostgreSQL errors and RLS denials.
- `messages.delivery_status` transitions.
- `messages` rows with `unconfirmed` status.
- `whatsapp_send_jobs` rows in `processing`, `pending`, and `dead` states.
- Cron invocation failures and Vault resolution failures.
- Meta webhook verification/signature failures.

Do not log authorization headers, provider tokens, Vault values, raw webhook signatures, or unnecessary customer message content.

## 12. Backup and recovery

Use Supabase managed backups and enable point-in-time recovery before launch. Agree retention with the product owner and rehearse restoration into a non-production project. The application does not implement its own backup system.

## 13. Rollback

1. Stop or disable the deployment rollout at the hosting platform.
2. Redeploy the previous known-good application build.
3. Do not reverse migrations casually; repository migrations are additive and require a reviewed down-migration if reversal is necessary.
4. If the retry worker misbehaves, remove or clear the Vault `whatsapp_retry_worker_secret` so the cron invoker becomes inert without a code rollback.
5. Re-run `/api/health`, authentication, RLS, and controlled provider smoke tests.
6. Preserve failed job and message records for investigation.

## 14. Launch blockers and explicit verification status

The implementation is hardening-complete, but launch verification remains pending for:

- Live Meta GET webhook verification.
- Live Meta outbound delivery.
- Live Meta status callbacks.
- Hosted `pg_cron` calling the deployed worker.
- Production creation of retry-worker Vault secrets.
- Live OpenAI classification.
- Production two-tenant RLS smoke test.
- Hosting-platform CSP nonce strategy.
- Edge/WAF rate limiting.
- Backup restore rehearsal.

These items must be checked off before declaring a production launch complete.
