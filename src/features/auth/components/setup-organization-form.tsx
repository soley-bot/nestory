"use client";

import { useActionState, useId, useMemo, useState } from "react";
import {
  setupOrganizationAction,
  type AuthActionState,
} from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

function toWorkspaceSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

type SetupOrganizationFormProps = {
  rootDomain: string;
};

export function SetupOrganizationForm({ rootDomain }: SetupOrganizationFormProps) {
  const [state, action, pending] = useActionState(
    setupOrganizationAction,
    initialState,
  );
  const companyNameId = useId();
  const workspaceSlugId = useId();
  const workspaceSlugHelpId = useId();
  const [companyName, setCompanyName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const workspaceUrl = useMemo(
    () => `https://${workspaceSlug || "workspace"}.${rootDomain}`,
    [rootDomain, workspaceSlug],
  );

  return (
    <form action={action} className="mt-6 space-y-6">
      {state.message ? (
        <p
          className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm leading-5 text-danger"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <label className="block text-sm font-semibold text-foreground" htmlFor={companyNameId}>
        Workspace name
        <Input
          aria-invalid={Boolean(state.fieldErrors?.organizationName?.length)}
          autoComplete="organization"
          id={companyNameId}
          className="mt-2 box-border h-11 px-3 text-[15px] text-foreground placeholder:text-foreground-subtle"
          name="organizationName"
          onChange={(event) => {
            const nextName = event.target.value;
            setCompanyName(nextName);

            if (!slugTouched) {
              setWorkspaceSlug(toWorkspaceSlug(nextName));
            }
          }}
          placeholder="Bassac Garden Management"
          required
          type="text"
          value={companyName}
        />
        {state.fieldErrors?.organizationName?.length ? (
          <p className="mt-2 text-xs leading-5 text-danger">
            {state.fieldErrors.organizationName[0]}
          </p>
        ) : null}
      </label>

      <div>
        <label
          className="block text-sm font-semibold text-foreground"
          htmlFor={workspaceSlugId}
        >
          Workspace URL
        </label>
        <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-md border border-border bg-surface shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-focus-ring">
          <Input
            aria-describedby={workspaceSlugHelpId}
            aria-invalid={Boolean(state.fieldErrors?.workspaceSlug?.length)}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            className="h-11 rounded-none border-0 bg-transparent px-3 text-[15px] shadow-none focus:border-transparent focus:ring-0"
            id={workspaceSlugId}
            maxLength={63}
            minLength={3}
            name="workspaceSlug"
            onChange={(event) => {
              setSlugTouched(true);
              setWorkspaceSlug(toWorkspaceSlug(event.target.value));
            }}
            pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
            placeholder="bassac-garden"
            required
            spellCheck={false}
            type="text"
            value={workspaceSlug}
          />
          <span
            className="flex max-w-[46vw] items-center border-l border-border bg-surface-muted px-3 text-sm text-foreground-muted sm:max-w-56"
            title={`.${rootDomain}`}
          >
            .{rootDomain}
          </span>
        </div>
        <p
          className="mt-2 break-all text-xs leading-5 text-foreground-muted"
          id={workspaceSlugHelpId}
        >
          {workspaceUrl}
        </p>
        {state.fieldErrors?.workspaceSlug?.length ? (
          <p className="mt-2 text-xs leading-5 text-danger">
            {state.fieldErrors.workspaceSlug[0]}
          </p>
        ) : null}
      </div>

      <div className="border-y border-border py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-subtle">
          After setup
        </p>
        <div className="mt-3 grid gap-3 text-sm leading-6 text-foreground-muted">
          <p>
            Add the first property record, then attach units, leases, rent, and
            maintenance history to it.
          </p>
          <p>
            You can also import data later from the workspace dashboard.
          </p>
        </div>
      </div>

      <Button
        className="box-border h-11 w-full border-foreground bg-foreground text-[12px] font-semibold uppercase tracking-[0.14em] text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-70"
        disabled={pending}
        type="submit"
        variant="primary"
      >
        {pending ? "Creating workspace..." : "Create workspace"}
      </Button>
    </form>
  );
}
