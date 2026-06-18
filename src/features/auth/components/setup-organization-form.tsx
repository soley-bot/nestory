"use client";

import { useActionState } from "react";
import {
  setupOrganizationAction,
  type AuthActionState,
} from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

export function SetupOrganizationForm() {
  const [state, action, pending] = useActionState(
    setupOrganizationAction,
    initialState,
  );

  return (
    <form action={action} className="mt-6 space-y-5">
      {state.message ? (
        <p
          className="rounded-md border border-danger/25 bg-[#fff7f7] px-3.5 py-3 text-sm leading-5 text-danger"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <label className="block text-sm font-semibold text-[#2e3540]">
        Company name
        <Input
          autoComplete="organization"
          className="mt-2 box-border h-11 border-[#dfe4ea] bg-white text-[15px] text-[#080b12] placeholder:text-[#9aa0aa] focus:border-[#b8c0cb] focus:ring-[#f1f3f6]"
          name="organizationName"
          placeholder="Enter company name"
          type="text"
        />
        {state.fieldErrors?.organizationName?.length ? (
          <p className="mt-2 text-xs leading-5 text-danger">
            {state.fieldErrors.organizationName[0]}
          </p>
        ) : null}
      </label>

      <Button
        className="box-border h-11 w-full bg-[#080b12] text-[12px] font-semibold uppercase tracking-[0.14em] hover:bg-[#16181d]"
        disabled={pending}
        type="submit"
        variant="primary"
      >
        {pending ? "Creating workspace..." : "Create workspace"}
      </Button>
    </form>
  );
}
