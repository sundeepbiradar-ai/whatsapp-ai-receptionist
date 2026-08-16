import 'server-only';

import { DomainError } from '@/lib/domain/errors';
import { getOrganizationContext } from '@/lib/organizations/context';

export async function requireDomainOrganization() {
  const context = await getOrganizationContext();

  if (context.status === 'unauthenticated') {
    throw new DomainError('unauthenticated', 'Authentication is required.');
  }

  if (context.status === 'no-organization') {
    throw new DomainError('no_organization', 'An organization is required.');
  }

  return context;
}
