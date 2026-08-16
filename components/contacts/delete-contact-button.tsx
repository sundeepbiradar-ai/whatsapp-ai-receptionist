"use client";

import { useFormStatus } from "react-dom";

type DeleteContactButtonProps = {
  action: () => Promise<void>;
};

function DeleteButton(): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <button className="button-danger" disabled={pending} type="submit">
      {pending ? "Deleting..." : "Delete contact"}
    </button>
  );
}

export function DeleteContactButton({ action }: DeleteContactButtonProps): React.ReactElement {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Delete this contact? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <DeleteButton />
    </form>
  );
}
