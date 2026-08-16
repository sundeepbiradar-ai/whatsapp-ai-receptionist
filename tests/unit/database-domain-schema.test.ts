import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  domainEnums,
  domainSchemaContract,
  domainSchemaMigrationImplemented,
  type DomainColumnContract,
  type DomainForeignKeyContract,
  type DomainTableContract,
} from "@/lib/domain/schema-contract";

const requiredTables = ["contacts", "conversations", "messages", "appointments"] as const;
const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260816030000_create_core_domain.sql"
);
const migration = readFileSync(migrationPath, "utf8");

function column(table: DomainTableContract, name: string): DomainColumnContract {
  const result = table.columns.find((candidate) => candidate.name === name);
  if (!result) {
    throw new Error(`Missing required column: ${name}`);
  }
  return result;
}

function foreignKey(table: DomainTableContract, referencedTable: string): DomainForeignKeyContract {
  const result = table.foreignKeys.find((candidate) => candidate.referencedTable === referencedTable);
  if (!result) {
    throw new Error(`Missing foreign key to: ${referencedTable}`);
  }
  return result;
}

function index(table: DomainTableContract, columns: readonly string[], unique = false): void {
  expect(table.indexes).toContainEqual({ columns, unique });
}

describe("Phase 3.1 core domain schema contract", () => {
  it("defines the four core domain tables", () => {
    expect(Object.keys(domainSchemaContract).sort()).toEqual([...requiredTables].sort());
  });

  it("makes organization_id the required tenant boundary on every table", () => {
    for (const tableName of requiredTables) {
      const table = domainSchemaContract[tableName];
      const tenantColumn = column(table, "organization_id");
      expect(tenantColumn.postgresType).toBe("uuid");
      expect(tenantColumn.required).toBe(true);
      expect(foreignKey(table, "organizations")).toEqual({
        columns: ["organization_id"],
        referencedTable: "organizations",
        referencedColumns: ["id"],
        optional: false,
      });
      expect(table.tenantBoundary).toBe("organization_id");
      expect(table.rlsRequired).toBe(true);
    }
  });

  it("defines contacts with organization-scoped phone uniqueness", () => {
    const table = domainSchemaContract.contacts;
    expect(column(table, "id")).toEqual({ name: "id", postgresType: "uuid", required: true });
    expect(column(table, "phone").required).toBe(true);
    expect(column(table, "name").required).toBe(true);
    expect(column(table, "email").required).toBe(false);
    index(table, ["organization_id"]);
    index(table, ["organization_id", "phone"], true);
  });

  it("defines conversation, message, and appointment relationships", () => {
    expect(foreignKey(domainSchemaContract.conversations, "contacts").columns).toEqual(["contact_id"]);
    expect(foreignKey(domainSchemaContract.messages, "conversations").columns).toEqual([
      "conversation_id",
    ]);
    expect(foreignKey(domainSchemaContract.appointments, "contacts").columns).toEqual(["contact_id"]);
    expect(foreignKey(domainSchemaContract.appointments, "conversations").optional).toBe(true);
  });

  it("defines constrained enums and required status/direction columns", () => {
    expect(domainEnums.conversation_status).toEqual(["open", "closed"]);
    expect(domainEnums.message_direction).toEqual(["inbound", "outbound"]);
    expect(domainEnums.appointment_status).toEqual([
      "pending",
      "confirmed",
      "cancelled",
      "completed",
    ]);
    expect(column(domainSchemaContract.conversations, "status").postgresType).toBe(
      "conversation_status"
    );
    expect(column(domainSchemaContract.messages, "direction").postgresType).toBe("message_direction");
    expect(column(domainSchemaContract.appointments, "status").postgresType).toBe("appointment_status");
    expect(column(domainSchemaContract.conversations, "last_message_at").required).toBe(false);
  });

  it("defines appointment optionality and time invariant", () => {
    const table = domainSchemaContract.appointments;
    expect(column(table, "conversation_id").required).toBe(false);
    expect(column(table, "notes").required).toBe(false);
    expect(column(table, "starts_at").required).toBe(true);
    expect(column(table, "ends_at").required).toBe(true);
    expect(table.invariants).toContain("ends_at must be later than starts_at");
    index(table, ["organization_id"]);
    index(table, ["contact_id"]);
    index(table, ["organization_id", "starts_at"]);
  });

  it("defines tenant query indexes and marks the contract as migrated", () => {
    index(domainSchemaContract.conversations, ["organization_id"]);
    index(domainSchemaContract.conversations, ["contact_id"]);
    index(domainSchemaContract.messages, ["organization_id"]);
    index(domainSchemaContract.messages, ["conversation_id"]);
    index(domainSchemaContract.messages, ["organization_id", "conversation_id"]);
    index(domainSchemaContract.messages, ["organization_id", "conversation_id", "created_at"]);
    expect(domainSchemaMigrationImplemented).toBe(true);
  });

  it("requires same-organization relationship invariants", () => {
    expect(domainSchemaContract.conversations.invariants).toContain(
      "contact_id must reference a contact in the same organization_id"
    );
    expect(domainSchemaContract.messages.invariants).toContain(
      "conversation_id must reference a conversation in the same organization_id"
    );
    expect(domainSchemaContract.appointments.invariants).toContain(
      "contact_id must reference a contact in the same organization_id"
    );
    expect(domainSchemaContract.appointments.invariants).toContain(
      "conversation_id, when present, must reference a conversation in the same organization_id"
    );
  });
});

describe("Phase 3.2 core domain migration contract", () => {
  it("creates exactly the four domain tables", () => {
    for (const table of requiredTables) {
      expect(migration).toContain(`create table public.${table}`);
    }
    expect(migration.match(/^create table public\./gm)).toHaveLength(4);
  });

  it("defines the required enums and values", () => {
    expect(migration).toContain("create type public.conversation_status as enum ('open', 'closed')");
    expect(migration).toContain(
      "create type public.message_direction as enum ('inbound', 'outbound')"
    );
    expect(migration).toContain(
      "create type public.appointment_status as enum ('pending', 'confirmed', 'cancelled', 'completed')"
    );
  });

  it("defines required columns and constraints", () => {
    expect(migration).toContain("organization_id uuid not null");
    expect(migration).toContain("phone text not null");
    expect(migration).toContain("constraint contacts_organization_phone_key unique (organization_id, phone)");
    expect(migration).toContain("last_message_at timestamptz");
    expect(migration).toContain("constraint appointments_valid_time check (ends_at > starts_at)");
    expect(migration).toContain("on delete set null (conversation_id)");
  });

  it("enforces same-tenant relationships with composite foreign keys", () => {
    expect(migration).toContain(
      "foreign key (organization_id, contact_id)\n    references public.contacts (organization_id, id)"
    );
    expect(migration).toContain(
      "foreign key (organization_id, conversation_id)\n    references public.conversations (organization_id, id)"
    );
    expect(migration).toContain("constraint messages_organization_conversation_fk");
    expect(migration).toContain("constraint appointments_organization_contact_fk");
    expect(migration).toContain("constraint appointments_organization_conversation_fk");
  });

  it("defines the required tenant/query indexes", () => {
    for (const indexName of [
      "contacts_organization_id_idx",
      "conversations_organization_contact_idx",
      "conversations_organization_last_message_idx",
      "messages_organization_conversation_created_idx",
      "appointments_organization_starts_idx",
      "appointments_organization_status_idx",
    ]) {
      expect(migration).toContain(`create index ${indexName}`);
    }
  });

  it("enables RLS and defines explicit CRUD policies for all domain tables", () => {
    expect(migration.match(/^alter table public\.(contacts|conversations|messages|appointments) enable row level security;/gm)).toHaveLength(4);
    expect(migration.match(/^create policy /gm)).toHaveLength(16);
    for (const table of requiredTables) {
      expect(migration).toContain(`${table}_select_members`);
      expect(migration).toContain(`${table}_insert_members`);
      expect(migration).toContain(`${table}_update_members`);
      expect(migration).toContain(`${table}_delete_members`);
    }
    expect(migration).toContain("public.is_organization_member(organization_id, auth.uid())");
  });

  it("does not modify auth or unrelated application domains", () => {
    expect(migration).not.toContain("auth.users");
    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(migration).not.toContain("whatsapp");
    expect(migration).not.toContain("openai");
  });
});
