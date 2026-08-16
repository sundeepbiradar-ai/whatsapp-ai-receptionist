# Database Foundation

## Phase 2.2 Scope

The platform uses Supabase PostgreSQL, with Supabase Auth remaining the source
of truth for authenticated users. This milestone creates only the initial
multi-tenant foundation:

- `public.profiles`
- `public.organizations`
- `public.organization_members`

The migration is
[`20260816000000_create_multi_tenant_foundation.sql`](../../supabase/migrations/20260816000000_create_multi_tenant_foundation.sql).

No authentication workflow, business-domain tables, seed data, or service-role
operations are included.

## Tenant Model

**`organization_id` is the primary tenant isolation boundary for
organization-owned data.**

Every future organization-owned entity, including customers, conversations,
appointments, services, staff, knowledge-base records, notifications, and
analytics records, must contain:

```sql
organization_id uuid not null
```

unless a documented architectural reason requires otherwise. `user_id` identifies
an actor or relationship; it is not the tenant boundary.

## Tables

### `public.profiles`

Application-level information associated with one authenticated user.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | Primary key; references `auth.users(id)` with `on delete cascade` |
| `created_at` | `timestamptz` | Required; UTC database default |
| `updated_at` | `timestamptz` | Required; UTC database default and update trigger |

Authentication credentials and secrets are never duplicated here.

### `public.organizations`

The tenant record.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | Primary key; `gen_random_uuid()` default |
| `name` | `text` | Required; trimmed length 1-200 |
| `slug` | `text` | Required, unique, lowercase URL-safe format, length 1-100 |
| `created_at` | `timestamptz` | Required; UTC database default |
| `updated_at` | `timestamptz` | Required; UTC database default and update trigger |

Organization names are not unique. The slug is the unique human-readable
application identifier.

### `public.organization_members`

Associates an authenticated Supabase user with an organization and a constrained
role.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | Primary key; `gen_random_uuid()` default |
| `organization_id` | `uuid` | Required; references `organizations(id)` with `on delete cascade` |
| `user_id` | `uuid` | Required; references `auth.users(id)` with `on delete cascade` |
| `role` | `organization_role` | Required; defaults to `member` |
| `created_at` | `timestamptz` | Required; UTC database default |
| `updated_at` | `timestamptz` | Required; UTC database default and update trigger |

The unique constraint on `(organization_id, user_id)` prevents duplicate
membership records.

## Relationships

```text
auth.users 1 ---- 0..1 public.profiles
auth.users 1 ---- many public.organization_members
public.organizations 1 ---- many public.organization_members
```

Deleting an Auth user cascades to their profile and memberships. Deleting an
organization cascades to its membership rows.

## Role Model

The `public.organization_role` PostgreSQL enum currently contains exactly:

- `owner`
- `admin`
- `member`

An enum is used because the initial role set is small and strongly constrained.
Future role expansion should add deliberate enum values through a reviewed
migration; a complex permission system is intentionally deferred.

## RLS Strategy

RLS is enabled on all three tables. Policies target the `authenticated` role;
unauthenticated requests have no matching policies and are denied.

The migration grants the Data API table privileges explicitly to `anon` and
`authenticated` so requests reach RLS regardless of the project's automatic
table-exposure setting. It grants table privileges to `service_role` only for
fixture setup/cleanup and trusted server operations; those privileges are never
used for authorization assertions.

### Profiles

- `SELECT`: only the profile where `id = auth.uid()`.
- `INSERT`: only a profile where `id = auth.uid()`.
- `UPDATE`: only the authenticated user's own profile.
- `DELETE`: explicitly denied; account deletion belongs to a trusted workflow.

### Organizations

- `SELECT`: only when the caller belongs to the organization.
- `INSERT`, `UPDATE`, `DELETE`: explicitly denied to direct clients.

### Organization memberships

- `SELECT`: only for organizations where the caller is a member.
- `INSERT`, `UPDATE`, `DELETE`: explicitly denied to direct clients.

The initial organization-creation and membership-provisioning workflow therefore
requires a future trusted server-side implementation. This avoids allowing a
client to create an organization without a controlled owner assignment or to
promote itself to `owner`.

## RLS Helper Function

`public.is_organization_member(uuid, uuid)` is a minimal `SECURITY DEFINER`
function used by organization and membership SELECT policies. It:

- checks only whether a membership exists;
- qualifies `public.organization_members` explicitly;
- fixes `search_path` to an empty path because all referenced objects are schema-qualified;
- returns no row data or privileged mutation capability;
- revokes public execution and grants execution only to `authenticated`.

The function is required to avoid recursive RLS evaluation when a policy on
`organization_members` needs to check membership in `organization_members`.

## Constraints and Indexes

The migration provides:

- primary-key indexes on all three `id` columns;
- a unique index for `organizations.slug`;
- a unique composite index/constraint for `organization_members(organization_id, user_id)`;
- an index on `organization_members.organization_id`;
- an index on `organization_members.user_id`;
- slug format, lowercase, and length validation;
- organization name length validation;
- foreign keys to `auth.users` and `public.organizations`.

The explicit foreign-key indexes support membership lookups and future tenant
queries; no speculative indexes are included.

## Timestamp Strategy

All timestamps use `timestamptz` with database `now()` defaults. The reusable
`public.set_updated_at()` trigger function updates `updated_at` on each row
update. It is `SECURITY INVOKER` and uses a fixed `pg_catalog` search path.

## Security Test Scenarios

The unit suite verifies the migration contract statically without fake data or
production credentials. Real RLS behavior must be tested with a local Supabase
instance or a dedicated non-production Supabase project using two Auth users:

1. User A belongs to Organization A; User B belongs to Organization B.
2. User A cannot read Organization B.
3. User B cannot read Organization A.
4. User A cannot modify Organization B.
5. A normal member cannot promote itself to owner.
6. Duplicate organization membership is rejected by the unique constraint.
7. Duplicate organization slugs are rejected by the unique constraint.
8. Unauthenticated access is denied by RLS.

The current environment has Docker but no Supabase CLI or linked project, so live
RLS integration tests were not run. No credentials were invented or added.

## Runtime RLS Verification Procedure

The repository does not currently have a Supabase CLI, PostgreSQL client, local
Supabase stack, or linked project. Docker alone is not sufficient because the
tests require Supabase Auth, `auth.uid()`, JWT roles, and the `authenticated`
database role. Do not substitute a plain PostgreSQL container.

Use a disposable, dedicated non-production Supabase project. Never use a
production project or production credentials.

### 1. Apply the migration

Using the dedicated project's SQL Editor, run the complete migration file. If
the Supabase CLI is installed separately, the equivalent commands are:

```bash
supabase login
supabase link --project-ref <dedicated-test-project-ref>
supabase db push
```

### 2. Set test-only environment variables

Create an ignored `.env.test.local` file or export these variables in the shell:

```bash
SUPABASE_TEST_URL=https://<dedicated-test-project>.supabase.co
SUPABASE_TEST_ANON_KEY=<dedicated-test-project-anon-key>
SUPABASE_TEST_SERVICE_ROLE_KEY=<dedicated-test-project-service-role-key>
```

`SUPABASE_TEST_SERVICE_ROLE_KEY` is used only by setup and cleanup calls to
create/delete ephemeral users and fixtures. All RLS assertions use separate
clients authenticated with `SUPABASE_TEST_ANON_KEY` as User A or User B. The
service-role client is never used for an authorization assertion.

### 3. Execute the harness

```bash
npm run test:integration
```

The harness creates two ephemeral users, two organizations, two memberships,
and two profiles. It verifies tenant reads, membership reads, cross-tenant
mutations, role escalation, profile isolation, anonymous access, duplicate
slugs, and duplicate memberships.

### 4. Cleanup

The harness deletes both organizations and both Auth users in `afterAll`. The
organization delete cascades memberships, and Auth-user deletion cascades
profiles. If a run is interrupted, use the dedicated project's dashboard to
remove only the `rls-a-*`/`rls-b-*` fixtures and the matching `rls-a-*`/`rls-b-*`
Auth users, or discard the disposable project. Never run broad cleanup against
production.

## Future Extension Strategy

Future domain tables should:

1. add `organization_id uuid not null`;
2. index `organization_id` when queried by tenant;
3. enable RLS in the same migration that creates the table;
4. use membership helper functions or carefully designed non-recursive helpers;
5. define explicit SELECT, INSERT, UPDATE, and DELETE policies;
6. avoid direct dependence on user ownership as a substitute for tenancy.

No ORM, second database, service-role client, or bypass of RLS is part of this
architecture.
