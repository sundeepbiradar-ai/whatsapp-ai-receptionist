export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrganizationRole = 'owner' | 'admin' | 'member';
export type ConversationStatus = 'open' | 'closed';
export type MessageDirection = 'inbound' | 'outbound';
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export type Database = {
  public: {
    Tables: {
      [tableName: string]: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: Array<{
          foreignKeyName: string;
          columns: string[];
          isOneToOne?: boolean;
          referencedRelation: string;
          referencedColumns: string[];
        }>;
      };
      profiles: {
        Row: {
          [key: string]: unknown;
          id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          [key: string]: unknown;
          id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          [key: string]: unknown;
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          [key: string]: unknown;
          id: string;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          [key: string]: unknown;
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          [key: string]: unknown;
          id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          [key: string]: unknown;
          id: string;
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          [key: string]: unknown;
          id?: string;
          organization_id: string;
          user_id: string;
          role?: OrganizationRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          [key: string]: unknown;
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: OrganizationRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      contacts: {
        Row: {
          [key: string]: unknown;
          id: string;
          organization_id: string;
          phone: string;
          name: string;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          [key: string]: unknown;
          id?: string;
          organization_id: string;
          phone: string;
          name: string;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          [key: string]: unknown;
          id?: string;
          organization_id?: string;
          phone?: string;
          name?: string;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          [key: string]: unknown;
          id: string;
          organization_id: string;
          contact_id: string;
          status: ConversationStatus;
          created_at: string;
          updated_at: string;
          last_message_at: string | null;
        };
        Insert: {
          [key: string]: unknown;
          id?: string;
          organization_id: string;
          contact_id: string;
          status?: ConversationStatus;
          created_at?: string;
          updated_at?: string;
          last_message_at?: string | null;
        };
        Update: {
          [key: string]: unknown;
          id?: string;
          organization_id?: string;
          contact_id?: string;
          status?: ConversationStatus;
          created_at?: string;
          updated_at?: string;
          last_message_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_organization_contact_fk";
            columns: ["organization_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      messages: {
        Row: {
          [key: string]: unknown;
          id: string;
          organization_id: string;
          conversation_id: string;
          direction: MessageDirection;
          content: string;
          created_at: string;
        };
        Insert: {
          [key: string]: unknown;
          id?: string;
          organization_id: string;
          conversation_id: string;
          direction: MessageDirection;
          content: string;
          created_at?: string;
        };
        Update: {
          [key: string]: unknown;
          id?: string;
          organization_id?: string;
          conversation_id?: string;
          direction?: MessageDirection;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_organization_conversation_fk";
            columns: ["organization_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      appointments: {
        Row: {
          [key: string]: unknown;
          id: string;
          organization_id: string;
          contact_id: string;
          conversation_id: string | null;
          status: AppointmentStatus;
          starts_at: string;
          ends_at: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          [key: string]: unknown;
          id?: string;
          organization_id: string;
          contact_id: string;
          conversation_id?: string | null;
          status?: AppointmentStatus;
          starts_at: string;
          ends_at: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          [key: string]: unknown;
          id?: string;
          organization_id?: string;
          contact_id?: string;
          conversation_id?: string | null;
          status?: AppointmentStatus;
          starts_at?: string;
          ends_at?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_organization_contact_fk";
            columns: ["organization_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "appointments_organization_conversation_fk";
            columns: ["organization_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [functionName: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
      create_organization: {
        Args: {
          [key: string]: unknown;
          organization_name: string;
          organization_slug: string;
        };
        Returns: Database["public"]["Tables"]["organizations"]["Row"];
      };
      is_organization_member: {
        Args: {
          [key: string]: unknown;
          target_organization_id: string;
          target_user_id?: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      appointment_status: AppointmentStatus;
      conversation_status: ConversationStatus;
      message_direction: MessageDirection;
      organization_role: OrganizationRole;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
