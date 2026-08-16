# Architecture Overview

## Phase 1: Foundation

This document describes the Phase 1 foundation architecture of the AI Customer Operations Platform.

## High-Level Design

The platform uses a **modular monolith** architecture, designed to scale without requiring microservices until necessary.

### Architecture Principles

1. **Modular Monolith**: Single deployable unit with clear feature boundaries
2. **Multi-Tenant Ready**: Foundation supports multiple organizations
3. **Extensible**: Easy to add new features and integrations
4. **Type-Safe**: TypeScript strict mode throughout
5. **Testable**: Clear separation of concerns for testing
6. **Secure-First**: Security considerations built into the foundation

## Technology Stack

### Frontend

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **Runtime**: React 18

### Backend

- **Runtime**: Node.js (via Next.js)
- **API Routes**: Next.js Route Handlers
- **Server Components**: React Server Components
- **Server Actions**: Selective use for mutations

### Database & Services (Phase 2+)

- **Database**: Supabase PostgreSQL
- **Authentication**: Supabase Auth
- **Validation**: Zod

### Development & Testing

- **Testing Framework**: Vitest (unit tests)
- **E2E Testing**: Playwright
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier
- **CI/CD**: GitHub Actions

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
├── supabase/                 # Supabase client setup (Phase 2)
├── auth/                     # Authentication utilities (Phase 2)
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

## Phase 1 Scope

This foundation establishes:

✅ Project structure and organization
✅ TypeScript strict mode setup
✅ Build pipeline (development and production)
✅ Testing infrastructure
✅ Component foundation
✅ Layout foundation
✅ Documentation structure

⏸️ **NOT included in Phase 1:**

- Authentication system
- Database schema
- API endpoints
- WhatsApp integration
- AI assistants
- Appointment management
- Billing system

## Development Environment

### Required Setup

```bash
npm install                   # Install dependencies
npm run dev                   # Start development server
npm run lint                  # Run linting
npm run typecheck            # TypeScript type checking
npm test                     # Run unit tests
npm run test:e2e             # Run E2E tests
npm run build                # Production build
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
