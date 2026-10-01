"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { RecordField } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import { Textarea } from "@/components/ui/textarea";
import {
  submitPublicInterestRequest,
  type PublicInterestRequestState,
} from "@/features/marketing/request-actions";

const initialState: PublicInterestRequestState = {};
const portfolioSizeOptions = [
  { label: "Choose a range", value: "" },
  { label: "1–25 units", value: "1-25" },
  { label: "26–100 units", value: "26-100" },
  { label: "101–500 units", value: "101-500" },
  { label: "500+ units", value: "500+" },
];

async function submitRequest(
  state: PublicInterestRequestState,
  formData: FormData,
): Promise<PublicInterestRequestState> {
  try {
    return await submitPublicInterestRequest(state, formData);
  } catch {
    return {
      status: "error",
      message: "We could not confirm your request. Please try again.",
    };
  }
}

export function PublicInterestForm({
  initialRequestType,
}: {
  initialRequestType: "demo" | "information";
}) {
  const [state, action, pending] = useActionState(
    submitRequest,
    initialState,
  );
  const [requestType, setRequestType] = useState(initialRequestType);
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const submitLocked = useRef(false);

  useEffect(() => {
    if (!pending) submitLocked.current = false;
  }, [pending]);

  useEffect(() => {
    if (state.status === "success") resultRef.current?.focus();
    if (state.status === "error") {
      const invalidField = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
      (invalidField ?? errorRef.current)?.focus();
    }
  }, [state]);

  if (state.status === "success") {
    return (
      <div
        className="flex min-h-[430px] flex-col justify-between rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8"
        ref={resultRef}
        role="status"
        tabIndex={-1}
      >
        <div>
          <CheckCircle2
            aria-hidden="true"
            className="text-success"
            size={30}
            strokeWidth={1.6}
          />
          <h2 className="mt-8 font-display text-3xl font-semibold leading-tight text-foreground">
            Thank you for your interest.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
            {state.message ?? "Demo scheduling and account setup are arranged separately."}
          </p>
        </div>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-primary transition-colors hover:text-primary/80"
            href="/"
          >
            Return home
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      action={action}
      aria-busy={pending ? "true" : "false"}
      aria-label="Request information or a demo"
      className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-7"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || submitLocked.current) return;
        submitLocked.current = true;
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      ref={formRef}
    >
      <fieldset className="space-y-5 border-0 p-0" disabled={pending}>
        <legend className="sr-only">Request details</legend>
        <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="request-website">Website</label>
          <input
            autoComplete="off"
            id="request-website"
            name="website"
            tabIndex={-1}
            type="text"
          />
        </div>

        <fieldset className="border-0 p-0">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Request
          </legend>
          <div className="mt-3 grid grid-cols-2 rounded-lg border border-border bg-muted/30 p-1">
            <RequestTypeOption
              active={requestType === "information"}
              label="Information"
              onSelect={setRequestType}
              value="information"
            />
            <RequestTypeOption
              active={requestType === "demo"}
              label="Demo"
              onSelect={setRequestType}
              value="demo"
            />
          </div>
          {state.fieldErrors?.requestType?.[0] ? (
            <p className="mt-1 text-xs text-danger">
              {state.fieldErrors.requestType[0]}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <RecordField
            error={state.fieldErrors?.fullName?.[0]}
            label="Full name"
            name="fullName"
            required
          >
            <Input
              autoComplete="name"
              maxLength={120}
              name="fullName"
              required
              type="text"
            />
          </RecordField>
          <RecordField
            error={state.fieldErrors?.workEmail?.[0]}
            label="Email"
            name="workEmail"
            required
          >
            <Input
              autoComplete="email"
              maxLength={254}
              name="workEmail"
              required
              type="email"
            />
          </RecordField>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <RecordField
            error={state.fieldErrors?.companyName?.[0]}
            label="Company"
            name="companyName"
            required
          >
            <Input
              autoComplete="organization"
              maxLength={160}
              name="companyName"
              required
              type="text"
            />
          </RecordField>
          <RecordField
            error={state.fieldErrors?.portfolioSize?.[0]}
            label="Number of units (optional)"
            name="portfolioSize"
          >
            <SelectControl
              ariaLabel="Number of units"
              name="portfolioSize"
              options={portfolioSizeOptions}
              placeholder="Choose a range"
            />
          </RecordField>
        </div>

        <RecordField
          error={state.fieldErrors?.message?.[0]}
          label="How can we help? (optional)"
          name="message"
        >
          <Textarea
            maxLength={1200}
            name="message"
            rows={3}
          />
        </RecordField>

        {state.message ? (
          <div ref={errorRef} tabIndex={-1}>
            <ErrorState
              className="min-h-0 rounded-md border border-danger/30 bg-danger-soft px-3 py-3"
              message={state.message}
              title="Request not confirmed"
            />
          </div>
        ) : null}

        <Button
          className="h-11 w-full rounded-lg px-5 text-[12px] font-semibold uppercase tracking-[0.14em]"
          size="lg"
          type="submit"
        >
          {pending
            ? "Sending request"
            : requestType === "demo"
              ? "Request a demo"
              : "Get information"}
          <ArrowRight aria-hidden="true" size={15} />
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          You agree to be contacted about this request. Demo scheduling and
          account setup are arranged separately.
        </p>
      </fieldset>
    </form>
  );
}

function RequestTypeOption({
  active,
  label,
  onSelect,
  value,
}: {
  active: boolean;
  label: string;
  onSelect: (value: "demo" | "information") => void;
  value: "demo" | "information";
}) {
  return (
    <label
      className={
        active
          ? "cursor-pointer rounded-md bg-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground shadow-sm outline-none transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-card"
          : "cursor-pointer rounded-md px-3 py-2 text-center text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-card"
      }
    >
      <input
        checked={active}
        className="sr-only"
        name="requestType"
        onChange={() => onSelect(value)}
        type="radio"
        value={value}
      />
      {label}
    </label>
  );
}
