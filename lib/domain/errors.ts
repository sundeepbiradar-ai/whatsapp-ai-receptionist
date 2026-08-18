export type DomainErrorCode =
  | 'unauthenticated'
  | 'no_organization'
  | 'invalid_input'
  | 'not_found'
  | 'forbidden'
  | 'duplicate_contact'
  | 'appointment_time_invalid'
  | 'appointment_relationship_invalid'
  | 'appointment_transition_invalid'
  | 'appointment_terminal'
  | 'appointment_past'
  | 'appointment_scheduling_input_invalid'
  | 'appointment_interval_invalid'
  | 'appointment_duration_invalid'
  | 'appointment_timezone_invalid'
  | 'appointment_local_time_invalid'
  | 'appointment_local_time_ambiguous'
  | 'appointment_reschedule_required'
  | 'appointment_cancellation_required'
  | 'scheduling_configuration_invalid'
  | 'scheduling_configuration_unavailable'
  | 'appointment_outside_business_hours'
  | 'appointment_blocked_period'
  | 'appointment_conflict'
  | 'appointment_reschedule_invalid'
  | 'appointment_operation_invalid'
  | 'whatsapp_configuration_invalid'
  | 'whatsapp_provider_lookup_failed'
  | 'whatsapp_verification_invalid'
  | 'whatsapp_signature_invalid'
  | 'whatsapp_payload_invalid'
  | 'whatsapp_configuration_unavailable'
  | 'whatsapp_destination_invalid'
  | 'whatsapp_message_invalid'
  | 'whatsapp_provider_rejected'
  | 'whatsapp_provider_unavailable'
  | 'whatsapp_provider_rate_limited'
  | 'whatsapp_provider_unreachable'
  | 'whatsapp_provider_network_failure'
  | 'whatsapp_provider_response_invalid'
  | 'whatsapp_pipeline_input_invalid'
  | 'whatsapp_pipeline_persistence_failed'
  | 'whatsapp_tenant_mismatch'
  | 'whatsapp_duplicate_provider_message'
  | 'whatsapp_conversation_invalid'
  | 'whatsapp_status_persistence_failed'
  | 'whatsapp_message_unconfirmed'
  | 'whatsapp_retry_worker_failed'
  | 'database_error';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

type DomainDatabaseError = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

export function mapDomainDatabaseError(
  error: DomainDatabaseError,
  domain: 'appointment' | 'generic' = 'generic'
): DomainError {
  if (domain === 'appointment') {
    console.error('Appointment database operation failed.', {
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
    });

    if (error.code === '23503') {
      return new DomainError(
        'appointment_relationship_invalid',
        'The appointment contact or conversation is invalid.'
      );
    }

    if (error.code === '23514') {
      return new DomainError(
        'appointment_time_invalid',
        'Appointment end must be later than its start.'
      );
    }
  }

  if (error.code === '23505') {
    return new DomainError('duplicate_contact', 'A contact with this phone already exists.');
  }

  return new DomainError('database_error', 'The domain operation could not be completed.');
}

export function mapAppointmentSchedulingError(errorCode: string | null | undefined): DomainError {
  switch (errorCode) {
    case 'appointment_time_invalid':
      return new DomainError('appointment_time_invalid', 'Appointment end must be later than its start.');
    case 'appointment_duration_invalid':
      return new DomainError('appointment_duration_invalid', 'Appointment duration cannot exceed 24 hours.');
    case 'appointment_past':
      return new DomainError('appointment_past', 'Appointment start time must be in the future.');
    case 'appointment_relationship_invalid':
      return new DomainError('appointment_relationship_invalid', 'The appointment relationship is invalid.');
    case 'scheduling_configuration_invalid':
      return new DomainError('scheduling_configuration_invalid', 'Scheduling configuration is invalid.');
    case 'scheduling_configuration_unavailable':
      return new DomainError('scheduling_configuration_unavailable', 'Scheduling is not configured for this organization.');
    case 'appointment_outside_business_hours':
      return new DomainError('appointment_outside_business_hours', 'The appointment is outside business hours.');
    case 'appointment_blocked_period':
      return new DomainError('appointment_blocked_period', 'The requested time is blocked.');
    case 'appointment_conflict':
      return new DomainError('appointment_conflict', 'The requested time is unavailable.');
    case 'appointment_reschedule_invalid':
      return new DomainError('appointment_reschedule_invalid', 'This appointment cannot be rescheduled.');
    case 'appointment_operation_invalid':
      return new DomainError('appointment_operation_invalid', 'The appointment operation is invalid.');
    case 'appointment_local_time_invalid':
      return new DomainError('appointment_local_time_invalid', 'The selected local time does not exist in the organization timezone.');
    case 'appointment_local_time_ambiguous':
      return new DomainError('appointment_local_time_ambiguous', 'The selected local time is ambiguous in the organization timezone.');
    default:
      return new DomainError('database_error', 'The domain operation could not be completed.');
  }
}
