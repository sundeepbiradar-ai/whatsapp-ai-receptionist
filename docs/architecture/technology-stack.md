# Technology Stack

## 1. Application stack

| Area                   | Technology                             | Current use                                                                      |
| ---------------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| Language               | TypeScript, strict mode                | Application, domain, tests, generated database types.                            |
| Web framework          | Next.js 16.3.1                         | App Router, Server Components, Route Handlers, middleware, production build.     |
| UI runtime             | React 18.3.1                           | Server-rendered pages and client forms/components.                               |
| Styling                | Tailwind CSS 3.4.x                     | Utility styling and responsive dashboard UI.                                     |
| Components             | shadcn/ui foundation and Lucide icons  | Reusable interface components and icons.                                         |
| Validation             | Zod 4                                  | Request, domain, AI output, and environment contracts.                           |
| Auth                   | Supabase Auth with `@supabase/ssr`     | Session handling, cookies, callback flow, user identity.                         |
| Database               | Supabase PostgreSQL                    | Tenant data, constraints, RLS, RPCs, Vault integration, cron substrate.          |
| Database client        | `@supabase/supabase-js`                | Browser, SSR, and restricted service-side access.                                |
| Server boundary        | `server-only`                          | Prevents secrets and privileged modules entering client bundles.                 |
| Provider               | Meta WhatsApp Cloud API                | Webhook, text sending, and delivery status callbacks.                            |
| AI provider            | OpenAI-compatible server API           | Intent classification and bounded extraction; optional by environment.           |
| Unit/integration tests | Vitest                                 | Fast contracts, domain, security, pipeline, reliability, and integration suites. |
| Browser tests          | Playwright                             | End-to-end authenticated/operator workflows.                                     |
| Static quality         | ESLint, Prettier, TypeScript           | Lint, formatting, and compile-time quality gates.                                |
| CI/CD                  | GitHub Actions                         | Build/test job and fresh local Supabase integration/RLS job.                     |
| Package manager        | npm with lockfile                      | Reproducible installs via `npm ci`.                                              |
| Hosting                | Next.js-compatible deployment platform | Platform choice remains deployment-specific.                                     |

## 2. Runtime topology

- **Browser:** receives public application code and public Supabase configuration only.
- **Next.js runtime:** executes pages, actions, route handlers, auth context, domain services, and provider calls.
- **Supabase:** provides Auth, PostgreSQL, RLS, Vault, `pg_cron`, and `pg_net`.
- **External providers:** Meta receives signed webhook responses and outbound API requests; OpenAI receives only the bounded AI request when configured.

## 3. Dependency rules

- Prefer existing platform APIs and local modules before adding a dependency.
- Keep provider adapters behind server-only boundaries.
- Use Zod for external and domain contracts.
- Do not introduce an ORM, second database, message broker, Redis, or microservice without an approved architecture change.
- Keep generated database types synchronized with migrations.
- Never use `any`, `@ts-ignore`, or client-provided tenant IDs for authorization.

## 4. Environment configuration

### Public and required

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

### Server-only and required in production

- `SUPABASE_SERVICE_ROLE_KEY`

### Server-only and optional

- `OPENAI_API_KEY`: absent means intent is `unknown` and clarification is required.
- `OPENAI_INTENT_MODEL`: optional model override.
- `WHATSAPP_RETRY_WORKER_SECRET`: absent disables the internal retry route.

### Test-only

- `SUPABASE_TEST_URL`
- `SUPABASE_TEST_ANON_KEY`
- `SUPABASE_TEST_SERVICE_ROLE_KEY`

WhatsApp access tokens, app secrets, verify tokens, retry-worker URL, and the Vault copy of the worker secret are managed in Supabase Vault and are not environment variables or client fields.

Validate the contract with:

```bash
npm run verify:env
```

The command prints names and warnings, never secret values.

## 5. Security technology controls

- PostgreSQL RLS on all public tables.
- No client policies on secret references and retry jobs.
- Fixed `search_path` on `SECURITY DEFINER` functions.
- No public execute grant on privileged functions.
- HMAC validation for Meta webhook requests.
- Timing-safe bearer comparison for the retry worker.
- Strict security headers and `poweredByHeader: false`.
- HTTPS and secure cookies in production.
- Zod validation and typed safe error mapping.
- No service-role key in browser code.

CSP is intentionally not configured until the hosting platform's per-request nonce strategy is selected. Edge rate limiting is also a deployment requirement, not an in-process application feature.

## 6. Quality gates

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:integration
npm run test:e2e
```

CI automatically runs lint, typecheck, unit tests, build, and a fresh local Supabase migration plus integration/RLS suite. E2E execution may require the configured browser environment and test data.

## 7. Version and compatibility notes

- Use the Node.js version defined by CI, currently Node 22.x.
- Install with `npm ci` so `package-lock.json` remains authoritative.
- Review the repository's `AGENTS.md` and the installed Next.js documentation before changing Next.js APIs.
- Apply migrations in timestamp order.
- Regenerate Supabase TypeScript types after schema changes.
