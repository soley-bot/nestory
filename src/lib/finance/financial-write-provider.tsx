"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useOverlayFormDraftGuard, useOverlayCloseRequest } from "@/components/ui/overlay-dismissal-context";
import { Button } from "@/components/ui/button";
import { FINANCIAL_GENERATION_FIELD, financialContextKey, financialWriteContextSchema, type FinancialWriteContext } from "./financial-write-context";

type FinancialSession = { context: FinancialWriteContext; invalid: boolean };
const FinancialContext = createContext<FinancialSession | null>(null);

export function FinancialWriteProvider({ children, context, organizationId }: {
  children: ReactNode; context: FinancialWriteContext; organizationId: string;
}) {
  const [initial] = useState(context);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    let disposed = false;
    let running = false;
    const check = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const response = await fetch("/api/workspace/financial-context", { cache: "no-store" });
        if (!response.ok) throw new Error("Financial context unavailable");
        const body = await response.json();
        const latest = financialWriteContextSchema.parse(body.context);
        if (!disposed && (body.organizationId !== organizationId || financialContextKey(latest) !== financialContextKey(initial))) setInvalid(true);
      } catch {
        // A failed status check cannot certify that an old form remains current.
        if (!disposed) setInvalid(true);
      } finally { running = false; }
    };
    const onVisible = () => { void check(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, 30_000);
    void check();
    return () => { disposed = true; clearInterval(timer); window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [initial, organizationId]);
  const blocked = invalid || initial.status === "frozen" || financialContextKey(context) !== financialContextKey(initial);
  return <FinancialContext.Provider value={{ context: initial, invalid: blocked }}>
    {blocked ? <div role="alert" className="border-b border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      {initial.status === "frozen" ? "Financial changes and reports are paused while this workspace is being reset." : "The workspace’s financial session changed or could not be verified. Reload before entering transactions or using reports."}
      <button className="ml-3 underline" onClick={() => window.location.reload()} type="button">Reload page</button>
    </div> : null}
    {children}
  </FinancialContext.Provider>;
}

export function useFinancialWriteContext() { return useContext(FinancialContext); }

export function FinancialReportBoundary({ children, fallback, expectedGeneration }: { children: ReactNode; fallback?: ReactNode; expectedGeneration?: number }) {
  const session = useFinancialWriteContext();
  if (session?.invalid || (session && expectedGeneration !== undefined && session.context.generation !== expectedGeneration)) return <><p role="alert" className="p-4 text-sm">Reload the page to verify the financial session before using this report.</p>{fallback}</>;
  return children;
}

export function FinancialReportLink({ href, children, ...props }: ComponentProps<"a">) {
  const session = useFinancialWriteContext();
  const [generation] = useState(session?.context.generation);
  if (session?.invalid) return <span className={props.className} aria-disabled="true">{children}</span>;
  let target = href;
  if (href && generation !== undefined) {
    const url = new URL(href, "https://financial-report.invalid");
    url.searchParams.set("financialGeneration", String(generation));
    target = `${url.pathname}${url.search}${url.hash}`;
  }
  return <a {...props} href={target}>{children}</a>;
}

export function useFinancialFormData() {
  const session = useFinancialWriteContext();
  const [generation] = useState(session?.context.generation);
  return useCallback((form?: HTMLFormElement) => {
    const data = new FormData(form);
    if (generation !== undefined) data.set(FINANCIAL_GENERATION_FIELD, String(generation));
    return data;
  }, [generation]);
}

// Used by both server-rendered and interactive forms; the hidden value is part
// of the original browser intent, including programmatic new FormData(form).
type FinancialFormProps = ComponentProps<"form"> & { draftGuard?: { pending: boolean; saved: boolean } };
export function FinancialForm({ draftGuard, ...props }: FinancialFormProps) {
  return draftGuard ? <GuardedFinancialForm {...props} draftGuard={draftGuard} /> : <FinancialFormBase {...props} />;
}
function GuardedFinancialForm({ action, draftGuard, children, onChangeCapture, onInput, onSubmit, ...props }: FinancialFormProps & {draftGuard: {pending: boolean; saved: boolean}}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitLockedRef = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const guard = useOverlayFormDraftGuard(formRef, draftGuard.pending, draftGuard.saved && submitted);
  useEffect(() => {
    if (!draftGuard.pending) {
      submitLockedRef.current = false;
      queueMicrotask(() => setSubmitted(false));
    }
  }, [draftGuard.pending, draftGuard.saved]);
  return <FinancialFormBase {...props} action={action} ref={formRef}
    onSubmit={event => {
      if (draftGuard.pending || submitLockedRef.current) { event.preventDefault(); return; }
      onSubmit?.(event);
      if (event.defaultPrevented) return;
      setSubmitted(true);
      if (typeof action === "function") {
        // Explicit dispatch retains native inputs when an action returns a
        // validation error. React's form action path resets them on resolution.
        event.preventDefault();
        submitLockedRef.current = true;
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const data = new FormData(event.currentTarget, submitter);
        startTransition(() => action(data));
      }
    }}
    onChangeCapture={event => { guard.onChangeCapture(); onChangeCapture?.(event); }}
    onInput={event => { guard.onInput(); onInput?.(event); }}>
    <fieldset className="contents" disabled={draftGuard.pending}>{children}</fieldset>
  </FinancialFormBase>;
}
export function FinancialFormCancel({onClick, ...props}: Omit<ComponentProps<typeof Button>, "onClick"> & {onClick: () => void}) {
  const requestClose = useOverlayCloseRequest(onClick);
  return <Button {...props} type="button" onClick={requestClose} />;
}
function FinancialFormBase({ children, onSubmit, ...props }: ComponentProps<"form">) {
  const session = useFinancialWriteContext();
  const [generation] = useState(session?.context.generation);
  const isRead = props.method?.toLowerCase() === "get";
  return <form {...props} onSubmit={(event) => {
    if (!isRead && session?.invalid) { event.preventDefault(); return; }
    onSubmit?.(event);
  }}>
    {!isRead && generation !== undefined ? <input name={FINANCIAL_GENERATION_FIELD} type="hidden" value={generation} /> : null}
    {children}
  </form>;
}
