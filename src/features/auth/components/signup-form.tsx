"use client";

import { useActionState } from "react";
import { signupAction, type AuthActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="mt-1 text-xs text-danger">{errors[0]}</p>;
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initialState);
  const isSuccess = state.status === "success";

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.message ? (
        <p
          className={
            isSuccess
              ? "rounded-md border border-success/30 bg-white px-3 py-2 text-sm text-success"
              : "rounded-md border border-danger/30 bg-white px-3 py-2 text-sm text-danger"
          }
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      <label className="block text-sm font-medium">
        Company name
        <Input
          autoComplete="organization"
          className="mt-2"
          name="organizationName"
          placeholder="IPS Cambodia"
          type="text"
        />
        <FieldError errors={state.fieldErrors?.organizationName} />
      </label>

      <label className="block text-sm font-medium">
        Email
        <Input
          autoComplete="email"
          className="mt-2"
          name="email"
          placeholder="admin@example.com"
          type="email"
        />
        <FieldError errors={state.fieldErrors?.email} />
      </label>

      <label className="block text-sm font-medium">
        Password
        <Input
          autoComplete="new-password"
          className="mt-2"
          name="password"
          placeholder="Create password"
          type="password"
        />
        <FieldError errors={state.fieldErrors?.password} />
      </label>

      <Button className="w-full" disabled={pending || isSuccess} type="submit" variant="primary">
        {pending ? "Creating..." : "Create account"}
      </Button>
    </form>
  );
}
