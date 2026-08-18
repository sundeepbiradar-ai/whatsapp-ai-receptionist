# Project Delivery Status

This document is the single reference for phase progress, validation results,
blockers, and the rule for moving to the next step.

## Current Status

| Item                     | Status                                              |
| ------------------------ | --------------------------------------------------- |
| Current phase            | Phase 6.4 - Tool Calling                            |
| Current step             | Phase 6 AI receptionist core complete               |
| Completed phases         | 5 of 9                                              |
| Overall phase completion | 55.6%                                               |
| Phase 4 completion       | 100% (10 of 10 steps)                               |
| Phase 5 completion       | Implementation 100%; deployment verification open   |
| Phase 6 completion       | Core complete (6.1, 6.2, 6.3, 6.4)                  |
| Latest validation        | 438 unit, 96 integration, typecheck/lint/build pass |
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

**Status: PHASE 6 AI RECEPTIONIST CORE COMPLETE - 6.1, 6.2, 6.3 and 6.4 complete**

| Step                                              | Status      | Validation               | Blocker                      |
| ------------------------------------------------- | ----------- | ------------------------ | ---------------------------- |
| 6.1 Intent detection                              | Complete    | 438 unit, 96 integration | None                         |
| 6.2 Conversation state and required information   | Complete    | 438 unit, 96 integration | None                         |
| 6.3 Natural scheduling conversation               | Complete    | 438 unit, 96 integration | None                         |
| 6.4 Appointment-engine tool calling               | Complete    | 438 unit, 96 integration | None                         |
| Real availability and business-function responses | Not started | Not run                  | None; awaiting phase kickoff |

### Phase 6.1 Intent Detection

**Status: PHASE 6.1 INTENT DETECTION COMPLETE**

- Fixed seven-value taxonomy: `book_appointment`, `reschedule_appointment`,
  `cancel_appointment`, `query_appointment`, `general_question`, `greeting`,
  `unknown`. No other intent can be represented.
- Result contract is `{ intent, requiresClarification, reason }`. There is no
  numeric confidence score, because a model-reported probability would not be
  calibrated. `requiresClarification` is set by deterministic application rules:
  empty input, low-signal input, over-length input, schema mismatch, malformed
  output, any provider failure, or a model-reported `unknown`.
- Minimal server-only provider boundary in `lib/ai/provider.ts` reads
  `OPENAI_API_KEY` at request time, sends the key only as an authorization
  header, and is never reachable from browser code. Tests never need real
  credentials.
- Model output is parsed and validated with a strict Zod schema. Unsupported
  intent strings, malformed JSON, wrong shapes, and smuggled extra keys all
  degrade to `unknown` with `requiresClarification: true`. Raw model JSON is
  never trusted.
- The system prompt classifies only, treats the customer message as untrusted
  data inside a delimited block, refuses instruction override, forbids tool use,
  and forbids disclosing system instructions. No credentials, Vault contents, or
  unrelated customer data are sent to the model.
- Provider failures map to stable internal reasons: timeout, rate limit,
  unavailable, unauthorized, configuration invalid, malformed output. No API
  key, raw provider error, prompt, or stack trace is exposed.
- Classification is side-effect free. `lib/ai/*` imports no Supabase client and
  no appointment, message, conversation, contact, or WhatsApp module, and tests
  assert that import boundary. The webhook route was not modified.

Not started in Phase 6.1, by design: conversation state (6.2), scheduling
conversation (6.3), and appointment tool calling (6.4). No automatic replies and
no appointment mutations exist anywhere in the AI path.

### Phase 6.2 Conversation State

**Status: PHASE 6.2 CONVERSATION STATE COMPLETE**

- `buildConversationState({ conversationId })` is the single authoritative
  boundary. It takes **no** `organizationId`: the organization comes from
  `requireDomainOrganization()`, so a caller cannot assert ownership. Both
  queries are organization-scoped and run under the caller's RLS session; no
  service role is used.
- State is derived, never persisted: organization, conversation, contact,
  conversation status, `isConversationOpen`, `hasRecentInboundMessage`, latest
  inbound message id/text, detected intent, `requiresClarification`,
  `intentReason`, and the bounded recent message window.
- History is bounded to the newest 20 messages, fetched newest-first with an
  explicit limit and reversed to chronological order. Ordering is deterministic
  on `created_at` then `id`, so it never depends on client behavior.
- The latest **inbound** message is selected for classification even when newer
  outbound messages exist. Outbound messages are never classified as customer
  intent. A conversation with no inbound message yields `unknown` with reason
  `no_inbound_message` and does not call the model.
- Phase 6.1 is reused unchanged: no prompt, provider, or taxonomy was
  duplicated or modified. Intent detection remains text-based on the latest
  inbound message; conversation history is exposed in state but does not feed
  the classifier. Context-aware classification would be a separate design
  decision and was not made here.
- `requiresClarification` is surfaced for Phase 6.3 to act on. No clarification
  text, reply, or slot-filling dialogue is generated in 6.2.
- Read-only: the module performs no insert, update, upsert, delete, or RPC, and
  imports no appointment or WhatsApp module. Tests assert both the import graph
  and that record counts and conversation status are unchanged after a build.
- Not wired into the webhook. Phase 6.3 decides how state is consumed.

### Phase 6.3 Scheduling Conversation

**Status: PHASE 6.3 SCHEDULING CONVERSATION COMPLETE**

- `planSchedulingConversation(state)` derives the next dialogue step from a
  trusted `ConversationState`. It prepares; it never acts.
- Contract: `{ intent, action, requiresClarification, missingFields,
collectedFields, nextStep, reason }`. Actions are `prepare_booking`,
  `prepare_reschedule`, `prepare_cancellation`, `prepare_query`,
  `no_scheduling_action`. Next steps are `ask_for_date`, `ask_for_time`,
  `ask_for_appointment_reference`, `ask_for_clarification`, `ready_for_tool`,
  `no_action`.
- Required fields were derived from the real Phase 4 contracts: booking needs
  date and time (contact comes from the conversation, `endsAt` from
  `default_duration_minutes`); reschedule needs a reference plus new date and
  time; cancellation needs only a reference; queries need nothing, because
  `queryAppointments` has no required options. Staff, service and resource
  selection were not invented, because the appointment engine has none.
- Slot extraction returns only local `date`, `time` and a boolean. The schema
  has no identifier field, so an appointment id cannot be hallucinated; strict
  parsing rejects any extra key. Vague language such as "morning" yields null
  and asks rather than guessing.
- Context resolution is deterministic, not model-driven: a clock-reference scan
  over the recent window resolves "change it" or "cancel that one" only when
  exactly one distinct referent exists. Zero referents ask for a reference;
  several require clarification. Phase 6.1 was not modified.
- Timezone comes from `organization_scheduling_settings` through the existing
  organization-scoped `getSchedulingSettings()` reader; the server timezone is
  never used. Instants are produced by the Phase 4.8 `localDateTimeToUtc`, so
  nonexistent and ambiguous DST local times become clarification requests
  instead of silent guesses.
- The single existing AI provider boundary is reused; no second client was
  added. Extraction failures degrade to no collected fields.
- Read-only: no insert, update, upsert, delete or RPC, and no import of any
  booking, reschedule, cancel, query or WhatsApp send symbol. Integration
  asserts zero appointments exist after preparing a booking.
- Not wired into the webhook. Phase 6.4 decides how the plan is executed.

### Phase 6.4 Tool Calling

**Status: PHASE 6.4 TOOL CALLING COMPLETE — PHASE 6 AI RECEPTIONIST CORE COMPLETE**

- Exactly four tools exist: `book_appointment`, `reschedule_appointment`,
  `cancel_appointment`, `query_appointments`. No repository method, SQL, RPC,
  configuration, contact or conversation mutation is exposed.
- Tool selection is deterministic from the validated Phase 6.3 plan. The model
  is not involved in execution at all: the tool module imports no provider and
  cannot call one. Nothing executes unless `requiresClarification` is false,
  `nextStep` is `ready_for_tool`, and the action maps to a tool.
- Argument schemas are strict Zod objects. `organizationId`, `contactId`,
  `conversationId`, provider credentials and status values are not accepted
  from any caller; they are derived server-side. The organization always comes
  from the session through `requireDomainOrganization()`.
- Ownership is re-verified against live data before any mutation: the
  conversation is reloaded through the organization-scoped repository and the
  contact must still match, so stale context cannot act.
- Appointment references resolve deterministically from pending and confirmed
  appointments belonging to the trusted contact, matched on organization-local
  date and time. Zero matches return `not_found`, several return `ambiguous`,
  and neither executes anything. No identifier is ever supplied by a model.
- All four tools delegate to the authoritative Phase 4 operations, so
  availability, business hours, blocked periods, conflict detection, timezone
  handling, terminal-state rules and concurrency are reused rather than
  reimplemented. Cancellation uses the dedicated `cancelAppointment` boundary,
  never a generic update.
- Results use one discriminated contract of `success`, `not_executed`,
  `not_found`, `ambiguous`, `rejected` and `failed`. Only an allowlist of safe
  domain codes is surfaced; anything else collapses to `failed`/`unavailable`,
  so database, SQL and infrastructure detail cannot leak. Query output is
  bounded and mapped, never raw rows.
- A tool failure never triggers another tool.
- No response generation and no webhook wiring: the pipeline stops at a
  structured tool result.

Deployment verification still pending for Phase 6: live OpenAI classification
and live Meta end-to-end delivery, both recorded as deployment verification
rather than implementation gaps.

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
| 2026-08-18 | Phase 6.1 intent detection      |           286 passed |    75 passed |  Not run | Passed    | Passed, 50 warnings | Passed       | Complete                             |
| 2026-08-18 | Phase 6.2 conversation state    |           323 passed |    83 passed |  Not run | Passed    | Passed, 59 warnings | Passed       | Complete                             |
| 2026-08-18 | Phase 6.3 scheduling dialogue   |           385 passed |    87 passed |  Not run | Passed    | Passed, 63 warnings | Passed       | Complete                             |
| 2026-08-18 | Phase 6.4 tool calling          |           438 passed |    96 passed |  Not run | Passed    | Passed, 73 warnings | Passed       | Phase 6 core complete                |

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
