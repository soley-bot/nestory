// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FinancialForm, FinancialReportBoundary, FinancialWriteProvider, useFinancialFormData } from "./financial-write-provider";
import { FINANCIAL_GENERATION_FIELD } from "./financial-write-context";
const open = { generation: 2, status: "open" as const, financial_start_date: "2026-10-01", enforced: true };
const fetchContext = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchContext); fetchContext.mockResolvedValue({ ok: true, json: async () => ({ organizationId: "org", context: open }) }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("original financial form intent", () => {
  it.each(["network", "malformed"])("recovers from a %s check failure without losing the draft", async (failure) => {
    if (failure === "network") fetchContext.mockRejectedValueOnce(new Error("offline"));
    else fetchContext.mockResolvedValueOnce({ ok: true, json: async () => ({ context: {} }) });
    const submit = vi.fn(event => event.preventDefault());
    render(<FinancialWriteProvider context={open} organizationId="org"><FinancialForm aria-label="entry" onSubmit={submit}><input aria-label="Memo" defaultValue="Unsaved rent" /><button>Save</button></FinancialForm></FinancialWriteProvider>);
    await screen.findByRole("alert");
    const form = screen.getByRole("form", { name: "entry" }) as HTMLFormElement;
    fireEvent.submit(form);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.focus(window);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect((screen.getByLabelText("Memo") as HTMLInputElement).value).toBe("Unsaved rent");
    expect(new FormData(form).get(FINANCIAL_GENERATION_FIELD)).toBe("2");
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledOnce();
  });
  it.each([
    { organizationId: "other", context: open },
    { organizationId: "org", context: { ...open, generation: 3 } },
    { organizationId: "org", context: { ...open, status: "frozen" } },
  ])("never revives a session after a confirmed mismatch: %j", async (mismatch) => {
    fetchContext.mockResolvedValueOnce({ ok: true, json: async () => mismatch });
    const submit = vi.fn(event => event.preventDefault());
    render(<FinancialWriteProvider context={open} organizationId="org"><FinancialForm aria-label="entry" onSubmit={submit}><button>Save</button></FinancialForm></FinancialWriteProvider>);
    await screen.findByRole("alert");
    fireEvent.focus(window);
    await waitFor(() => expect(fetchContext).toHaveBeenCalledTimes(2));
    fireEvent.submit(screen.getByRole("form", { name: "entry" }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Reload");
  });
  it("hides a newer page payload under a retained layout before its status check completes", () => {
    fetchContext.mockImplementation(() => new Promise(() => {}));
    const view = (generation: number) => <FinancialWriteProvider context={open} organizationId="org">
      <FinancialReportBoundary expectedGeneration={generation}><p>USD 975.00</p></FinancialReportBoundary>
    </FinancialWriteProvider>;
    const { rerender } = render(view(2));
    expect(screen.getByText("USD 975.00")).toBeTruthy();
    rerender(view(3));
    expect(screen.queryByText("USD 975.00")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Reload the page");
  });
  it("retains the original generation and blocks submit after refreshed server props", async () => {
    const submit = vi.fn(event => event.preventDefault());
    const view = render(<FinancialWriteProvider context={open} organizationId="org"><FinancialForm aria-label="entry" onSubmit={submit}><button>Save</button></FinancialForm></FinancialWriteProvider>);
    await waitFor(() => expect(fetchContext).toHaveBeenCalled());
    const form = screen.getByRole("form", { name: "entry" }) as HTMLFormElement;
    expect(new FormData(form).get(FINANCIAL_GENERATION_FIELD)).toBe("2");
    view.rerender(<FinancialWriteProvider context={{ ...open, generation: 3 }} organizationId="org"><FinancialForm aria-label="entry" onSubmit={submit}><button>Save</button></FinancialForm></FinancialWriteProvider>);
    expect(new FormData(form).get(FINANCIAL_GENERATION_FIELD)).toBe("2");
    fireEvent.submit(form); expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Reload");
  });
  it("invalidates an old tab when focus finds a different generation", async () => {
    render(<FinancialWriteProvider context={open} organizationId="org"><span>Workspace</span></FinancialWriteProvider>);
    await waitFor(() => expect(fetchContext).toHaveBeenCalledTimes(1));
    fetchContext.mockResolvedValue({ ok: true, json: async () => ({ organizationId: "org", context: { ...open, generation: 3 } }) });
    fireEvent.focus(window);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Reload"));
  });
  it("pins button-created payloads even when context props change", async () => {
    let data: FormData | undefined;
    function Entry() { const createData = useFinancialFormData(); return <button onClick={() => { data = createData(); }}>Build</button>; }
    const view = render(<FinancialWriteProvider context={open} organizationId="org"><Entry /></FinancialWriteProvider>);
    await waitFor(() => expect(fetchContext).toHaveBeenCalled());
    view.rerender(<FinancialWriteProvider context={{ ...open, generation: 3 }} organizationId="org"><Entry /></FinancialWriteProvider>);
    fireEvent.click(screen.getByText("Build"));
    expect(data?.get(FINANCIAL_GENERATION_FIELD)).toBe("2");
  });
});
