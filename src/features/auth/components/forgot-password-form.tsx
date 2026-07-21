"use client";

import { useActionState, useId } from "react";
import {
  requestPasswordRecoveryAction,
  type AuthActionState,
} from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordRecoveryAction,
    initialState,
  );
  const emailErrorId = useId();

  return (
    <form action={action} className="space-y-5">
      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "rounded-md border border-success/25 bg-success-soft px-3.5 py-3 text-sm leading-5 text-success"
              : "rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm leading-5 text-danger"
          }
          role={state.status === "success" ? "status" : "alert"}
        >
          {state.message}
        </p>
      ) : null}

      <label className="block text-sm font-semibold text-foreground">
        Email
        <Input
          aria-describedby={state.fieldErrors?.email?.length ? emailErrorId : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email?.length)}
          autoComplete="email"
          className="mt-2 box-border h-11 px-3 text-[15px]"
          name="email"
          required
          type="email"
        />
        {state.fieldErrors?.email?.[0] ? (
          <p className="mt-2 text-xs leading-5 text-danger" id={emailErrorId}>
            {state.fieldErrors.email[0]}
          </p>
        ) : null}
      </label>

      <Button className="h-11 w-full" disabled={pending} type="submit" variant="primary">
        {pending ? "Sending..." : "Send recovery link"}
      </Button>
    </form>
  );
}
