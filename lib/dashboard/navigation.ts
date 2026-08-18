export type DashboardNavigationItem = {
  readonly label: string;
  readonly href: string;
};

export const dashboardNavigationItems: readonly DashboardNavigationItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Contacts', href: '/dashboard/contacts' },
  { label: 'Conversations', href: '/dashboard/conversations' },
  { label: 'Appointments', href: '/dashboard/appointments' },
  { label: 'Business Settings', href: '/dashboard/settings' },
] as const;
