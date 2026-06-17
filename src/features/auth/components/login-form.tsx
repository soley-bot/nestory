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

  return <p className="mt-2 text-xs leading-5 text-danger">{errors[0]}</p>;
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="space-y-5">
      {state.message ? (
        <p
          className="rounded-md border border-danger/25 bg-[#fff7f7] px-3.5 py-3 text-sm leading-5 text-danger"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <label className="block text-sm font-semibold text-[#2e3540]">
        Email
        <Input
          autoComplete="email"
          className="mt-2 h-11 border-[#dfe4ea] bg-white text-[15px] text-[#080b12] placeholder:text-[#9aa0aa] focus:border-[#b8c0cb] focus:ring-[#f1f3f6]"
          name="email"
          placeholder="admin@example.com"
          type="email"
        />
        <FieldError errors={state.fieldErrors?.email} />
      </label>

      <label className="block text-sm font-semibold text-[#2e3540]">
        Password
        <Input
          autoComplete="current-password"
          className="mt-2 h-11 border-[#dfe4ea] bg-white text-[15px] text-[#080b12] placeholder:text-[#9aa0aa] focus:border-[#b8c0cb] focus:ring-[#f1f3f6]"
          name="password"
          placeholder="Enter password"
          type="password"
        />
        <FieldError errors={state.fieldErrors?.password} />
      </label>

      <Button
        className="h-11 w-full bg-[#080b12] text-[12px] font-semibold uppercase tracking-[0.14em] hover:bg-[#16181d]"
        disabled={pending}
        type="submit"
        variant="primary"
      >
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
