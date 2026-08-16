# Database Documentation

## Phase 1: Foundation

This directory is prepared for Phase 2+ database implementation.

## Overview

The AI Customer Operations Platform uses **Supabase PostgreSQL** for data persistence.

## Phase 1 Status

❌ **Not implemented in Phase 1**

- No Supabase integration
- No database schema
- No migrations
- No seed data

## Phase 2+ Implementation

### Database Setup

Supabase provides:

- PostgreSQL database hosting
- Authentication system
- Real-time subscriptions
- Storage for files
- Row-level security (RLS)

### Schema Design Principles

1. **Multi-Tenancy**: All tables include `tenant_id` for data isolation
2. **Audit Trail**: Track created_at, updated_at, created_by, updated_by
3. **Relationships**: Properly normalized with foreign keys
4. **Performance**: Indexes on common queries
5. **Type Safety**: PostgreSQL types match TypeScript types

### Planned Tables (Phase 2+)

```sql
-- Core multi-tenancy
organizations
users
user_roles
organization_members

-- Business logic
customers
conversations
appointments
services
staff_members

-- Future
integrations
ai_assistants
knowledge_base
subscriptions
billing_events
```

### Row-Level Security (Phase 2+)

All tables will use RLS policies to ensure:

- Users can only access their organization's data
- Admins can manage their organization
- No cross-tenant data leaks
- Automatic tenant isolation

### Migrations

Database migrations stored in `supabase/migrations/`:

- One migration per feature
- Timestamped for ordering
- Reversible with rollback support
- Version controlled in git

### Environment Setup

```bash
# Install Supabase CLI (future)
npm install -g supabase

# Login to Supabase
supabase login

# Link project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push

# Create migration
supabase migration new create_users_table
```

## Future: Getting Started

When Phase 2 begins:

1. Create Supabase project at https://supabase.com
2. Get project URL and keys
3. Add to `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
4. Install `@supabase/supabase-js`
5. Create database migrations
6. Implement authentication
7. Add API routes

## Security Considerations

- Enable Row-Level Security on all tables
- Create RLS policies for tenant isolation
- Use Supabase Auth for user management
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend
- Regular backups enabled
- Connection pooling configured

## Performance Optimization (Future)

- Database indexes on foreign keys and common filters
- Materialized views for complex queries
- Connection pooling via PgBouncer
- Read replicas for analytics (if needed)

## Testing Strategy (Phase 2+)

1. Integration tests with test database
2. Data reset between test runs
3. Fixtures for common test data
4. Transaction rollback for isolation

## References

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Row-Level Security](https://supabase.com/docs/guides/auth/row-level-security)
