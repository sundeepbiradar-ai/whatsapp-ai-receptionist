import "server-only";

import type { Database } from "@/lib/supabase/database";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { DomainError, mapDomainDatabaseError } from "@/lib/domain/errors";
import { idSchema, parseDomain } from "@/lib/domain/validation";
import { parseSchedulingSettings, type SchedulingSettings } from "@/lib/domain/appointments/scheduling";

type Appointment = Database["public"]["Tables"]["appointments"]["Row"];
type SchedulingSettingsRow = Database["public"]["Tables"]["organization_scheduling_settings"]["Row"];

export type AppointmentQueryOptionsForOrganization = {
  statuses?: Database["public"]["Enums"]["appointment_status"][];
  pageSize?: number;
};

/**
 * Service-role reads used only by the webhook orchestration path. Reuses the
 * same pure scheduling validator (`parseSchedulingSettings`) as the
 * session-bound repository so business-hours semantics are defined in one
 * place. No mutation is performed here; booking/rescheduling/cancellation
 * remain session-bound-only in this sandbox change (see project notes).
 */
export async function getSchedulingSettingsForOrganization(
  organizationId: string
): Promise<SchedulingSettingsRow & { parsed: SchedulingSettings }> {
  const validOrganizationId = parseDomain(idSchema, organizationId);
  const supabase = createServiceRoleClient("scheduling_configuration_unavailable");
  const { data, error } = await supabase
    .from("organization_scheduling_settings")
    .select("*")
    .eq("organization_id", validOrganizationId)
    .maybeSingle();
  if (error) throw mapDomainDatabaseError(error, "appointment");
  if (!data) {
    throw new DomainError(
      "scheduling_configuration_unavailable",
      "Scheduling is not configured for this organization."
    );
  }
  const parsed = parseSchedulingSettings({
    timezone: data.timezone,
    working_days: data.working_days,
    business_hours: data.business_hours,
    default_duration_minutes: data.default_duration_minutes,
  });
  return { ...data, parsed };
}

const maxQueryResults = 50;

export async function queryAppointmentsForOrganizationAndContact(
  organizationId: string,
  contactId: string,
  options: AppointmentQueryOptionsForOrganization = {}
): Promise<Appointment[]> {
  const validOrganizationId = parseDomain(idSchema, organizationId);
  const validContactId = parseDomain(idSchema, contactId);
  const pageSize = Math.min(Math.max(options.pageSize ?? maxQueryResults, 1), maxQueryResults);
  const supabase = createServiceRoleClient("database_error");
  let query = supabase
    .from("appointments")
    .select("id, organization_id, contact_id, conversation_id, status, starts_at, ends_at, notes, created_at, updated_at")
    .eq("organization_id", validOrganizationId)
    .eq("contact_id", validContactId);
  if (options.statuses && options.statuses.length > 0) query = query.in("status", options.statuses);
  const { data, error } = await query
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(pageSize);
  if (error) throw mapDomainDatabaseError(error, "appointment");
  return data;
}
