"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { RecordField } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import { StatusNotice } from "@/components/ui/status-notice";
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

export function PublicInterestForm({
  initialRequestType,
}: {
  initialRequestType: "demo" | "information";
}) {
  const [state, action, pending] = useActionState(
    submitPublicInterestRequest,
    initialState,
  );

  if (state.status === "success") {
    return (
      <div
        className="flex min-h-[430px] flex-col justify-between rounded-lg border border-[var(--landing-border)] bg-[var(--surface)] p-6 sm:p-8"
        role="status"
      >
        <div>
          <CheckCircle2
            aria-hidden="true"
            className="text-[var(--landing-accent)]"
            size={30}
            strokeWidth={1.6}
          />
          <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--landing-subtle)]">
            Request received
          </p>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight text-[var(--landing-heading)]">
            We have your operating brief.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-[var(--landing-muted)]">
            We will use the context you shared to prepare a focused follow-up.
          </p>
          <StatusNotice
            className="mt-6"
            message={state.message ?? "We will follow up at your work email."}
            title="Follow-up queued"
            tone="success"
          />
        </div>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--landing-accent)]"
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
      className="rounded-lg border border-[var(--landing-border)] bg-[var(--surface)] p-5 shadow-sm sm:p-7"
    >
      <fieldset className="space-y-5 border-0 p-0" disabled={pending}>
        <legend className="sr-only">Request details</legend>
        <input name="requestType" type="hidden" value={initialRequestType} />
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

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--landing-subtle)]">
            I want to
          </p>
          <div className="mt-3 grid grid-cols-2 rounded-lg border border-[var(--landing-border)] p-1">
            <RequestTypeLink
              active={initialRequestType === "information"}
              href="/request?intent=information"
              label="Request information"
            />
            <RequestTypeLink
              active={initialRequestType === "demo"}
              href="/request?intent=demo"
              label="Request a demo"
            />
          </div>
          {state.fieldErrors?.requestType?.[0] ? (
            <p className="mt-1 text-xs text-danger">
              {state.fieldErrors.requestType[0]}
            </p>
          ) : null}
        </div>

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
              placeholder="Mara Sok"
              required
              type="text"
            />
          </RecordField>
          <RecordField
            error={state.fieldErrors?.workEmail?.[0]}
            label="Work email"
            name="workEmail"
            required
          >
            <Input
              autoComplete="email"
              maxLength={254}
              name="workEmail"
              placeholder="mara@company.com"
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
              placeholder="Central Property Group"
              required
              type="text"
            />
          </RecordField>
          <RecordField
            error={state.fieldErrors?.portfolioSize?.[0]}
            label="Portfolio size"
            name="portfolioSize"
          >
            <SelectControl
              ariaLabel="Portfolio size"
              name="portfolioSize"
              options={portfolioSizeOptions}
              placeholder="Choose a range"
            />
          </RecordField>
        </div>

        <RecordField
          error={state.fieldErrors?.message?.[0]}
          label="What should we understand about your operation?"
          name="message"
        >
          <Textarea
            maxLength={1200}
            name="message"
            placeholder="Current portfolio, operating challenges, or what you want to see."
            rows={5}
          />
        </RecordField>

        {state.message ? (
          <ErrorState
            className="min-h-0 rounded-md border border-danger/30 bg-danger-soft px-3 py-3"
            message={state.message}
            title="Request not saved"
          />
        ) : null}

        <Button
          className="h-11 w-full rounded-full border-0 bg-[var(--landing-cta-bg)] px-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--landing-cta-fg)] hover:bg-[var(--landing-cta-bg)] hover:opacity-90"
          type="submit"
        >
          {pending
            ? "Sending request"
            : initialRequestType === "demo"
              ? "Request a demo"
              : "Request information"}
          <ArrowRight aria-hidden="true" size={15} />
        </Button>
        <p className="text-xs leading-5 text-[var(--landing-subtle)]">
          By submitting, you ask Nestory to contact you about this request. No
          workspace is created automatically.
        </p>
      </fieldset>
    </form>
  );
}

function RequestTypeLink({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-md bg-[var(--landing-cta-bg)] px-3 py-2 text-center text-xs font-semibold text-[var(--landing-cta-fg)]"
          : "rounded-md px-3 py-2 text-center text-xs font-semibold text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-heading)]"
      }
      href={href}
      replace
      scroll={false}
    >
      {label}
    </Link>
  );
}
