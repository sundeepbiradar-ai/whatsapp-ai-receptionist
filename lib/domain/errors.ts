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
  | 'scheduling_configuration_invalid'
  | 'scheduling_configuration_unavailable'
  | 'appointment_outside_business_hours'
  | 'appointment_blocked_period'
  | 'appointment_conflict'
  | 'appointment_reschedule_invalid'
  | 'appointment_operation_invalid'
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
    default:
      return new DomainError('database_error', 'The domain operation could not be completed.');
  }
}
