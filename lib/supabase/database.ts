export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      appointments: {
        Row: {
          contact_id: string;
          conversation_id: string | null;
          created_at: string;
          ends_at: string;
          id: string;
          notes: string | null;
          organization_id: string;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
        };
        Insert: {
          contact_id: string;
          conversation_id?: string | null;
          created_at?: string;
          ends_at: string;
          id?: string;
          notes?: string | null;
          organization_id: string;
          starts_at: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Update: {
          contact_id?: string;
          conversation_id?: string | null;
          created_at?: string;
          ends_at?: string;
          id?: string;
          notes?: string | null;
          organization_id?: string;
          starts_at?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Relationships: [
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
          {
            foreignKeyName: "appointments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          organization_id: string;
          phone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          phone: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          phone?: string;
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
          channel: string | null;
          contact_id: string;
          created_at: string;
          id: string;
          last_message_at: string | null;
          organization_id: string;
          status: Database["public"]["Enums"]["conversation_status"];
          updated_at: string;
          whatsapp_config_id: string | null;
        };
        Insert: {
          channel?: string | null;
          contact_id: string;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          organization_id: string;
          status?: Database["public"]["Enums"]["conversation_status"];
          updated_at?: string;
          whatsapp_config_id?: string | null;
        };
        Update: {
          channel?: string | null;
          contact_id?: string;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          organization_id?: string;
          status?: Database["public"]["Enums"]["conversation_status"];
          updated_at?: string;
          whatsapp_config_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_organization_contact_fk";
            columns: ["organization_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "conversations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_organization_whatsapp_config_fk";
            columns: ["organization_id", "whatsapp_config_id"];
            isOneToOne: false;
            referencedRelation: "organization_whatsapp_configs";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          delivery_error_code: string | null;
          delivery_error_message: string | null;
          delivery_status: string | null;
          delivery_status_at: string | null;
          direction: Database["public"]["Enums"]["message_direction"];
          id: string;
          organization_id: string;
          provider: string | null;
          provider_message_id: string | null;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          delivery_error_code?: string | null;
          delivery_error_message?: string | null;
          delivery_status?: string | null;
          delivery_status_at?: string | null;
          direction: Database["public"]["Enums"]["message_direction"];
          id?: string;
          organization_id: string;
          provider?: string | null;
          provider_message_id?: string | null;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          delivery_error_code?: string | null;
          delivery_error_message?: string | null;
          delivery_status?: string | null;
          delivery_status_at?: string | null;
          direction?: Database["public"]["Enums"]["message_direction"];
          id?: string;
          organization_id?: string;
          provider?: string | null;
          provider_message_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_organization_conversation_fk";
            columns: ["organization_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "messages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_blocked_periods: {
        Row: {
          created_at: string;
          ends_at: string;
          id: string;
          organization_id: string;
          reason: string | null;
          starts_at: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ends_at: string;
          id?: string;
          organization_id: string;
          reason?: string | null;
          starts_at: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          id?: string;
          organization_id?: string;
          reason?: string | null;
          starts_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_blocked_periods_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["organization_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          role?: Database["public"]["Enums"]["organization_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["organization_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_scheduling_settings: {
        Row: {
          business_hours: Json;
          created_at: string;
          default_duration_minutes: number;
          id: string;
          organization_id: string;
          timezone: string;
          updated_at: string;
          working_days: Json;
        };
        Insert: {
          business_hours?: Json;
          created_at?: string;
          default_duration_minutes?: number;
          id?: string;
          organization_id: string;
          timezone?: string;
          updated_at?: string;
          working_days?: Json;
        };
        Update: {
          business_hours?: Json;
          created_at?: string;
          default_duration_minutes?: number;
          id?: string;
          organization_id?: string;
          timezone?: string;
          updated_at?: string;
          working_days?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "organization_scheduling_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_whatsapp_configs: {
        Row: {
          business_account_id: string;
          created_at: string;
          display_phone_number: string | null;
          id: string;
          is_active: boolean;
          organization_id: string;
          phone_number_id: string;
          provider: string;
          updated_at: string;
        };
        Insert: {
          business_account_id: string;
          created_at?: string;
          display_phone_number?: string | null;
          id?: string;
          is_active?: boolean;
          organization_id: string;
          phone_number_id: string;
          provider: string;
          updated_at?: string;
        };
        Update: {
          business_account_id?: string;
          created_at?: string;
          display_phone_number?: string | null;
          id?: string;
          is_active?: boolean;
          organization_id?: string;
          phone_number_id?: string;
          provider?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_whatsapp_configs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_whatsapp_secret_refs: {
        Row: {
          access_token_secret_id: string;
          app_secret_secret_id: string | null;
          config_id: string;
          created_at: string;
          updated_at: string;
          verify_token_secret_id: string | null;
        };
        Insert: {
          access_token_secret_id: string;
          app_secret_secret_id?: string | null;
          config_id: string;
          created_at?: string;
          updated_at?: string;
          verify_token_secret_id?: string | null;
        };
        Update: {
          access_token_secret_id?: string;
          app_secret_secret_id?: string | null;
          config_id?: string;
          created_at?: string;
          updated_at?: string;
          verify_token_secret_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_whatsapp_secret_refs_config_id_fkey";
            columns: ["config_id"];
            isOneToOne: true;
            referencedRelation: "organization_whatsapp_configs";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      whatsapp_send_jobs: {
        Row: {
          attempt_count: number;
          claim_expires_at: string | null;
          claimed_at: string | null;
          created_at: string;
          id: string;
          last_error_code: string | null;
          last_error_message: string | null;
          max_attempts: number;
          message_id: string;
          next_attempt_at: string;
          organization_id: string;
          provider: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          claim_expires_at?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          id?: string;
          last_error_code?: string | null;
          last_error_message?: string | null;
          max_attempts?: number;
          message_id: string;
          next_attempt_at?: string;
          organization_id: string;
          provider?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          claim_expires_at?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          id?: string;
          last_error_code?: string | null;
          last_error_message?: string | null;
          max_attempts?: number;
          message_id?: string;
          next_attempt_at?: string;
          organization_id?: string;
          provider?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_send_jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_send_jobs_organization_message_fk";
            columns: ["organization_id", "message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_whatsapp_message_status: {
        Args: {
          target_error_code?: string;
          target_error_message?: string;
          target_organization_id: string;
          target_provider?: string;
          target_provider_message_id: string;
          target_status: string;
          target_status_at: string;
          target_whatsapp_config_id: string;
        };
        Returns: Json;
      };
      book_or_reschedule_appointment: {
        Args: {
          operation: string;
          target_appointment_id?: string;
          target_contact_id: string;
          target_conversation_id: string;
          target_ends_at: string;
          target_notes?: string;
          target_organization_id: string;
          target_starts_at: string;
          target_status?: Database["public"]["Enums"]["appointment_status"];
        };
        Returns: Json;
      };
      claim_whatsapp_send_jobs: {
        Args: { target_batch_size?: number };
        Returns: Json;
      };
      complete_whatsapp_send_job: {
        Args: { target_job_id: string; target_provider_message_id: string };
        Returns: Json;
      };
      create_organization: {
        Args: { organization_name: string; organization_slug: string };
        Returns: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "organizations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      enqueue_whatsapp_send_job: {
        Args: {
          target_error_code?: string;
          target_error_message?: string;
          target_message_id: string;
          target_next_attempt_at: string;
          target_organization_id: string;
        };
        Returns: Json;
      };
      invoke_whatsapp_retry_worker: { Args: never; Returns: undefined };
      is_organization_admin: {
        Args: { target_organization_id: string; target_user_id?: string };
        Returns: boolean;
      };
      is_organization_member: {
        Args: { target_organization_id: string; target_user_id?: string };
        Returns: boolean;
      };
      is_valid_scheduling_hours: {
        Args: { target_business_hours: Json; target_working_days: Json };
        Returns: boolean;
      };
      is_valid_timezone: { Args: { target_timezone: string }; Returns: boolean };
      process_inbound_whatsapp_message: {
        Args: {
          target_content: string;
          target_created_at: string;
          target_organization_id: string;
          target_provider?: string;
          target_provider_message_id: string;
          target_sender_phone: string;
          target_whatsapp_config_id: string;
        };
        Returns: Json;
      };
      reap_whatsapp_send_job_claims: { Args: never; Returns: Json };
      reschedule_whatsapp_send_job: {
        Args: {
          target_error_code: string;
          target_error_message?: string;
          target_job_id: string;
          target_next_attempt_at: string;
        };
        Returns: Json;
      };
      resolve_whatsapp_config: {
        Args: { target_phone_number_id: string; target_provider: string };
        Returns: Json;
      };
      resolve_whatsapp_config_for_organization: {
        Args: { target_organization_id: string; target_provider?: string };
        Returns: Json;
      };
      resolve_whatsapp_verification_config: {
        Args: { target_provider: string; target_verify_token: string };
        Returns: Json;
      };
      terminate_whatsapp_send_job: {
        Args: {
          target_error_code: string;
          target_error_message?: string;
          target_job_id: string;
          target_message_status: string;
        };
        Returns: Json;
      };
      whatsapp_delivery_status_rank: {
        Args: { target_status: string };
        Returns: number;
      };
    };
    Enums: {
      appointment_status: "pending" | "confirmed" | "cancelled" | "completed";
      conversation_status: "open" | "closed";
      message_direction: "inbound" | "outbound";
      organization_role: "owner" | "admin" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      appointment_status: ["pending", "confirmed", "cancelled", "completed"],
      conversation_status: ["open", "closed"],
      message_direction: ["inbound", "outbound"],
      organization_role: ["owner", "admin", "member"],
    },
  },
} as const;
