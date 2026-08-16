# AI Customer Operations Platform — GitHub Copilot Instructions

## 1. PROJECT MISSION

We are building a production-grade, multi-tenant SaaS platform called:

AI Customer Operations Platform

Repository name:

whatsapp-ai-receptionist

The initial product is an AI receptionist/customer-operations platform using WhatsApp.

Initial target vertical:

- Clinics

Future verticals:

- Diagnostic laboratories
- Salons
- Spas
- Gyms
- Coaching businesses
- Consultants
- Service businesses
- Other appointment and lead-driven businesses

The architecture MUST be reusable across industries.

Do not hard-code clinic-specific business logic into the platform foundation.

The product should eventually support multiple organizations, locations, users, staff members, services, customers, conversations, appointments, AI assistants, integrations and subscriptions.

---

# 2. CURRENT DEVELOPMENT PHASE

We are currently in:

PHASE 1 — PLATFORM FOUNDATION

Only implement the foundation.

Phase 1 includes:

- Next.js application setup
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase integration
- Supabase Auth
- Authentication/session foundation
- Protected dashboard
- Organization foundation
- Basic role foundation
- Basic application layout
- Environment configuration
- Error handling foundation
- Validation foundation
- Testing foundation
- GitHub Actions CI
- Documentation
- Security foundation

DO NOT implement these yet:

- WhatsApp integration
- WhatsApp webhook
- OpenAI integration
- AI assistant
- AI tools
- Appointment scheduling
- Appointment availability
- Appointment booking
- Billing
- Razorpay
- Subscription management
- Advanced analytics
- Industry-specific workflows
- Microservices
- Kubernetes
- Kafka
- Redis
- Complex event infrastructure

Do not create fake implementations of future functionality.

Do not create fake appointment statistics or fake WhatsApp statistics.

---

# 3. TECHNOLOGY STACK

Use the following stack:

Frontend:

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

Backend:

- Next.js Server Components
- Next.js Route Handlers
- Server Actions only where appropriate

Database:

- Supabase PostgreSQL

Authentication:

- Supabase Auth

Supabase integration:

- @supabase/supabase-js
- @supabase/ssr

Validation:

- Zod

Testing:

- Vitest
- Playwright

Code quality:

- ESLint
- Prettier
- TypeScript strict mode

CI/CD:

- GitHub Actions

Use current stable versions that are compatible with one another.

Do not add unnecessary dependencies.

Before adding a dependency, determine whether the existing stack already provides the required functionality.

---

# 4. ARCHITECTURE PRINCIPLES

Use a modular monolith architecture.

Do NOT create microservices.

The initial architecture should be simple, secure, maintainable and extensible.

The system should be capable of growing into a larger SaaS product without requiring a complete rewrite.

Preferred high-level structure:

app/
components/
features/
lib/
types/
supabase/
tests/
docs/

Business domains should eventually be organized under:

features/
organizations/
customers/
conversations/
appointments/
services/
staff/
knowledge-base/
ai/
whatsapp/
notifications/
billing/
analytics/

Only implement the Phase 1 domains now.

---

# 5. TYPESCRIPT STANDARDS

TypeScript strict mode is mandatory.

Rules:

- Do not use `any`.
- Do not disable strict TypeScript settings.
- Define explicit types for important domain objects.
- Prefer type inference when it improves readability.
- Avoid duplicated types.
- Keep database types synchronized with Supabase.
- Use discriminated unions where appropriate.
- Use typed error handling where appropriate.

Never use:

```ts
// @ts-ignore
```
