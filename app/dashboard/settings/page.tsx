import Link from "next/link";

import { schedulingWeekdays } from "@/lib/domain/appointments/scheduling";
import {
  createBlockedPeriodAction,
  deleteBlockedPeriodAction,
  updateBusinessProfileAction,
  updateReceptionistSettingsAction,
  updateSchedulingSettingsAction,
} from "@/lib/domain/business/actions";
import { getBusinessConfiguration } from "@/lib/domain/business/repository";
import { SettingsForm } from "@/components/settings/settings-form";

export const dynamic = "force-dynamic";

const field = "block w-full max-w-xl rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 sm:text-sm";

export default async function SettingsPage() {
  const configuration = await getBusinessConfiguration();
  const readOnly = !configuration.canManage;
  const scheduling = configuration.scheduling;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/dashboard">
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-4xl font-bold text-gray-900">Business settings</h1>
        <p className="mt-2 text-gray-600">
          {readOnly
            ? "You have read-only access. Only owners and admins can change configuration."
            : "Manage the business information your receptionist and scheduling use."}
        </p>

        <section aria-labelledby="business-profile" className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 id="business-profile" className="text-lg font-semibold text-gray-900">
            Business profile
          </h2>
          <div className="mt-4">
            <SettingsForm
              action={updateBusinessProfileAction}
              submitLabel="Save profile"
              readOnly={readOnly}
            >
              <label className="block text-sm font-medium text-gray-900">
                Business name
                <input name="name" defaultValue={configuration.profile.name} required className={`mt-2 ${field}`} />
              </label>
              <label className="block text-sm font-medium text-gray-900">
                Description
                <textarea
                  name="description"
                  rows={3}
                  maxLength={2000}
                  defaultValue={configuration.profile.description ?? ""}
                  className={`mt-2 ${field}`}
                />
              </label>
              <label className="block text-sm font-medium text-gray-900">
                Public email
                <input
                  name="publicEmail"
                  defaultValue={configuration.profile.publicEmail ?? ""}
                  className={`mt-2 ${field}`}
                />
              </label>
              <label className="block text-sm font-medium text-gray-900">
                Public phone
                <input
                  name="publicPhone"
                  defaultValue={configuration.profile.publicPhone ?? ""}
                  className={`mt-2 ${field}`}
                />
              </label>
              <label className="block text-sm font-medium text-gray-900">
                Address
                <textarea
                  name="address"
                  rows={2}
                  maxLength={500}
                  defaultValue={configuration.profile.address ?? ""}
                  className={`mt-2 ${field}`}
                />
              </label>
            </SettingsForm>
          </div>
        </section>

        <section aria-labelledby="scheduling" className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 id="scheduling" className="text-lg font-semibold text-gray-900">
            Scheduling
          </h2>
          <div className="mt-4">
            <SettingsForm
              action={updateSchedulingSettingsAction}
              submitLabel="Save scheduling"
              readOnly={readOnly}
            >
              <label className="block text-sm font-medium text-gray-900">
                Timezone
                <input
                  name="timezone"
                  defaultValue={scheduling?.timezone ?? "UTC"}
                  required
                  className={`mt-2 ${field}`}
                />
              </label>
              <label className="block text-sm font-medium text-gray-900">
                Default appointment duration (minutes)
                <input
                  name="defaultDurationMinutes"
                  type="number"
                  min={1}
                  max={1440}
                  defaultValue={scheduling?.defaultDurationMinutes ?? 30}
                  required
                  className={`mt-2 max-w-xs ${field}`}
                />
              </label>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-900">Working days &amp; hours</p>
                {schedulingWeekdays.map((day) => {
                  const interval = scheduling?.businessHours?.[day] ?? null;
                  return (
                    <div className="flex flex-wrap items-center gap-3 text-sm" key={day}>
                      <label className="flex w-32 items-center gap-2 capitalize text-gray-900">
                        <input
                          type="checkbox"
                          name={`day-${day}`}
                          defaultChecked={scheduling?.workingDays?.includes(day) ?? false}
                        />
                        {day}
                      </label>
                      <input
                        type="time"
                        name={`start-${day}`}
                        defaultValue={interval?.start ?? "09:00"}
                        className="rounded-md border border-gray-300 px-2 py-1 text-gray-900"
                      />
                      <input
                        type="time"
                        name={`end-${day}`}
                        defaultValue={interval?.end ?? "17:00"}
                        className="rounded-md border border-gray-300 px-2 py-1 text-gray-900"
                      />
                    </div>
                  );
                })}
              </div>
            </SettingsForm>
          </div>
        </section>

        <section aria-labelledby="blocked-periods" className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 id="blocked-periods" className="text-lg font-semibold text-gray-900">
            Blocked periods
          </h2>
          <div className="mt-4">
            {configuration.blockedPeriods.length === 0 ? (
              <p className="text-sm text-gray-600">No blocked periods.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {configuration.blockedPeriods.map((period) => (
                  <li className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-gray-200 px-3 py-2" key={period.id}>
                    <span className="text-gray-900">
                      {period.startsAt} to {period.endsAt}
                      {period.reason ? ` — ${period.reason}` : ""}
                    </span>
                    {readOnly ? null : (
                      <SettingsForm
                        action={deleteBlockedPeriodAction}
                        submitLabel="Remove"
                        readOnly={readOnly}
                      >
                        <input type="hidden" name="blockedPeriodId" value={period.id} />
                      </SettingsForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-4">
            <SettingsForm
              action={createBlockedPeriodAction}
              submitLabel="Add blocked period"
              readOnly={readOnly}
            >
              <label className="block text-sm font-medium text-gray-900">
                Starts at
                <input name="startsAt" type="datetime-local" required className={`mt-2 ${field}`} />
              </label>
              <label className="block text-sm font-medium text-gray-900">
                Ends at
                <input name="endsAt" type="datetime-local" required className={`mt-2 ${field}`} />
              </label>
              <label className="block text-sm font-medium text-gray-900">
                Reason
                <input name="reason" maxLength={500} className={`mt-2 ${field}`} />
              </label>
            </SettingsForm>
          </div>
        </section>

        <section aria-labelledby="whatsapp" className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 id="whatsapp" className="text-lg font-semibold text-gray-900">
            WhatsApp
          </h2>
          <div className="mt-4">
            {configuration.whatsApp.length === 0 ? (
              <p className="text-sm text-gray-600">No WhatsApp configuration.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {configuration.whatsApp.map((config) => (
                  <li className="rounded-md border border-gray-200 p-3 text-gray-900" key={config.id}>
                    <p>Phone number ID: {config.phoneNumberId}</p>
                    <p>Business account ID: {config.businessAccountId}</p>
                    <p>Display number: {config.displayPhoneNumber ?? "Not set"}</p>
                    <p>Status: {config.isActive ? "Active" : "Inactive"}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-gray-500">
              Access tokens, app secrets and verify tokens are stored in Supabase Vault and are never
              shown here.
            </p>
          </div>
        </section>

        <section aria-labelledby="receptionist" className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 id="receptionist" className="text-lg font-semibold text-gray-900">
            AI receptionist
          </h2>
          <div className="mt-4">
            <SettingsForm
              action={updateReceptionistSettingsAction}
              submitLabel="Save receptionist settings"
              readOnly={readOnly}
            >
              <label className="block text-sm font-medium text-gray-900">
                Receptionist instructions
                <textarea
                  name="instructions"
                  rows={4}
                  maxLength={4000}
                  defaultValue={configuration.receptionist.instructions ?? ""}
                  className={`mt-2 ${field}`}
                />
              </label>
              <label className="block text-sm font-medium text-gray-900">
                Business FAQ
                <textarea
                  name="faq"
                  rows={4}
                  maxLength={4000}
                  defaultValue={configuration.receptionist.faq ?? ""}
                  className={`mt-2 ${field}`}
                />
              </label>
            </SettingsForm>
          </div>
        </section>
      </div>
    </main>
  );
}
