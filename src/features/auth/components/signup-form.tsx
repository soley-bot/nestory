"use client";

import { useActionState, useId } from "react";
import { signupAction, type AuthActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

function FieldError({ errors, id }: { errors?: string[]; id: string }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="mt-2 text-xs leading-5 text-danger" id={id}>{errors[0]}</p>;
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initialState);
  const isSuccess = state.status === "success";
  const emailErrorId = useId();
  const passwordErrorId = useId();

  return (
    <form action={action} className="space-y-5">
      {state.message ? (
        <p
          className={
            isSuccess
              ? "rounded-md border border-success/25 bg-success-soft px-3.5 py-3 text-sm leading-5 text-success"
              : "rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm leading-5 text-danger"
          }
          role="status"
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
          className="mt-2 box-border h-11 px-3 text-[15px] text-foreground placeholder:text-foreground-subtle"
          name="email"
          placeholder="admin@example.com"
          type="email"
        />
        <FieldError errors={state.fieldErrors?.email} id={emailErrorId} />
      </label>

      <label className="block text-sm font-semibold text-foreground">
        Password
        <Input
          aria-describedby={state.fieldErrors?.password?.length ? passwordErrorId : undefined}
          aria-invalid={Boolean(state.fieldErrors?.password?.length)}
          autoComplete="new-password"
          className="mt-2 box-border h-11 px-3 text-[15px] text-foreground placeholder:text-foreground-subtle"
          name="password"
          placeholder="Create password"
          type="password"
        />
        <FieldError errors={state.fieldErrors?.password} id={passwordErrorId} />
      </label>

      <Button
        className="box-border h-11 w-full border-foreground bg-foreground text-[12px] font-semibold uppercase tracking-[0.14em] text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-70"
        disabled={pending || isSuccess}
        type="submit"
        variant="primary"
      >
        {pending ? "Creating..." : "Create workspace"}
      </Button>

      <p className="text-xs leading-5 text-foreground-muted">
        Use an inbox you can access. Setup starts after confirmation.
      </p>
    </form>
  );
}
