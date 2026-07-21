"use client";

import { useActionState, useId } from "react";
import {
  updatePasswordAction,
  type AuthActionState,
} from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(
    updatePasswordAction,
    initialState,
  );
  const passwordErrorId = useId();
  const confirmErrorId = useId();

  return (
    <form action={action} className="space-y-5">
      {state.message ? (
        <p
          className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm leading-5 text-danger"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <PasswordField
        error={state.fieldErrors?.password?.[0]}
        errorId={passwordErrorId}
        label="New password"
        name="password"
      />
      <PasswordField
        error={state.fieldErrors?.passwordConfirm?.[0]}
        errorId={confirmErrorId}
        label="Confirm password"
        name="passwordConfirm"
      />

      <Button className="h-11 w-full" disabled={pending} type="submit" variant="primary">
        {pending ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}

function PasswordField({
  error,
  errorId,
  label,
  name,
}: {
  error?: string;
  errorId: string;
  label: string;
  name: string;
}) {
  return (
    <label className="block text-sm font-semibold text-foreground">
      {label}
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        autoComplete="new-password"
        className="mt-2 box-border h-11 px-3 text-[15px]"
        minLength={8}
        name={name}
        required
        type="password"
      />
      {error ? (
        <p className="mt-2 text-xs leading-5 text-danger" id={errorId}>
          {error}
        </p>
      ) : null}
    </label>
  );
}
