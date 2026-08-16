"use client";

import { useFormState, useFormStatus } from "react-dom";

import type { ContactActionState } from "@/lib/domain/contacts/actions";

type ContactFormProps = {
  action: (
    previousState: ContactActionState,
    formData: FormData
  ) => Promise<ContactActionState>;
  contact?: {
    email: string | null;
    name: string;
    phone: string;
  };
  submitLabel: string;
};

function SubmitButton({ label }: { label: string }): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <button className="button-primary" disabled={pending} type="submit">
      {pending ? "Saving..." : label}
    </button>
  );
}

export function ContactForm({ action, contact, submitLabel }: ContactFormProps): React.ReactElement {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="name">
          Name
        </label>
        <input
          autoComplete="name"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          defaultValue={contact?.name ?? ""}
          id="name"
          maxLength={200}
          name="name"
          required
          type="text"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="phone">
          Phone
        </label>
        <input
          autoComplete="tel"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          defaultValue={contact?.phone ?? ""}
          id="phone"
          maxLength={50}
          name="phone"
          required
          type="tel"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900" htmlFor="email">
          Email <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <input
          autoComplete="email"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          defaultValue={contact?.email ?? ""}
          id="email"
          name="email"
          type="email"
        />
      </div>
      {state.error && (
        <p aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
