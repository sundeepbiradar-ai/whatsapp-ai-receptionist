# AI Customer Operations Platform

> Multi-tenant SaaS platform for AI-powered customer operations and WhatsApp AI receptionist

## Overview

**AI Customer Operations Platform** is a production-grade, multi-tenant SaaS application built with Next.js, TypeScript, and Supabase. Initially targeting clinics, the architecture is designed to scale across multiple industries including diagnostic labs, salons, spas, gyms, coaching businesses, and consulting services.

**Current Phase**: Phase 1 — Foundation

## Quick Start

### Prerequisites

- Node.js 18+ (latest LTS recommended)
- npm or pnpm
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/sundeepbiradar-ai/whatsapp-ai-receptionist.git
cd whatsapp-ai-receptionist

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the application.

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run format       # Format code with Prettier
npm run typecheck    # TypeScript type checking
npm test             # Run unit tests with Vitest
npm run test:ui      # Run tests with UI
npm run test:e2e     # Run E2E tests with Playwright
npm run test:e2e:ui  # Run E2E tests with UI
```

## Project Structure

```
ai-customer-operations-platform/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes (Phase 2+)
│   ├── dashboard/                # Dashboard pages (Phase 2+)
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page
│   └── globals.css              # Global styles
├── components/                   # Reusable UI components
│   ├── ui/                       # Base UI components
│   ├── layout/                   # Layout components
│   └── auth/                     # Auth components (Phase 2+)
├── features/                     # Business domain features
│   ├── organizations/            # Organization management
│   ├── customers/                # Customer management
│   └── conversations/            # Conversation management
├── lib/                          # Utilities and helpers
│   ├── supabase/                 # Supabase client (Phase 2+)
│   ├── auth/                     # Auth utilities (Phase 2+)
│   └── utils/                    # Generic utilities
├── types/                        # TypeScript type definitions
├── supabase/                     # Supabase configuration
│   └── migrations/               # Database migrations (Phase 2+)
├── tests/                        # Test files
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests (Phase 2+)
│   └── e2e/                      # E2E tests
├── docs/                         # Documentation
│   ├── architecture/             # Architecture docs
│   ├── database/                 # Database docs
│   └── security/                 # Security docs
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── next.config.ts                # Next.js configuration
├── tailwind.config.ts            # Tailwind CSS configuration
├── eslint.config.mjs             # ESLint configuration
├── prettier.config.json          # Prettier configuration
├── vitest.config.ts              # Vitest configuration
├── playwright.config.ts          # Playwright configuration
└── .env.example                  # Environment variables template
```

## Technology Stack

### Frontend

- **Next.js 15** - React framework with App Router
- **React 18** - UI library
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - High-quality React components

### Backend

- **Next.js Route Handlers** - API endpoints (Phase 2+)
- **Server Components** - React Server Components
- **Server Actions** - Server-side mutations (Phase 2+)

### Database & Auth (Phase 2+)

- **Supabase** - PostgreSQL database + authentication
- **Supabase Auth** - Authentication system
- **PostgreSQL** - Relational database

### Development & Testing

- **TypeScript** - Strict type checking
- **Vitest** - Unit test framework
- **Playwright** - E2E testing framework
- **ESLint** - Code linting
- **Prettier** - Code formatting

### DevOps & CI/CD

- **GitHub Actions** - CI/CD pipeline
- **Docker** - Containerization (Phase 2+)

## Phase 1 — Foundation (Current)

✅ **Completed**:

- Next.js App Router setup
- TypeScript strict mode configuration
- Tailwind CSS integration
- shadcn/ui foundation
- ESLint and Prettier setup
- Project structure and organization
- Testing infrastructure (Vitest + Playwright)
- Documentation structure
- Landing page and dashboard foundation
- Security foundation

⏸️ **Not Included**:

- Supabase authentication
- Database schema
- WhatsApp integration
- AI assistant
- Appointment management
- Billing system
- Real metrics or data

## Development Guidelines

### Code Standards

- **TypeScript Strict Mode**: All code must be type-safe
- **No `any` Types**: Explicit types required
- **ESLint**: All warnings must be addressed
- **Prettier**: Code must be formatted

### Component Development

- Keep components small and focused
- Use composition over inheritance
- Extract reusable logic to hooks (Phase 2+)
- Add PropTypes or TypeScript interfaces

### Testing

- Write tests for utilities and helpers
- E2E tests for critical user flows
- Aim for >80% code coverage
- No tests for authentication (Phase 2+)

### Git Workflow

- Create feature branches from `main`
- Write descriptive commit messages
- Submit pull requests for code review
- Ensure CI/CD passes before merging

## Documentation

- [Architecture Overview](docs/architecture/overview.md)
- [Security Model](docs/security/security-model.md)
- [Database Schema](docs/database/README.md)

## Environment Variables

See `.env.example` for all available environment variables.

```bash
# Copy template
cp .env.example .env.local

# Add your configuration
# Note: Public variables are safe to expose
# Server-only variables (DATABASE_URL, etc.) are never public
```

## Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Security

- TypeScript strict mode enabled
- ESLint security rules enforced
- Environment variables validated
- No hardcoded secrets
- Secure defaults for all configurations

See [Security Model](docs/security/security-model.md) for detailed security information.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Roadmap

### Phase 1 ✅ Foundation (Current)

- Project setup and structure
- Component foundation
- Testing infrastructure

### Phase 2 🔄 Authentication & Database

- Supabase authentication
- Database schema and migrations
- User and organization management
- Protected routes and middleware

### Phase 3 🔄 WhatsApp Integration

- WhatsApp API integration
- Message routing
- Conversation management
- Webhook handling

### Phase 4 🔄 AI Assistant

- OpenAI integration
- AI assistant configuration
- Prompt management
- Context management

### Phase 5+ 🔄 Advanced Features

- Appointment scheduling
- Billing and subscriptions
- Advanced analytics
- Integrations framework

## Support

For issues and questions:

- GitHub Issues: [Create an issue](https://github.com/sundeepbiradar-ai/whatsapp-ai-receptionist/issues)
- Documentation: See [docs/](docs/) folder

## License

MIT License - see LICENSE file for details

## Acknowledgments

Built with:

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Playwright](https://playwright.dev/)
- [Vitest](https://vitest.dev/)

---

**AI Customer Operations Platform** © 2025 — Building the future of customer operations.
