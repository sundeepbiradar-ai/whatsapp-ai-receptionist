import { describe, expect, it } from 'vitest';

import { dashboardNavigationItems } from '@/lib/dashboard/navigation';

describe('dashboard navigation', () => {
  it('exposes a business settings entry pointing at the settings route', () => {
    const settings = dashboardNavigationItems.find((item) => item.href === '/dashboard/settings');
    expect(settings).toBeDefined();
    expect(settings?.label).toBe('Business Settings');
  });

  it('keeps the existing sections available', () => {
    expect(dashboardNavigationItems.map((item) => item.href)).toEqual([
      '/dashboard',
      '/dashboard/contacts',
      '/dashboard/conversations',
      '/dashboard/appointments',
      '/dashboard/settings',
    ]);
  });

  it('uses unique hrefs and non-empty labels', () => {
    const hrefs = dashboardNavigationItems.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(dashboardNavigationItems.every((item) => item.label.trim().length > 0)).toBe(true);
  });
});
