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

const field = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

export default async function SettingsPage() {
  const configuration = await getBusinessConfiguration();
  const readOnly = !configuration.canManage;
  const scheduling = configuration.scheduling;

  return (
    <main className="mx-auto max-w-3xl space-y-10 p-6">
      <header>
        <Link className="text-sm font-medium text-primary-700 hover:text-primary-800" href="/dashboard">
          Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Business settings</h1>
        <p className="text-sm text-slate-600">
          {readOnly
            ? "You have read-only access. Only owners and admins can change configuration."
            : "Manage the business information your receptionist and scheduling use."}
        </p>
      </header>

      <section aria-labelledby="business-profile" className="space-y-4">
        <h2 id="business-profile" className="text-lg font-medium">
          Business profile
        </h2>
        <SettingsForm
          action={updateBusinessProfileAction}
          submitLabel="Save profile"
          readOnly={readOnly}
        >
          <label className="block text-sm">
            Business name
            <input name="name" defaultValue={configuration.profile.name} required className={field} />
          </label>
          <label className="block text-sm">
            Description
            <textarea
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={configuration.profile.description ?? ""}
              className={field}
            />
          </label>
          <label className="block text-sm">
            Public email
            <input
              name="publicEmail"
              defaultValue={configuration.profile.publicEmail ?? ""}
              className={field}
            />
          </label>
          <label className="block text-sm">
            Public phone
            <input
              name="publicPhone"
              defaultValue={configuration.profile.publicPhone ?? ""}
              className={field}
            />
          </label>
          <label className="block text-sm">
            Address
            <textarea
              name="address"
              rows={2}
              maxLength={500}
              defaultValue={configuration.profile.address ?? ""}
              className={field}
            />
          </label>
        </SettingsForm>
      </section>

      <section aria-labelledby="scheduling" className="space-y-4">
        <h2 id="scheduling" className="text-lg font-medium">
          Scheduling
        </h2>
        <SettingsForm
          action={updateSchedulingSettingsAction}
          submitLabel="Save scheduling"
          readOnly={readOnly}
        >
          <label className="block text-sm">
            Timezone
            <input
              name="timezone"
              defaultValue={scheduling?.timezone ?? "UTC"}
              required
              className={field}
            />
          </label>
          <label className="block text-sm">
            Default appointment duration (minutes)
            <input
              name="defaultDurationMinutes"
              type="number"
              min={1}
              max={1440}
              defaultValue={scheduling?.defaultDurationMinutes ?? 30}
              required
              className={field}
            />
          </label>
          <div className="space-y-2">
            {schedulingWeekdays.map((day) => {
              const interval = scheduling?.businessHours?.[day] ?? null;
              return (
                <div key={day} className="flex items-center gap-3 text-sm">
                  <label className="flex w-32 items-center gap-2 capitalize">
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
                    className="rounded-md border border-slate-300 px-2 py-1"
                  />
                  <input
                    type="time"
                    name={`end-${day}`}
                    defaultValue={interval?.end ?? "17:00"}
                    className="rounded-md border border-slate-300 px-2 py-1"
                  />
                </div>
              );
            })}
          </div>
        </SettingsForm>
      </section>

      <section aria-labelledby="blocked-periods" className="space-y-4">
        <h2 id="blocked-periods" className="text-lg font-medium">
          Blocked periods
        </h2>
        {configuration.blockedPeriods.length === 0 ? (
          <p className="text-sm text-slate-600">No blocked periods.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {configuration.blockedPeriods.map((period) => (
              <li key={period.id} className="flex items-center justify-between gap-4">
                <span>
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
        <SettingsForm
          action={createBlockedPeriodAction}
          submitLabel="Add blocked period"
          readOnly={readOnly}
        >
          <label className="block text-sm">
            Starts at
            <input name="startsAt" type="datetime-local" required className={field} />
          </label>
          <label className="block text-sm">
            Ends at
            <input name="endsAt" type="datetime-local" required className={field} />
          </label>
          <label className="block text-sm">
            Reason
            <input name="reason" maxLength={500} className={field} />
          </label>
        </SettingsForm>
      </section>

      <section aria-labelledby="whatsapp" className="space-y-4">
        <h2 id="whatsapp" className="text-lg font-medium">
          WhatsApp
        </h2>
        {configuration.whatsApp.length === 0 ? (
          <p className="text-sm text-slate-600">No WhatsApp configuration.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {configuration.whatsApp.map((config) => (
              <li key={config.id} className="rounded-md border border-slate-200 p-3">
                <p>Phone number ID: {config.phoneNumberId}</p>
                <p>Business account ID: {config.businessAccountId}</p>
                <p>Display number: {config.displayPhoneNumber ?? "Not set"}</p>
                <p>Status: {config.isActive ? "Active" : "Inactive"}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">
          Access tokens, app secrets and verify tokens are stored in Supabase Vault and are never
          shown here.
        </p>
      </section>

      <section aria-labelledby="receptionist" className="space-y-4">
        <h2 id="receptionist" className="text-lg font-medium">
          AI receptionist
        </h2>
        <SettingsForm
          action={updateReceptionistSettingsAction}
          submitLabel="Save receptionist settings"
          readOnly={readOnly}
        >
          <label className="block text-sm">
            Receptionist instructions
            <textarea
              name="instructions"
              rows={4}
              maxLength={4000}
              defaultValue={configuration.receptionist.instructions ?? ""}
              className={field}
            />
          </label>
          <label className="block text-sm">
            Business FAQ
            <textarea
              name="faq"
              rows={4}
              maxLength={4000}
              defaultValue={configuration.receptionist.faq ?? ""}
              className={field}
            />
          </label>
        </SettingsForm>
      </section>
    </main>
  );
}
