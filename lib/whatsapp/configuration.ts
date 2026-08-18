import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/domain/errors";
import type { Database, Json } from "@/lib/supabase/database";

export const metaWhatsAppProvider = "meta_whatsapp_cloud" as const;
export type WhatsAppProvider = typeof metaWhatsAppProvider;

export type ResolvedWhatsAppConfig = {
  configId: string;
  organizationId: string;
  provider: WhatsAppProvider;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhoneNumber: string | null;
  accessToken: string;
  appSecret: string | null;
  verifyToken: string | null;
};

export type ResolvedWhatsAppVerificationConfig = Omit<
  ResolvedWhatsAppConfig,
  "accessToken" | "appSecret" | "verifyToken"
>;

type ResolvedWhatsAppConfigJson = {
  config_id: string;
  organization_id: string;
  provider: string;
  phone_number_id: string;
  business_account_id: string;
  display_phone_number: string | null;
  access_token: string;
  app_secret: string | null;
  verify_token: string | null;
};

type ResolvedWhatsAppVerificationConfigJson = Omit<
  ResolvedWhatsAppConfigJson,
  "access_token" | "app_secret" | "verify_token"
>;

function serviceRoleClient(): SupabaseClient<Database> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) {
    throw new DomainError(
      "whatsapp_provider_lookup_failed",
      "WhatsApp provider configuration is unavailable."
    );
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function parseResolvedConfig(value: Json): ResolvedWhatsAppConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(
      "whatsapp_configuration_invalid",
      "WhatsApp provider configuration is invalid."
    );
  }
  const config = value as Partial<ResolvedWhatsAppConfigJson>;
  if (
    typeof config.config_id !== "string" ||
    typeof config.organization_id !== "string" ||
    config.provider !== metaWhatsAppProvider ||
    typeof config.phone_number_id !== "string" ||
    typeof config.business_account_id !== "string" ||
    typeof config.access_token !== "string" ||
    (config.display_phone_number !== null && typeof config.display_phone_number !== "string") ||
    (config.app_secret !== null && typeof config.app_secret !== "string") ||
    (config.verify_token !== null && typeof config.verify_token !== "string")
  ) {
    throw new DomainError(
      "whatsapp_configuration_invalid",
      "WhatsApp provider configuration is invalid."
    );
  }
  return {
    configId: config.config_id,
    organizationId: config.organization_id,
    provider: metaWhatsAppProvider,
    phoneNumberId: config.phone_number_id,
    businessAccountId: config.business_account_id,
    displayPhoneNumber: config.display_phone_number ?? null,
    accessToken: config.access_token,
    appSecret: config.app_secret ?? null,
    verifyToken: config.verify_token ?? null,
  };
}

function parseResolvedVerificationConfig(value: Json): ResolvedWhatsAppVerificationConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(
      "whatsapp_configuration_invalid",
      "WhatsApp provider configuration is invalid."
    );
  }
  const config = value as Partial<ResolvedWhatsAppVerificationConfigJson>;
  if (
    typeof config.config_id !== "string" ||
    typeof config.organization_id !== "string" ||
    config.provider !== metaWhatsAppProvider ||
    typeof config.phone_number_id !== "string" ||
    typeof config.business_account_id !== "string" ||
    (config.display_phone_number !== null && typeof config.display_phone_number !== "string")
  ) {
    throw new DomainError(
      "whatsapp_configuration_invalid",
      "WhatsApp provider configuration is invalid."
    );
  }
  return {
    configId: config.config_id,
    organizationId: config.organization_id,
    provider: metaWhatsAppProvider,
    phoneNumberId: config.phone_number_id,
    businessAccountId: config.business_account_id,
    displayPhoneNumber: config.display_phone_number ?? null,
  };
}

async function resolve(
  operation: "resolve_whatsapp_config" | "resolve_whatsapp_config_for_organization",
  args:
    | Database["public"]["Functions"]["resolve_whatsapp_config"]["Args"]
    | Database["public"]["Functions"]["resolve_whatsapp_config_for_organization"]["Args"]
): Promise<ResolvedWhatsAppConfig | null> {
  const { data, error } = await serviceRoleClient().rpc(operation, args as never);
  if (error) {
    throw new DomainError(
      "whatsapp_provider_lookup_failed",
      "WhatsApp provider configuration is unavailable."
    );
  }
  if (data === null) return null;
  return parseResolvedConfig(data);
}

export async function resolveWhatsAppConfigByVerifyToken(
  verifyToken: string,
  provider: WhatsAppProvider = metaWhatsAppProvider
): Promise<ResolvedWhatsAppVerificationConfig | null> {
  if (verifyToken.trim().length === 0) return null;
  const { data, error } = await serviceRoleClient().rpc("resolve_whatsapp_verification_config", {
    target_provider: provider,
    target_verify_token: verifyToken,
  });
  if (error) {
    throw new DomainError(
      "whatsapp_provider_lookup_failed",
      "WhatsApp provider configuration is unavailable."
    );
  }
  if (data === null) return null;
  return parseResolvedVerificationConfig(data);
}

export async function resolveWhatsAppConfigByPhoneNumberId(
  phoneNumberId: string,
  provider: WhatsAppProvider = metaWhatsAppProvider
): Promise<ResolvedWhatsAppConfig | null> {
  if (phoneNumberId.trim().length === 0) return null;
  return resolve("resolve_whatsapp_config", {
    target_phone_number_id: phoneNumberId,
    target_provider: provider,
  });
}

export async function resolveWhatsAppConfigForOrganization(
  organizationId: string,
  provider: WhatsAppProvider = metaWhatsAppProvider
): Promise<ResolvedWhatsAppConfig | null> {
  if (organizationId.trim().length === 0) return null;
  return resolve("resolve_whatsapp_config_for_organization", {
    target_organization_id: organizationId,
    target_provider: provider,
  });
}
