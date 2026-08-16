import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import type { Database } from '@/lib/supabase/database';

const url = process.env['E2E_SUPABASE_URL'];
const anonKey = process.env['E2E_SUPABASE_ANON_KEY'];
const serviceRoleKey = process.env['E2E_SUPABASE_SERVICE_ROLE_KEY'];
const hasEnvironment = Boolean(url && anonKey && serviceRoleKey);
const email = `dashboard-${randomUUID()}@example.com`;
const password = `Dashboard-${randomUUID()}-A9!`;
let admin: SupabaseClient<Database> | undefined;
let userId: string | undefined;
let organizationId: string | undefined;

function createAdmin(): SupabaseClient<Database> | undefined {
  if (!url || !serviceRoleKey) return undefined;
  return createClient<Database>(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

test.describe('Dashboard overview', () => {
  test.skip(!hasEnvironment, 'Set dedicated E2E Supabase variables for dashboard overview tests.');

  test.beforeAll(() => {
    admin = createAdmin();
  });

  test.afterAll(async () => {
    if (admin && organizationId) await admin.from('organizations').delete().eq('id', organizationId);
    if (admin && userId) await admin.auth.admin.deleteUser(userId);
  });

  test('shows scoped summary sections and recent activity', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/(dashboard|login)$/);
    if (page.url().endsWith('/login')) {
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Log in' }).click();
    }
    await expect(page).toHaveURL(/\/dashboard$/);

    const users = await admin?.auth.admin.listUsers({ page: 1, perPage: 100 });
    userId = users?.data.users.find((user) => user.email === email)?.id;
    expect(userId).toBeDefined();

    await page.goto('/onboarding');
    await page.getByLabel('Organization name').fill('Dashboard E2E Organization');
    await page.getByRole('button', { name: 'Create organization' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const organization = await admin?.from('organizations').select('id').eq('name', 'Dashboard E2E Organization').single();
    organizationId = organization?.data?.id;
    expect(organization?.error).toBeNull();
    expect(organizationId).toBeDefined();

    const contact = await admin?.from('contacts').insert({ organization_id: organizationId ?? '', phone: '+15550000003', name: 'Dashboard Contact' }).select('id').single();
    expect(contact?.error).toBeNull();
    const conversation = await admin?.from('conversations').insert({ organization_id: organizationId ?? '', contact_id: contact?.data?.id ?? '', status: 'open' }).select('id').single();
    expect(conversation?.error).toBeNull();
    const appointment = await admin?.from('appointments').insert({ organization_id: organizationId ?? '', contact_id: contact?.data?.id ?? '', conversation_id: conversation?.data?.id ?? null, starts_at: '2099-01-01T10:00:00Z', ends_at: '2099-01-01T11:00:00Z', status: 'confirmed', notes: 'Dashboard appointment' }).select('id').single();
    expect(appointment?.error).toBeNull();

    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'Contacts 1' })).toBeVisible();
    await expect(page.getByText('Recent conversations')).toBeVisible();
    await expect(page.getByText('Upcoming appointments')).toBeVisible();
    await expect(page.getByText('Recent contacts')).toBeVisible();
    await expect(page.getByRole('link', { name: /Dashboard Contact/ }).first()).toBeVisible();
    await expect(page.getByText('Dashboard appointment')).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'View all' }).first()).toHaveAttribute('href', '/dashboard/conversations');
  });
});
