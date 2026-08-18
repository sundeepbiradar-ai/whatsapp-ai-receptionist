# Production Readiness

Phase 8 hardening reference. Implementation status is tracked in
`project-status.md`; this file is the operational checklist.

## 1. Environment contract

`lib/config/environment.ts` is the single source of truth. Run
`npm run verify:env` before or during deploy; it prints variable names only,
never values.

| Variable                        | Scope       | Required | Notes                                           |
| ------------------------------- | ----------- | -------- | ----------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | public      | yes      | Browser-safe.                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public      | yes      | RLS is the boundary, not this key.              |
| `NEXT_PUBLIC_SITE_URL`          | public      | yes      | Auth callback redirects fall back to localhost. |
| `SUPABASE_SERVICE_ROLE_KEY`     | server-only | yes      | WhatsApp pipeline, status correlation, retry.   |
| `OPENAI_API_KEY`                | server-only | no       | Unset means intent detection returns `unknown`. |
| `OPENAI_INTENT_MODEL`           | server-only | no       | Overrides the default model.                    |
| `WHATSAPP_RETRY_WORKER_SECRET`  | server-only | no       | Unset disables `/api/internal/whatsapp/retry`.  |
| `SUPABASE_TEST_*`               | test-only   | no       | Must never be set in production.                |

Provider credentials (WhatsApp access token, app secret, verify token) are
Vault-managed and never appear in environment variables.

## 2. Supabase production checklist

1. Apply migrations: `supabase db push` (or `db reset` on a fresh project).
2. Confirm Vault is available; create the WhatsApp secrets for each tenant.
3. Create Vault entries `whatsapp_retry_worker_url` and
   `whatsapp_retry_worker_secret`. Until both exist,
   `invoke_whatsapp_retry_worker()` is intentionally inert.
4. Enable `pg_cron` and confirm `pg_net` is installed.
5. Confirm the `whatsapp-retry-worker` cron job is active in `cron.job`.
6. Verify RLS is enabled on every `public` table and that
   `organization_whatsapp_secret_refs` and `whatsapp_send_jobs` have no
   `anon`/`authenticated` policies.
7. Regenerate types if the schema changed:
   `supabase gen types typescript --local > lib/supabase/database.ts`.

## 3. Deployment runbook

1. Set environment variables; run `npm run verify:env`.
2. Apply migrations, then confirm the cron job and Vault secrets.
3. Deploy the application.
4. Point the Meta webhook callback URL at `/api/whatsapp/webhook` and complete
   verification with the tenant's verify token.
5. Set `whatsapp_retry_worker_url` to the deployed
   `/api/internal/whatsapp/retry` URL.
6. Smoke test: `GET /api/health`, sign in, load `/dashboard/settings`, send one
   inbound WhatsApp message, confirm it persists.
7. Monitor: application logs, `whatsapp_send_jobs` rows in `dead` state, and
   `messages` rows in `unconfirmed` state.

### Rollback

Redeploy the previous build. Migrations in this repository are additive; do not
roll a migration back without a reviewed down-migration. If the retry worker
misbehaves, clear the Vault `whatsapp_retry_worker_secret` entry to make the
cron invoker inert without a redeploy.

## 4. Security posture

- Security headers are set in `next.config.ts`:
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security`, and `poweredByHeader:
false`.
- **CSP is deliberately not set.** Next.js requires a per-request nonce for its
  inline bootstrap scripts, and the nonce mechanism depends on the hosting
  platform's middleware/edge support. Adding a blind `unsafe-inline` policy
  would provide little protection while risking breakage. Decide this when the
  hosting platform is chosen.
- **Rate limiting is not implemented in the application.** In-memory limiting
  would be unreliable across instances and is deliberately absent. The webhook
  is protected by HMAC signature verification, the retry endpoint by a
  timing-safe bearer secret, and Supabase Auth applies its own limits. A
  durable limiter belongs at the deployment edge (platform WAF/rate limiting)
  or a shared store; this is an open deployment decision, not an application
  defect.
- Every `SECURITY DEFINER` function has a fixed `search_path`, no `PUBLIC`
  execute grant, and Vault-reading functions are `service_role` only.

## 5. Backup and recovery

Use hosted Supabase's managed backups; no backup mechanism is implemented in
the application. Confirm before launch: point-in-time recovery enabled,
retention agreed, and a restore rehearsed against a non-production project.

## 6. Live verification still pending

None of the following have been executed; do not treat them as verified.

- [ ] Live Meta webhook verification (GET challenge) against production.
- [ ] Live Meta outbound delivery.
- [ ] Live Meta status callback (`sent`/`delivered`/`read`/`failed`).
- [ ] Hosted `pg_cron` invoking the deployed retry endpoint.
- [ ] Live OpenAI classification request.
- [ ] Production RLS smoke check with two real tenants.
