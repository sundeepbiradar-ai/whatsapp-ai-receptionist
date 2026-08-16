export const domainEnums = {
  appointment_status: ["pending", "confirmed", "cancelled", "completed"],
  conversation_status: ["open", "closed"],
  message_direction: ["inbound", "outbound"],
} as const;

export type DomainEnumName = keyof typeof domainEnums;
export type DomainTableName = "appointments" | "contacts" | "conversations" | "messages";

export type DomainColumnContract = {
  name: string;
  postgresType: string;
  required: boolean;
};

export type DomainForeignKeyContract = {
  columns: readonly string[];
  referencedTable: string;
  referencedColumns: readonly string[];
  optional: boolean;
};

export type DomainIndexContract = {
  columns: readonly string[];
  unique: boolean;
};

export type DomainTableContract = {
  columns: readonly DomainColumnContract[];
  foreignKeys: readonly DomainForeignKeyContract[];
  indexes: readonly DomainIndexContract[];
  rlsRequired: true;
  tenantBoundary: "organization_id";
  invariants: readonly string[];
};

export const domainSchemaContract: Record<DomainTableName, DomainTableContract> = {
  contacts: {
    columns: [
      { name: "id", postgresType: "uuid", required: true },
      { name: "organization_id", postgresType: "uuid", required: true },
      { name: "phone", postgresType: "text", required: true },
      { name: "name", postgresType: "text", required: true },
      { name: "email", postgresType: "text", required: false },
      { name: "created_at", postgresType: "timestamptz", required: true },
      { name: "updated_at", postgresType: "timestamptz", required: true },
    ],
    foreignKeys: [
      {
        columns: ["organization_id"],
        referencedTable: "organizations",
        referencedColumns: ["id"],
        optional: false,
      },
    ],
    indexes: [
      { columns: ["organization_id"], unique: false },
      { columns: ["organization_id", "phone"], unique: true },
    ],
    invariants: [
      "id is the UUID primary key",
      "phone uniqueness is scoped to organization_id",
    ],
    rlsRequired: true,
    tenantBoundary: "organization_id",
  },
  conversations: {
    columns: [
      { name: "id", postgresType: "uuid", required: true },
      { name: "organization_id", postgresType: "uuid", required: true },
      { name: "contact_id", postgresType: "uuid", required: true },
      { name: "status", postgresType: "conversation_status", required: true },
      { name: "created_at", postgresType: "timestamptz", required: true },
      { name: "updated_at", postgresType: "timestamptz", required: true },
      { name: "last_message_at", postgresType: "timestamptz", required: false },
    ],
    foreignKeys: [
      {
        columns: ["organization_id"],
        referencedTable: "organizations",
        referencedColumns: ["id"],
        optional: false,
      },
      {
        columns: ["contact_id"],
        referencedTable: "contacts",
        referencedColumns: ["id"],
        optional: false,
      },
    ],
    indexes: [
      { columns: ["organization_id"], unique: false },
      { columns: ["contact_id"], unique: false },
      { columns: ["organization_id", "contact_id"], unique: false },
      { columns: ["organization_id", "last_message_at"], unique: false },
    ],
    invariants: [
      "id is the UUID primary key",
      "contact_id must reference a contact in the same organization_id",
    ],
    rlsRequired: true,
    tenantBoundary: "organization_id",
  },
  messages: {
    columns: [
      { name: "id", postgresType: "uuid", required: true },
      { name: "organization_id", postgresType: "uuid", required: true },
      { name: "conversation_id", postgresType: "uuid", required: true },
      { name: "direction", postgresType: "message_direction", required: true },
      { name: "content", postgresType: "text", required: true },
      { name: "created_at", postgresType: "timestamptz", required: true },
    ],
    foreignKeys: [
      {
        columns: ["organization_id"],
        referencedTable: "organizations",
        referencedColumns: ["id"],
        optional: false,
      },
      {
        columns: ["conversation_id"],
        referencedTable: "conversations",
        referencedColumns: ["id"],
        optional: false,
      },
    ],
    indexes: [
      { columns: ["organization_id"], unique: false },
      { columns: ["conversation_id"], unique: false },
      { columns: ["organization_id", "conversation_id"], unique: false },
      { columns: ["organization_id", "conversation_id", "created_at"], unique: false },
    ],
    invariants: [
      "id is the UUID primary key",
      "conversation_id must reference a conversation in the same organization_id",
    ],
    rlsRequired: true,
    tenantBoundary: "organization_id",
  },
  appointments: {
    columns: [
      { name: "id", postgresType: "uuid", required: true },
      { name: "organization_id", postgresType: "uuid", required: true },
      { name: "contact_id", postgresType: "uuid", required: true },
      { name: "conversation_id", postgresType: "uuid", required: false },
      { name: "status", postgresType: "appointment_status", required: true },
      { name: "starts_at", postgresType: "timestamptz", required: true },
      { name: "ends_at", postgresType: "timestamptz", required: true },
      { name: "notes", postgresType: "text", required: false },
      { name: "created_at", postgresType: "timestamptz", required: true },
      { name: "updated_at", postgresType: "timestamptz", required: true },
    ],
    foreignKeys: [
      {
        columns: ["organization_id"],
        referencedTable: "organizations",
        referencedColumns: ["id"],
        optional: false,
      },
      {
        columns: ["contact_id"],
        referencedTable: "contacts",
        referencedColumns: ["id"],
        optional: false,
      },
      {
        columns: ["conversation_id"],
        referencedTable: "conversations",
        referencedColumns: ["id"],
        optional: true,
      },
    ],
    indexes: [
      { columns: ["organization_id"], unique: false },
      { columns: ["contact_id"], unique: false },
      { columns: ["organization_id", "starts_at"], unique: false },
      { columns: ["organization_id", "status"], unique: false },
      { columns: ["organization_id", "conversation_id"], unique: false },
    ],
    invariants: [
      "id is the UUID primary key",
      "ends_at must be later than starts_at",
      "contact_id must reference a contact in the same organization_id",
      "conversation_id, when present, must reference a conversation in the same organization_id",
    ],
    rlsRequired: true,
    tenantBoundary: "organization_id",
  },
};

export const domainSchemaContractPhase = "3.1" as const;
export const domainSchemaMigrationImplemented = true as const;
