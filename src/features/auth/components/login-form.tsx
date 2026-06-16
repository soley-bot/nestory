"use client";

import { useActionState } from "react";
import { loginAction, type AuthActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="mt-1 text-xs text-danger">{errors[0]}</p>;
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.message ? (
        <p
          className="rounded-md border border-danger/30 bg-white px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

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
          autoComplete="current-password"
          className="mt-2"
          name="password"
          placeholder="Enter password"
          type="password"
        />
        <FieldError errors={state.fieldErrors?.password} />
      </label>

      <Button className="w-full" disabled={pending} type="submit" variant="primary">
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
