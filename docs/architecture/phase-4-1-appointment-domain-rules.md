# Phase 4.1 — Appointment Domain Rules

This document records the appointment behavior implemented by Phase 3 and the
final decisions required before the future appointment engine is built. It does
not implement availability, conflict detection, scheduling, WhatsApp, or AI.

## 1. Appointment Entity Rules

An appointment has:

- one required `organization_id` tenant owner;
- one required `contact_id`;
- one optional `conversation_id`;
- one required `status`;
- required `starts_at` and `ends_at` timestamps;
- optional `notes`;
- database-managed `id`, `created_at`, and `updated_at` values.

The database default status is `pending`. Appointment IDs are UUIDs.

## 2. Time Rules

- Start time is required.
- End time is required.
- `ends_at` must be strictly later than `starts_at`.
- Equal start and end times are rejected by both domain validation when both
  update values are supplied and the database check constraint.
- Zero-duration appointments are not allowed.
- The current code does not reject past start or end times. Creation and update
  of past appointments are therefore currently permitted. Final policy: normal
  appointment creation must reject a past start time. Limited historical edits
  such as notes and status may be allowed, but schedule, contact, and
  conversation changes are not allowed after the appointment has started.
- Timestamps are accepted as offset-aware ISO datetime strings and stored as
  `timestamptz` values.

For partial updates, the update schema checks the range when both timestamps
are supplied; the database check remains authoritative for the resulting row.

## 3. Status/State Rules

The database enum and validation schemas currently allow exactly:

- `pending`
- `confirmed`
- `cancelled`
- `completed`

There is currently no domain transition matrix. Create and update operations
accept any of these values, so every enum-to-enum change is currently
supported at the repository boundary. The detail UI offers cancellation only
when the current status is neither `cancelled` nor `completed`; this is a UI
condition, not a repository or database transition rule.

The final transition policy is an explicit matrix for normal workflows:

| Current status | Allowed next statuses |
| --- | --- |
| `pending` | `confirmed`, `cancelled` |
| `confirmed` | `completed`, `cancelled` |
| `cancelled` | None |
| `completed` | None |

Exceptional audited administrative overrides may be permitted when required.

No additional statuses may be added as part of Phase 4.1.

## 4. Relationship Rules

- An organization can own many appointments.
- Every appointment belongs to exactly one organization.
- Every appointment must reference a contact in the same organization.
- A conversation reference is optional and may be null.
- When supplied, a conversation must belong to the same organization as the
  appointment.
- A conversation itself must reference a same-organization contact.
- The current appointment schema does **not** require the appointment contact
  and the conversation contact to be the same contact. This is unresolved and
  must not be assumed by future work.
- Deleting an organization cascades to its appointments. Deleting an
  appointment's contact cascades to the appointment. Deleting its conversation
  sets `conversation_id` to null.

## 5. Authorization/Tenant Rules

- Server-side appointment repositories require authentication and a current
  organization context.
- The repository derives `organization_id` from that context; callers do not
  supply it as appointment input.
- List, get, create, and update repository queries are scoped by the current
  `organization_id`.
- Appointment table RLS is enabled. Authenticated members may select, insert,
  update, or delete rows only when `is_organization_member(organization_id,
  auth.uid())` is true. Anonymous callers have no matching appointment policy.
- Composite foreign keys and RLS prevent cross-organization appointment,
  contact, and conversation access or relationships.
- A cross-organization read or update through the repository resolves as
  `Appointment not found`; direct RLS queries generally return no rows or a
  database error depending on the operation.
- There is no appointment delete repository or server action. The database
  has a delete policy, but the application does not expose appointment
  deletion.

## 6. Create/Update/Cancel Rules

### Create

Creation requires a valid contact UUID, valid start and end timestamps, and a
strictly positive duration. Conversation, status, and notes are optional in
input; status defaults to `pending`, and absent relationships/notes become
null. The database independently verifies tenant relationships and time
ordering.

### Update

The current update schema permits changing any supplied subset of:

- `start` (`startsAt`)
- `end` (`endsAt`)
- contact
- conversation, including clearing it to null
- notes, including clearing them to null
- status

At least one field is required. There are no current rules preventing edits to
cancelled or completed appointments, and no transition-specific restrictions.
Final policy: cancelled and completed appointments are terminal for normal
workflows. Normal editing and reopening are not allowed. Exceptional corrections
and reopening require a separate audited administrative workflow.

### Cancel

Cancellation is a status update to `cancelled`; it does not delete the row.
The detail page presents this action only for appointments that are not
already cancelled or completed. The server action ultimately uses the general
status update path, so direct calls can currently request any valid status.

## 7. Validation and Error Behavior

- Invalid UUIDs, timestamps, enum values, missing required create fields, empty
  update input, invalid time ordering, and overlong notes fail Zod validation
  and become `DomainError` with code `invalid_input`.
- Missing authenticated user or current organization fails with
  `unauthenticated` or `no_organization`.
- A valid ID that is not visible in the current organization becomes
  `DomainError('not_found', 'Appointment not found.')` for get/update.
- Database constraint, foreign-key, RLS, and time-check failures are mapped to
  the generic `database_error` message. The generic duplicate-key mapping is
  named `duplicate_contact`, even though appointment operations can also pass
  through that mapper; this is an error-contract inconsistency to revisit.
- Server actions return a user-safe error string and redirect after success.
  The appointment pages convert missing or inaccessible records to 404 and
  redirect unauthenticated/no-organization users to the appropriate setup
  route.

Final error policy: use typed, stable domain errors for user-correctable
appointment failures, with safe user-facing messages and detailed server-side
logging for underlying failures. This includes invalid time ranges, invalid
contact/conversation relationships, and invalid status transitions. Unexpected
infrastructure/database failures remain generic to users.

## 8. Final Decisions

The following decisions are approved for the appointment engine:

1. Normal creation rejects past appointments. Limited historical edits may
  change notes and status, but not schedule, contact, or conversation after the
  appointment has started.
2. Normal status transitions use the explicit matrix above. Exceptional audited
  administrative overrides may be permitted.
3. Cancelled and completed appointments are terminal in normal workflows. No
  normal editing or reopening is allowed; exceptional corrections and
  reopening require a separate audited administrative workflow.
4. When supplied, an appointment conversation must reference the same contact
  as the appointment.
5. Physical deletion is not available in normal workflows. Controlled
  administrative, privacy, or retention deletion may be introduced only if
  required.
6. Cancellation rules are:

  | Transition | Allowed |
  | --- | --- |
  | `pending` -> `cancelled` | Yes |
  | `confirmed` -> `cancelled` | Yes |
  | `cancelled` -> `cancelled` | No |
  | `completed` -> `cancelled` | No |
  | Past `pending`/`confirmed` -> `cancelled` | Yes, for reconciliation |

7. Appointment-specific user-correctable failures use typed, stable domain
  errors with safe user messages and detailed server-side logging. Unexpected
  infrastructure/database failures remain generic to users.

## 9. Rules for Phase 4.2–4.10

Future appointment work must:

- preserve organization scoping in server code and RLS;
- preserve required same-organization contact ownership;
- preserve optional conversation semantics until the contact-link decision is
  made;
- preserve strict `ends_at > starts_at` validation;
- use only the four current statuses until an explicit status decision and
  migration is approved, and enforce the approved normal-workflow transition
  matrix;
- treat cancellation as a state change, not deletion, unless an explicit
  controlled administrative/privacy/retention policy applies;
- reject normal creation of past appointments and restrict edits to historical
  records according to the approved limited-edit policy;
- treat cancelled and completed appointments as terminal in normal workflows;
- require a supplied conversation to belong to the appointment's contact;
- allow cancellation only according to the approved cancellation matrix,
  including reconciliation of past pending/confirmed appointments;
- use typed stable errors for user-correctable appointment failures and safe
  generic messages for unexpected infrastructure failures;
- keep invalid operations tenant-safe and avoid exposing database internals;
- add tests for every newly decided rule before relying on it in downstream
  appointment features.