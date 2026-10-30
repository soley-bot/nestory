"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { FINANCIAL_GENERATION_FIELD, financialContextKey, financialWriteContextSchema, type FinancialWriteContext } from "./financial-write-context";

type FinancialSession = { context: FinancialWriteContext; invalid: boolean };
const FinancialContext = createContext<FinancialSession | null>(null);

export function FinancialWriteProvider({ children, context, organizationId }: {
  children: ReactNode; context: FinancialWriteContext; organizationId: string;
}) {
  const [initial] = useState(context);
  const [initialOrganizationId] = useState(organizationId);
  const [verification, setVerification] = useState<"current" | "unavailable" | "stale">("current");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    let running = false;
    const check = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const response = await fetch("/api/workspace/financial-context", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error("Financial context unavailable");
        const body = await response.json();
        const latest = financialWriteContextSchema.parse(body.context);
        if (typeof body.organizationId !== "string" || !body.organizationId) throw new Error("Financial workspace unavailable");
        const matches = body.organizationId === initialOrganizationId && financialContextKey(latest) === financialContextKey(initial);
        // Only uncertainty can recover. A confirmed change permanently retires this form intent.
        if (!disposed) setVerification(previous => previous === "stale" || !matches ? "stale" : "current");
      } catch {
        // A failed status check cannot certify that an old form remains current.
        if (!disposed) setVerification(previous => previous === "stale" ? "stale" : "unavailable");
      } finally { running = false; }
    };
    const onVisible = () => { void check(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, 30_000);
    void check();
    return () => { disposed = true; clearInterval(timer); window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [initial, initialOrganizationId, retry]);
  const contextChanged = organizationId !== initialOrganizationId || financialContextKey(context) !== financialContextKey(initial);
  const temporary = verification === "unavailable" && !contextChanged && initial.status === "open";
  const blocked = verification !== "current" || initial.status === "frozen" || contextChanged;
  return <FinancialContext.Provider value={{ context: initial, invalid: blocked }}>
    {blocked ? <div role="alert" className="border-b border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      {initial.status === "frozen" ? "Financial changes and reports are paused while this workspace is being reset." : temporary ? "We could not verify the financial session. Your draft is kept here; saving and reports will resume once the connection is verified." : "The workspace’s financial session changed. Reload before entering transactions or using reports."}
      {temporary ? <button className="ml-3 underline" onClick={() => setRetry(value => value + 1)} type="button">Retry verification</button> : <button className="ml-3 underline" onClick={() => window.location.reload()} type="button">Reload page</button>}
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
export function FinancialForm({ children, onSubmit, ...props }: ComponentProps<"form">) {
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
