# Architecture Overview

## Phase 1 & 2.1: Foundation and Supabase Setup

This document describes the architecture of the AI Customer Operations Platform after Phase 1 (Foundation) and Phase 2.1 (Supabase Foundation).

## High-Level Design

The platform uses a **modular monolith** architecture, designed to scale without requiring microservices until necessary.

### Architecture Principles

1. **Modular Monolith**: Single deployable unit with clear feature boundaries
2. **Multi-Tenant Ready**: Foundation supports multiple organizations
3. **Extensible**: Easy to add new features and integrations
4. **Type-Safe**: TypeScript strict mode throughout
5. **Testable**: Clear separation of concerns for testing
6. **Secure-First**: Security considerations built into the foundation
7. **Client-Server Separation**: Strict boundaries between browser and server code

## Technology Stack

### Frontend

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui (foundation ready)
- **Runtime**: React 18

### Backend

- **Runtime**: Node.js (via Next.js)
- **API Routes**: Next.js Route Handlers
- **Server Components**: React Server Components
- **Server Actions**: Selective use for mutations

### Database & Services

**Phase 2.1 (Current):**
- **Database**: Supabase PostgreSQL (configured but no schema yet)
- **Authentication**: Supabase Auth (foundation only, not yet implemented)
- **Client Libraries**: @supabase/supabase-js, @supabase/ssr
- **Validation**: Zod (ready for Phase 2.2+)

**Phase 2.2+:**
- Database schema and migrations
- Row-Level Security (RLS) policies
- Authentication implementation
- Authorization framework

### Development & Testing

- **Testing Framework**: Vitest (unit tests)
- **E2E Testing**: Playwright
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier
- **CI/CD**: GitHub Actions

### Security & Infrastructure

- **Environment Secrets**: Managed via environment variables
- **HTTP-Only Cookies**: Session management
- **Public vs Private Keys**: Strict separation
- **Row-Level Security**: For multi-tenant data isolation (Phase 2.2+)

## Supabase Client Architecture (Phase 2.1)

### Browser Client

**Location:** `lib/supabase/client.ts`

- **Created with:** `@supabase/ssr` createBrowserClient
- **Keys Used:** NEXT_PUBLIC_SUPABASE_ANON_KEY (public, safe to expose)
- **Usage:** Client components with `"use client"` directive
- **Session Management:** Automatic via HTTP-only cookies
- **Security:** Row-Level Security (RLS) policies enforce data access

```typescript
"use client";
import { supabase } from "@/lib/supabase/client";

export function MyComponent() {
  // Use browser client for client-side operations
  const { data } = await supabase.from("users").select("*");
}
```

### Server Client

**Location:** `lib/supabase/server.ts`

- **Created with:** `@supabase/ssr` createServerClient
- **Keys Used:** NEXT_PUBLIC_SUPABASE_ANON_KEY (same public key)
- **Usage:** Server components, Server Actions, Route Handlers
- **Session Management:** Automatic via cookies() from next/headers
- **Security:** RLS policies still apply (no elevated privileges)

```typescript
import { getServerSupabaseClient } from "@/lib/supabase/server";

export async function MyServerComponent() {
  const supabase = await getServerSupabaseClient();
  const { data } = await supabase.from("users").select("*");
}
```

### Key Security Points

1. **No Service-Role Key in Application**
   - Service-role key is NOT used in Phase 2.1
   - Only public anon key is used for browser and server clients
   - Service-role key reserved for admin operations (future)

2. **Environment Variables**
   - `NEXT_PUBLIC_SUPABASE_URL` — Public, sent to browser
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public, sent to browser
   - `SUPABASE_SERVICE_ROLE_KEY` — Server-only (if needed in future)

3. **Client vs Server Boundaries**
   - Browser client cannot import server-only modules
   - Server modules can be used in Server Components and Actions
   - TypeScript ensures client/server separation

4. **RLS Policies (Phase 2.2+)**
   - All data access controlled via Row-Level Security
   - Policies automatically enforce multi-tenant isolation
   - No additional authorization logic needed for basic scenarios

## Organization and Tenant Context (Phase 2.4)

### Authentication Is Not Authorization

**AUTHENTICATION != TENANT AUTHORIZATION**

Supabase Auth establishes the identity of the current user. It does not grant
access to any organization. Organization authorization is determined by
`public.organization_members` and enforced by PostgreSQL Row-Level Security.

### Current Organization Resolution

The server-only abstraction at `lib/organizations/context.ts`:

1. obtains the user with Supabase Auth;
2. reads that user's membership rows through the anon-key SSR client;
3. reads only the organizations referenced by those membership rows;
4. relies on existing RLS for the final authorization boundary;
5. exposes the current organization, membership, and role as typed data.

The current organization is selected deterministically by the oldest membership
creation timestamp. No client-controlled organization ID is trusted, persisted,
or used as authorization. Organization switching is deferred to a future
milestone and must revalidate membership server-side.

Users with no memberships receive an explicit onboarding state:
`You don't belong to an organization yet.` No organization or membership is
created automatically.

Users with multiple memberships receive the authorized organization list and a
deterministic current organization. No switching or organization-management UI
is implemented in this phase.

The existing `owner`, `admin`, and `member` enum is exposed as the current
membership role. Roles are informational in this phase; RLS and database
constraints prevent client-side role escalation.

## Project Structure

```
app/                          # Next.js App Router
├── api/                      # API routes (Phase 2+)
├── dashboard/                # Dashboard pages (Phase 2+)
├── layout.tsx                # Root layout
├── page.tsx                  # Landing page
└── globals.css              # Global styles

components/                   # Reusable UI components
├── ui/                       # Base UI components (shadcn/ui)
├── layout/                   # Layout components (Header, Sidebar, etc.)
└── auth/                     # Auth-related components (Phase 2)

features/                     # Business domain features
├── organizations/            # Organization management
├── customers/                # Customer management
├── conversations/            # Conversation history
├── services/                 # Service management
├── staff/                    # Staff management
└── [other domains]/          # Future features

lib/                          # Utilities and helpers
├── supabase/                 # Supabase client setup (Phase 2.1)
│   ├── client.ts            # Browser client for client components
│   ├── server.ts            # Server client for server components
│   └── index.ts             # Client exports
├── auth/                     # Authentication utilities (Phase 2.2+)
└── utils/                    # Generic utility functions

types/                        # TypeScript type definitions
├── index.ts                  # Exported types
└── [domain].ts               # Domain-specific types

supabase/                     # Supabase configuration
├── migrations/               # Database migrations (Phase 2+)
└── README.md                 # Supabase setup guide

tests/                        # Test files
├── unit/                     # Unit tests
├── integration/              # Integration tests (Phase 2+)
└── e2e/                      # End-to-end tests (Playwright)

docs/                         # Documentation
├── architecture/             # Architecture documentation
├── database/                 # Database schema documentation
└── security/                 # Security documentation

Configuration Files:
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── next.config.ts            # Next.js configuration
├── tailwind.config.ts        # Tailwind CSS configuration
├── eslint.config.mjs         # ESLint configuration
├── prettier.config.json      # Prettier configuration
├── vitest.config.ts          # Vitest configuration
├── playwright.config.ts      # Playwright configuration
└── .env.example              # Environment variables template
```

## Data Flow (Future)

### Multi-Tenant Request Flow (Phase 2+)

1. Request arrives at Next.js App Router
2. Middleware identifies tenant (from subdomain or domain)
3. Authentication verified via Supabase Auth
4. Request authorized for tenant resources
5. Data accessed from tenant-isolated database schema
6. Response returned to client

### API Route Flow (Phase 2+)

1. Request to `/api/[feature]/[action]`
2. Server-side validation with Zod
3. Database operation via Supabase
4. Response sent with appropriate status code
5. Error handling returns typed error response

## Phase 1 & 2.1 Scope

**Phase 1 (Completed):**

✅ Project structure and organization
✅ TypeScript strict mode setup
✅ Build pipeline (development and production)
✅ Testing infrastructure (Vitest, Playwright)
✅ Component foundation
✅ Layout foundation
✅ Documentation structure
✅ Security foundation
✅ GitHub Actions CI/CD

**Phase 2.1 (Supabase Foundation - Current):**

✅ Supabase client libraries (@supabase/supabase-js, @supabase/ssr)
✅ Browser and server client separation
✅ Environment variable configuration
✅ Client/server boundaries and security
✅ TypeScript database types (placeholder)
✅ Supabase documentation
✅ Foundation tests

**NOT included in Phase 2.1:**

- Authentication implementation
- Database schema or migrations
- Row-Level Security (RLS) policies
- User registration or login UI
- Organization management tables
- Roles or permissions
- API endpoints
- WhatsApp integration
- AI assistants
- Appointment management
- Billing system

**Planned for Phase 2.2+:**

- Database schema and migrations
- RLS policies for multi-tenancy
- Authentication flow implementation
- User and organization management
- Authorization framework
- API endpoints

## Development Environment

### Required Setup

```bash
npm ci                        # Install dependencies with lock file
npm run dev                   # Start development server
npm run lint                  # Run linting
npm run typecheck            # TypeScript type checking
npm test                     # Run unit tests
npm run test:e2e             # Run E2E tests
npm run build                # Production build
```

### Environment Variables

```bash
# Copy template
cp .env.example .env.local

# Add your Supabase credentials:
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Development Server

- Runs on `http://localhost:3000`
- Hot module reloading enabled
- TypeScript errors displayed in terminal
- ESLint warnings shown

## Security Considerations (Phase 1)

1. **TypeScript Strict Mode**: No `any` types, full type safety
2. **Environment Variables**: Sensitive data in `.env.local`
3. **CORS**: Foundation for secure cross-origin requests (Phase 2)
4. **Input Validation**: Zod schema validation (Phase 2)
5. **Authentication**: Supabase Auth integration (Phase 2)
6. **Authorization**: Role-based access control foundation (Phase 2)

## Next Steps (Phase 2+)

Phase 2 will include:

- Supabase integration and authentication
- Database schema and migrations
- User and organization management
- Protected routes and middleware
- Role-based authorization
- API endpoint foundation

## References

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
