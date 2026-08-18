# Project Delivery Status

This document is the single reference for phase progress, validation results,
blockers, and the rule for moving to the next step.

## Current Status

| Item                     | Status                                              |
| ------------------------ | --------------------------------------------------- |
| Current phase            | Phase 5.3 - WhatsApp Reliability                    |
| Current step             | Reliability complete; deployment verification next  |
| Completed phases         | 4 of 9                                              |
| Overall phase completion | 44.4%                                               |
| Phase 4 completion       | 100% (10 of 10 steps)                               |
| Phase 5 completion       | Implementation 100%; deployment verification open   |
| Latest validation        | 203 unit, 75 integration, typecheck/lint/build pass |
| Active blockers          | None; deployment verification pending               |

## Advancement Gate

A step can be marked **Complete** only when:

1. The implementation is complete.
2. Required unit and integration tests pass.
3. Relevant end-to-end tests pass.
4. TypeScript, lint, and production build checks pass.
5. No unresolved blocker remains.

The next step or phase must not begin until the current step passes this gate.
Do not weaken a test to make the gate green; fix the owning behavior or update
the assertion only when the intended behavior has deliberately changed.

## Phase 1 - Foundation / Project Setup

**Status: Complete**

| Step                                              | Status   | Validation | Blocker |
| ------------------------------------------------- | -------- | ---------- | ------- |
| Next.js application structure                     | Complete | Passed     | None    |
| Supabase connection and environment configuration | Complete | Passed     | None    |
| Authentication foundation                         | Complete | Passed     | None    |
| Database migration structure                      | Complete | Passed     | None    |
| Basic UI and layout                               | Complete | Passed     | None    |
| Development and test infrastructure               | Complete | Passed     | None    |

## Phase 2 - Authentication and Organization

**Status: Complete**

| Step                                            | Status   | Validation | Blocker |
| ----------------------------------------------- | -------- | ---------- | ------- |
| Signup, login, logout, and session handling     | Complete | Passed     | None    |
| Authentication middleware                       | Complete | Passed     | None    |
| Organization creation and membership            | Complete | Passed     | None    |
| Organization roles and context                  | Complete | Passed     | None    |
| RLS, tenant isolation, and server authorization | Complete | Passed     | None    |
| Protected dashboard and basic navigation        | Complete | Passed     | None    |

## Phase 3 - Core CRM / Receptionist Foundation

**Status: Complete**

| Step                                                             | Status   | Validation | Blocker |
| ---------------------------------------------------------------- | -------- | ---------- | ------- |
| Contacts CRUD and organization ownership                         | Complete | Passed     | None    |
| Conversation records, relationships, and status                  | Complete | Passed     | None    |
| Dashboard foundation and organization information                | Complete | Passed     | None    |
| Typed repositories, actions, validation, and errors              | Complete | Passed     | None    |
| Appointment model, relationships, timestamps, status, and notes  | Complete | Passed     | None    |
| Appointment CRUD and status mutation                             | Complete | Passed     | None    |
| Appointment list, detail, create, and edit UI                    | Complete | Passed     | None    |
| Unit and integration validation                                  | Complete | Passed     | None    |
| Contacts, conversations, dashboard, and appointment E2E coverage | Complete | Passed     | None    |
| Playwright environment stabilization and final validation        | Complete | Passed     | None    |

## Phase 4 - Appointment Engine

**Status: Complete - 10 of 10 steps complete**

| Step                                                           | Status   | Validation                             | Blocker |
| -------------------------------------------------------------- | -------- | -------------------------------------- | ------- |
| 4.1 Appointment domain rules                                   | Complete | Passed                                 | None    |
| 4.2 Availability engine                                        | Complete | Passed                                 | None    |
| 4.3 Conflict detection                                         | Complete | Passed                                 | None    |
| 4.4 Appointment creation engine                                | Complete | Passed                                 | None    |
| 4.5 Rescheduling and self-conflict handling                    | Complete | Passed                                 | None    |
| 4.6 Cancellation and status transitions                        | Complete | Passed                                 | None    |
| 4.7 Appointment querying                                       | Complete | Passed                                 | None    |
| 4.8 Time/date handling, timezone, UTC, DST, and duration rules | Complete | 118 unit, 26 integration, 1 E2E passed | None    |
| 4.9 Reusable appointment service/API boundary                  | Complete | 115 unit, 26 integration, 1 E2E passed | None    |
| 4.10 Comprehensive appointment engine tests and E2E workflows  | Complete | 90 unit, 26 integration, 1 E2E passed  | None    |

## Phase 5 - WhatsApp Integration

**Status: Phase 5 implementation complete; deployment verification pending**

| Step                                                 | Status   | Validation               | Blocker                 |
| ---------------------------------------------------- | -------- | ------------------------ | ----------------------- |
| WhatsApp provider integration                        | Complete | 203 unit, 75 integration | None                    |
| Webhook validation and incoming/outgoing messages    | Complete | 203 unit, 75 integration | Live Meta verification  |
| Message status handling                              | Complete | 203 unit, 75 integration | Live Meta verification  |
| Conversation pipeline                                | Complete | 203 unit, 75 integration | None                    |
| Idempotency, retries, duplicate handling, and errors | Complete | 203 unit, 75 integration | Deployment verification |

The Phase 5.2 row in the Validation Record reported a combined unit and
integration total. From Phase 5.3 onward the two counts are recorded
separately. The counts above are from the latest full-suite run.

### Phase 5.1 Configuration Foundation

**Status: PHASE 5.1 CONFIGURATION FOUNDATION COMPLETE**

- Safe organization-owned provider metadata in `organization_whatsapp_configs`.
- Vault-only secret references in `organization_whatsapp_secret_refs`.
- Owner/admin mutations and member metadata read access through RLS.
- Service-role-only Vault resolution by provider phone number or organization.
- Provider support is currently limited to `meta_whatsapp_cloud`.
- Webhook verification, signature validation, inbound normalization, and
  outbound text messaging are complete.
- Conversation/message persistence, durable provider-message correlation,
  idempotency, retries, and delivery reconciliation are deferred to Phase
  5.2/5.3 and are not Phase 5.1 blockers.
- Hosted Supabase Vault compatibility must be verified before production use.

### Phase 5.1 Webhook Verification and Signature Security

**Status: PHASE 5.1 WEBHOOK VERIFICATION & SIGNATURE SECURITY COMPLETE**

- Endpoint: `/api/whatsapp/webhook`.
- GET verifies Meta subscription challenges through the active Vault-backed
  configuration boundary.
- POST extracts only an untrusted phone-number routing hint, resolves the
  active configuration server-side, and verifies the raw-body
  `X-Hub-Signature-256` HMAC before acknowledgement.
- Inbound text events are passed to the Phase 5.2 conversation pipeline.
- No status persistence, Phase 5.2, or AI work was started.

### Phase 5.1 Outbound WhatsApp Messaging

**Status: PHASE 5.1 OUTBOUND WHATSAPP MESSAGING COMPLETE**

- Server-only `sendWhatsAppText` boundary resolves organization configuration
  and Vault access tokens without accepting caller-supplied provider fields.
- Meta text requests use the configured `phone_number_id` and a fixed Graph API
  endpoint.
- Provider responses are reduced to provider, message ID, and recipient.
- No messages, contacts, conversations, or provider statuses are persisted.
- Live Meta delivery verification remains pending.

### Phase 5.1 Closeout

**Status: PHASE 5.1 COMPLETE - LIVE META VERIFICATION PENDING**

- No Meta/Facebook/WhatsApp production credential variables are available in
  the current environment.
- Live webhook and delivery smoke verification is a deployment/integration
  verification item, not an implementation blocker.
- Durable provider-status persistence and reliability workflows remain deferred
  to Phase 5.3.
- Phase 5.2 was not started.

### Phase 5.2 Schema Foundation

**Status: PHASE 5.2 SCHEMA FOUNDATION COMPLETE**

- Messages now support nullable provider correlation fields with tenant-scoped
  uniqueness for `meta_whatsapp_cloud` message IDs.
- Conversations now support nullable channel identity and an organization-
  consistent WhatsApp configuration reference.
- One open WhatsApp conversation per organization/contact/configuration is
  constrained while closed historical conversations remain allowed.
- Phase 5.2 contact resolution, conversation resolution, message persistence,
  and webhook pipeline integration are complete. Phase 5.3 reliability and AI
  remain unstarted.

### Phase 5.2 Conversation Pipeline

**Status: PHASE 5.2 CONVERSATION PIPELINE COMPLETE**

- Trusted normalized inbound text events resolve or create contacts within the
  trusted organization.
- Open WhatsApp conversations are resolved by organization, contact, channel,
  and WhatsApp configuration; closed conversations are not reused.
- Inbound messages persist with direction, content, provider, and provider
  message ID.
- Duplicate provider IDs return a stable duplicate outcome without inserting a
  second message.
- No retries, queues, delivery reconciliation, automatic replies, appointment
  automation, or AI behavior was added.

### Phase 5.3 WhatsApp Reliability

**Status: PHASE 5.3 RELIABILITY COMPLETE - DEPLOYMENT VERIFICATION PENDING**

Completed reliability features:

- Durable delivery model on `messages`: `delivery_status`
  (`pending`/`unconfirmed`/`sent`/`delivered`/`read`/`failed`),
  `delivery_status_at`, `delivery_error_code`, `delivery_error_message`. Legacy
  and internal messages keep null values and remain valid.
- Inbound idempotency is explicit: the same organization, provider, and
  provider message ID returns a stable duplicate result and never creates a
  second contact, conversation, or message. Concurrent duplicates converge
  through an advisory transaction lock plus the unique index.
- Provider status correlation runs through the service-only
  `apply_whatsapp_message_status` boundary keyed on organization, active
  WhatsApp configuration, provider, and provider message ID. A provider message
  ID alone can never mutate a message.
- Monotonic transitions: `sent` -> `delivered` -> `read` may only advance.
  Repeated events are `ignored_duplicate`, regressions are `ignored_stale`.
  `failed` applies only before delivery and is terminal afterwards.
- Status events never create inbound text messages and never apply to inbound
  messages.
- Outbound correlation uses a reserve -> send -> correlate boundary under the
  caller's RLS session. There is no atomicity across the provider HTTP call, so
  `pending` is an explicit reconciliation state and `failed` records the
  classified failure.
- Failures are classified three ways: retryable (HTTP 429, provider 5xx,
  connect-phase transport failures), ambiguous (the provider may have accepted
  the request), and permanent (invalid destination, invalid message,
  configuration, auth, malformed request).
- Webhook acknowledgement is deterministic: verified duplicate, stale, and
  unknown events acknowledge once with 200; invalid signatures still return 403
  and persist nothing; persistence failures return 500 and are never reported
  as signature failures.

### Phase 5.3 Durable Retry

**Status: PHASE 5.3 RELIABILITY COMPLETE - DEPLOYMENT VERIFICATION PENDING**

- `whatsapp_send_jobs` is the durable retry substrate: one live job per
  message, a tenant-safe `(organization_id, message_id)` foreign key to
  `messages`, RLS enabled with no anon/authenticated policies, and four job
  states (`pending`, `processing`, `completed`, `dead`).
- Claiming uses `FOR UPDATE SKIP LOCKED` with a five minute lease, so
  concurrent workers receive disjoint jobs. `attempt_count` increments at claim
  time, so a crashed worker still consumes an attempt and cannot loop forever.
  Expired leases are reaped, or retired to `dead` once attempts are spent.
- Backoff is exponential with full jitter: 5 attempts, 30s base, 1h cap.
  HTTP 429 uses the greater of `Retry-After` and the computed backoff, capped
  at one hour. Randomness is injectable so bounds are deterministically tested.
- Only safe retryable failures create a job. Permanent failures create none.
  Ambiguous outcomes - including provider success with failed local
  correlation - become `unconfirmed`, which is never claimable and never
  retried automatically.
- Retries reuse the existing message row. No retry ever creates a second
  logical message, and a message that already advanced cannot be regressed by a
  stale job.
- `POST /api/internal/whatsapp/retry` accepts no tenant, message, or provider
  input. It verifies a bearer worker secret with a timing-safe comparison, is
  disabled when the secret is unset, and never echoes internal detail.
- `pg_cron` calls `public.invoke_whatsapp_retry_worker()` every minute. The
  endpoint URL and worker secret are read from Vault at run time; the function
  is inert until both exist. No domain or secret is stored in the repository.

Exactly-once delivery does not exist here. The WhatsApp Cloud API provides no
client idempotency key for text sends, so ambiguous outcomes are deliberately
routed to `unconfirmed` for manual reconciliation instead of being retried.

Deployment verification still pending:

- Live Meta status-callback and delivery verification against production
  credentials.
- Production `pg_cron` execution against a real deployed worker URL. Local
  Supabase validates the schedule, the invoker, and its Vault gating, but it
  cannot exercise a real external HTTP target.
- Creation of the `whatsapp_retry_worker_url` and
  `whatsapp_retry_worker_secret` Vault secrets in the production project.

## Phase 6 - AI Receptionist

**Status: Not started - Phase 5 implementation is complete, so this phase is
unblocked once deployment verification is scheduled**

| Step                                                   | Status      | Validation | Blocker                      |
| ------------------------------------------------------ | ----------- | ---------- | ---------------------------- |
| Intent detection                                       | Not started | Not run    | None; awaiting phase kickoff |
| Conversation state and required information collection | Not started | Not run    | None; awaiting phase kickoff |
| Natural scheduling conversation                        | Not started | Not run    | None; awaiting phase kickoff |
| Appointment-engine tool calling                        | Not started | Not run    | None; awaiting phase kickoff |
| Real availability and business-function responses      | Not started | Not run    | None; awaiting phase kickoff |

## Phase 7 - Business Configuration

**Status: Planned - blocked until Phase 6 is complete**

| Step                                  | Status  | Validation | Blocker            |
| ------------------------------------- | ------- | ---------- | ------------------ |
| Business hours and timezone           | Planned | Not run    | Phase 6 incomplete |
| Appointment duration and services     | Planned | Not run    | Phase 6 incomplete |
| Booking and cancellation rules        | Planned | Not run    | Phase 6 incomplete |
| Receptionist personality and greeting | Planned | Not run    | Phase 6 incomplete |
| Escalation rules                      | Planned | Not run    | Phase 6 incomplete |

## Phase 8 - Production Hardening

**Status: Planned - blocked until Phase 7 is complete**

| Step                                                 | Status  | Validation | Blocker            |
| ---------------------------------------------------- | ------- | ---------- | ------------------ |
| RLS and authorization audit                          | Planned | Not run    | Phase 7 incomplete |
| Webhook, security, and secrets audit                 | Planned | Not run    | Phase 7 incomplete |
| Retries, logging, monitoring, and idempotency        | Planned | Not run    | Phase 7 incomplete |
| Full unit, integration, E2E, and AI workflow testing | Planned | Not run    | Phase 7 incomplete |
| Production-like validation and deployment pipeline   | Planned | Not run    | Phase 7 incomplete |

## Phase 9 - Production Launch

**Status: Planned - blocked until Phase 8 is complete**

| Step                                          | Status  | Validation | Blocker            |
| --------------------------------------------- | ------- | ---------- | ------------------ |
| Production Supabase and environment           | Planned | Not run    | Phase 8 incomplete |
| WhatsApp production credentials               | Planned | Not run    | Phase 8 incomplete |
| Pilot customer                                | Planned | Not run    | Phase 8 incomplete |
| Real conversation and scheduling monitoring   | Planned | Not run    | Phase 8 incomplete |
| Edge-case fixes and receptionist improvements | Planned | Not run    | Phase 8 incomplete |

## Validation Record

Record actual counts after each gate. Keep the command, date, result, and
counts together so a future status update can be audited.

| Date       | Scope                           |                 Unit |  Integration |      E2E | Typecheck | Lint                | Build        | Result                               |
| ---------- | ------------------------------- | -------------------: | -----------: | -------: | --------- | ------------------- | ------------ | ------------------------------------ |
| 2026-08-17 | Current baseline                |         Record count | Record count |   Passed | Passed    | Passed              | Not recorded | Baseline green                       |
| 2026-08-18 | Phase 4.8                       |           118 passed |    26 passed | 1 passed | Passed    | Passed, 9 warnings  | Passed       | Complete                             |
| 2026-08-18 | Phase 4.9                       |           115 passed |    26 passed | 1 passed | Passed    | Passed, 9 warnings  | Passed       | Complete                             |
| 2026-08-18 | Phase 4.10                      | 90 passed, 9 skipped |    26 passed | 1 passed | Passed    | Passed, 9 warnings  | Passed       | Complete                             |
| 2026-08-18 | Phase 5.1 config foundation     |           124 passed |    34 passed |  Not run | Passed    | Passed, 15 warnings | Passed       | Foundation complete                  |
| 2026-08-18 | Phase 5.1 webhook security      |           137 passed |    34 passed |  Not run | Passed    | Passed, 15 warnings | Passed       | Webhook security complete            |
| 2026-08-18 | Phase 5.1 outbound messaging    |           149 passed |    34 passed |  Not run | Passed    | Passed, 15 warnings | Passed       | Outbound messaging complete          |
| 2026-08-18 | Phase 5.1 closeout              |           149 passed |    34 passed |  Not run | Passed    | Passed, 15 warnings | Passed       | Complete - live verification pending |
| 2026-08-18 | Phase 5.2 schema foundation     |           155 passed |    40 passed |  Not run | Passed    | Passed, 17 warnings | Passed       | Schema foundation complete           |
| 2026-08-18 | Phase 5.2 conversation pipeline |           163 passed |    45 passed |  Not run | Passed    | Passed, 24 warnings | Passed       | Pipeline complete                    |
| 2026-08-18 | Phase 5.3 WhatsApp reliability  |           157 passed |    58 passed |  Not run | Passed    | Passed, 38 warnings | Passed       | Partially complete - retry blocked   |
| 2026-08-18 | Phase 5.3 durable retry         |           203 passed |    75 passed |  Not run | Passed    | Passed, 50 warnings | Passed       | Complete - deployment pending        |

Recommended commands:

```bash
npm test -- --run
npm run test:integration
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

## Active Blockers

None. The durable retry subsystem is implemented and validated locally. What
remains is deployment verification, which cannot be performed from this
environment: production Vault secrets, real `pg_cron` invocation of a deployed
worker URL, and live Meta delivery/status callbacks.

The local Supabase environment was used for integration validation.
Credentials were loaded temporarily from `supabase status -o json` and were not
written to repository files.

## Architecture Rules

- Phase 4 must be complete before WhatsApp or AI scheduling work begins.
- The appointment engine is the source of truth for scheduling.
- Every appointment operation must remain organization-scoped and authorized.
- Timezone, UTC storage, DST, duration, and conflict behavior must be explicit.
- Preserve the working baseline and avoid unrelated refactors during phase work.

## Update Procedure

After completing a step, update its status and validation counts in this file.
If a check fails, set the step to **Blocked**, describe the owning issue under
**Active Blockers**, and do not advance. When all gate checks pass, mark the
step **Complete**, record the date and counts, then begin the next step.
