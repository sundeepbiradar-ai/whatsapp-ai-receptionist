# Architecture Documentation

This directory describes the implemented architecture of the AI Customer Operations Platform. The platform is a multi-tenant WhatsApp customer-operations SaaS, initially aimed at clinics and designed for other appointment- and lead-driven businesses.

## Documents

| Document                                          | Purpose                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [High-Level Design](hld.md)                       | Product scope, system context, major components, responsibilities, and architectural decisions.       |
| [Detailed Low-Level Design](dld.md)               | Module boundaries, database model, authorization, APIs, contracts, and operational behavior.          |
| [Network and Data Flow](network-and-data-flow.md) | Trust zones, network topology, inbound/outbound flows, data classification, and sequence diagrams.    |
| [Technology Stack](technology-stack.md)           | Runtime, framework, libraries, infrastructure, testing, and versioning conventions.                   |
| [Deployment Guide](deployment.md)                 | Local setup, CI, Supabase setup, production deployment, smoke tests, rollback, and live verification. |

## Current implementation boundary

Implemented foundations include authentication, organization tenancy, CRM records, appointments, the appointment engine, WhatsApp webhook and delivery reliability, AI receptionist planning and tools, business configuration, and production hardening.

The following are deliberately outside the current implementation boundary: AI-generated customer replies, business-instruction prompt integration, escalation rules, billing, subscriptions, and exactly-once WhatsApp delivery. Live Meta, OpenAI, hosted `pg_cron`, and two-tenant production verification are still deployment activities.

## Source of truth

- [Project status](../project-status.md)
- [Production readiness](../production-readiness.md)
- [Database guide](../database/README.md)
- [Security model](../security/security-model.md)
- [Architecture history](overview.md)
