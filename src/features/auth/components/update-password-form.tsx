"use client";

import { useId } from "react";
import { updatePasswordAction } from "@/features/auth/actions";
import { useAuthForm } from "./use-auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NEW_PASSWORD_MIN_LENGTH,
  NEW_PASSWORD_REQUIREMENT,
} from "@/lib/auth/password-policy";

export function UpdatePasswordForm() {
  const { state, action, pending, formRef, onSubmit } = useAuthForm(updatePasswordAction);
  const passwordErrorId = useId();
  const confirmErrorId = useId();
  const passwordRequirementId = useId();

  return (
    <form action={action} aria-busy={pending} className="min-w-0 space-y-5 [overflow-wrap:anywhere]" onSubmit={onSubmit} ref={formRef}>
      {state.message ? (
        <p
          className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm leading-5 text-danger"
          role="alert"
          tabIndex={-1}
        >
          {state.message}
        </p>
      ) : null}

      <p
        className="text-sm leading-5 text-muted-foreground"
        id={passwordRequirementId}
      >
        {NEW_PASSWORD_REQUIREMENT}
      </p>

      <PasswordField
        descriptionId={passwordRequirementId}
        error={state.fieldErrors?.password?.[0]}
        errorId={passwordErrorId}
        label="New password"
        name="password"
        pending={pending}
      />
      <PasswordField
        descriptionId={passwordRequirementId}
        error={state.fieldErrors?.passwordConfirm?.[0]}
        errorId={confirmErrorId}
        label="Confirm password"
        name="passwordConfirm"
        pending={pending}
      />

      <Button className="h-11 w-full" disabled={pending} type="submit" variant="default">
        {pending ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}

function PasswordField({
  descriptionId,
  error,
  errorId,
  label,
  name,
  pending,
}: {
  descriptionId: string;
  error?: string;
  errorId: string;
  label: string;
  name: string;
  pending: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-foreground">
      {label}
      <Input
        aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
        aria-invalid={Boolean(error)}
        autoComplete="new-password"
        className="mt-2 box-border h-11 px-3 text-sm"
        minLength={NEW_PASSWORD_MIN_LENGTH}
        name={name}
        readOnly={pending}
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
