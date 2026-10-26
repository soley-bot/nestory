// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { FinancialWriteProvider } from "@/lib/finance/financial-write-provider";
import { loadManualChargeInvoiceContext } from "../manual-charge-invoice-context";
import { useManualChargeInvoiceContext } from "./use-manual-charge-invoice-context";
vi.mock("../manual-charge-invoice-context", () => ({ loadManualChargeInvoiceContext: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
const invoice = { id: "off-page", invoiceNumber: "OFF-PAGE", dueDate: "2026-09-25" };
it("blocks submission through pending and failed reads, and allows an explicit retry", async () => {
  vi.mocked(loadManualChargeInvoiceContext).mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(invoice);
  const { result } = renderHook(() => useManualChargeInvoiceContext(true, "lease-1", "2026-09"));
  expect(result.current.ready).toBe(false);
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.ready).toBe(false);
  act(() => result.current.retry());
  expect(result.current.ready).toBe(false);
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.invoice).toEqual(invoice);
});
it("ignores interrupted lease/month responses and never reuses the previous selection's due date", async () => {
  let resolveOld!: (value: typeof invoice) => void;
  let resolveNew!: (value: typeof invoice | null) => void;
  vi.mocked(loadManualChargeInvoiceContext).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve; }));
  const { result, rerender } = renderHook(({ leaseId, month }) => useManualChargeInvoiceContext(true, leaseId, month), { initialProps: { leaseId: "lease-1", month: "2026-09" } });
  rerender({ leaseId: "lease-2", month: "2026-10" });
  await act(async () => resolveOld(invoice));
  expect(result.current.ready).toBe(false);
  expect(result.current.invoice).toBeUndefined();
  await act(async () => resolveNew(null));
  expect(result.current.ready).toBe(true);
  expect(result.current.invoice).toBeNull();
});

it.each(["lease", "month"] as const)("rechecks a previously resolved selection after changing %s and stays blocked if the new check fails", async field => {
  let resolveOther!: (value: typeof invoice) => void;
  let rejectReturned!: (error: Error) => void;
  vi.mocked(loadManualChargeInvoiceContext)
    .mockResolvedValueOnce(invoice)
    .mockImplementationOnce(() => new Promise(resolve => { resolveOther = resolve; }))
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectReturned = reject; }))
    .mockResolvedValueOnce(null);
  const original = { leaseId: "lease-1", month: "2026-09" };
  const { result, rerender } = renderHook(({ leaseId, month }) => useManualChargeInvoiceContext(true, leaseId, month), { initialProps: original });
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.invoice).toEqual(invoice);
  rerender(field === "lease" ? { ...original, leaseId: "lease-2" } : { ...original, month: "2026-10" });
  expect(result.current.ready).toBe(false);
  rerender(original);
  expect(result.current.ready).toBe(false);
  expect(result.current.invoice).toBeUndefined();
  await act(async () => resolveOther(invoice));
  expect(result.current.ready).toBe(false);
  await act(async () => rejectReturned(new Error("timeout")));
  expect(result.current.error).toBeTruthy();
  expect(result.current.ready).toBe(false);
  expect(result.current.invoice).toBeUndefined();
  act(() => result.current.retry());
  expect(result.current.ready).toBe(false);
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.invoice).toBeNull();
});

it("requires a fresh lookup after disabling and re-enabling the same selection", async () => {
  let resolveFresh!: (value: typeof invoice | null) => void;
  vi.mocked(loadManualChargeInvoiceContext).mockResolvedValueOnce(invoice)
    .mockImplementationOnce(() => new Promise(resolve => { resolveFresh = resolve; }));
  const { result, rerender } = renderHook(({ enabled }) => useManualChargeInvoiceContext(enabled, "lease-1", "2026-09"), { initialProps: { enabled: true } });
  await waitFor(() => expect(result.current.ready).toBe(true));
  rerender({ enabled: false });
  rerender({ enabled: true });
  expect(result.current.ready).toBe(false);
  expect(result.current.invoice).toBeUndefined();
  await act(async () => resolveFresh(null));
  expect(result.current.ready).toBe(true);
  expect(result.current.invoice).toBeNull();
});

it("clears a verified invoice and preserves its original generation when the session changes",async()=>{
 const context={generation:1,status:"open" as const,financial_start_date:"2026-10-01",enforced:true};
 const check=vi.fn().mockResolvedValue({ok:true,json:async()=>({organizationId:"org",context})});vi.stubGlobal("fetch",check);
 vi.mocked(loadManualChargeInvoiceContext).mockResolvedValue(invoice);
 const wrapper=({children}:{children:ReactNode})=><FinancialWriteProvider organizationId="org" context={context}>{children}</FinancialWriteProvider>;
 const {result}=renderHook(()=>useManualChargeInvoiceContext(true,"lease-1","2026-10"),{wrapper});
 await waitFor(()=>expect(result.current.ready).toBe(true));
 const originalIntent=vi.mocked(loadManualChargeInvoiceContext).mock.calls[0][1];
 expect(originalIntent?.get("__financialGeneration")).toBe("1");
 check.mockResolvedValue({ok:true,json:async()=>({organizationId:"org",context:{...context,generation:2}})});
 fireEvent.focus(window);await waitFor(()=>expect(result.current.ready).toBe(false));
 expect(result.current.invoice).toBeUndefined();
 act(()=>result.current.retry());expect(loadManualChargeInvoiceContext).toHaveBeenCalledOnce();
 expect(originalIntent?.get("__financialGeneration")).toBe("1");
});

it("ignores a pending invoice response after the financial session becomes unverifiable",async()=>{
 const context={generation:1,status:"open" as const,financial_start_date:"2026-10-01",enforced:true};
 const check=vi.fn().mockResolvedValue({ok:true,json:async()=>({organizationId:"org",context})});vi.stubGlobal("fetch",check);
 let resolve!:(value:typeof invoice)=>void;vi.mocked(loadManualChargeInvoiceContext).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const wrapper=({children}:{children:ReactNode})=><FinancialWriteProvider organizationId="org" context={context}>{children}</FinancialWriteProvider>;
 const {result}=renderHook(()=>useManualChargeInvoiceContext(true,"lease-1","2026-10"),{wrapper});
 await waitFor(()=>expect(check).toHaveBeenCalledOnce());
 check.mockResolvedValue({ok:false});fireEvent.focus(window);
 await waitFor(()=>expect(document.querySelector('[role="alert"]')).not.toBeNull());
 await act(async()=>resolve(invoice));expect(result.current.ready).toBe(false);expect(result.current.invoice).toBeUndefined();
});
