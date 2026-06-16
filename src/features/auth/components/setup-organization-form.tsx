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
        Company name
        <Input
          autoComplete="organization"
          className="mt-2"
          name="organizationName"
          placeholder="Enter company name"
          type="text"
        />
        {state.fieldErrors?.organizationName?.length ? (
          <p className="mt-1 text-xs text-danger">
            {state.fieldErrors.organizationName[0]}
          </p>
        ) : null}
      </label>

      <Button className="w-full" disabled={pending} type="submit" variant="primary">
        {pending ? "Creating workspace..." : "Create workspace"}
      </Button>
    </form>
  );
}
