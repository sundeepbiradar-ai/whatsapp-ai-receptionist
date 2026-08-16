"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { AppointmentActionState } from "@/lib/domain/appointments/actions";

function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();
  return <button className="button-secondary" disabled={pending} type="submit">{pending ? "Updating..." : "Cancel appointment"}</button>;
}

export function AppointmentStatusForm({ action }: { action: (previous: AppointmentActionState, formData: FormData) => Promise<AppointmentActionState> }): React.ReactElement {
  const [state, formAction] = useFormState(action, {});
  return <form action={formAction}>{state.error && <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{state.error}</p>}<input name="status" type="hidden" value="cancelled" /><SubmitButton /></form>;
}
