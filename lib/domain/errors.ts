export type DomainErrorCode =
  | 'unauthenticated'
  | 'no_organization'
  | 'invalid_input'
  | 'not_found'
  | 'forbidden'
  | 'duplicate_contact'
  | 'database_error';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function mapDomainDatabaseError(error: { code?: string }): DomainError {
  if (error.code === '23505') {
    return new DomainError('duplicate_contact', 'A contact with this phone already exists.');
  }

  return new DomainError('database_error', 'The domain operation could not be completed.');
}
