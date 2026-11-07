// @vitest-environment jsdom
import { useActionState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { FinancialForm, FinancialWriteProvider } from "./financial-write-provider";
import { FINANCIAL_GENERATION_FIELD } from "./financial-write-context";
import { OverlayDismissalContext, type OverlayDraftGuard } from "@/components/ui/overlay-dismissal-context";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("protects an edit made before the first animation frame", async () => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  let status = "";
  const context = { portalContainer: null, requestClose: vi.fn(), registerDraftGuard: (guard: OverlayDraftGuard) => { status = guard.status; return () => {}; } };
  render(<OverlayDismissalContext.Provider value={context}><FinancialForm draftGuard={{pending: false, saved: false}}><input aria-label="Note" name="note" /></FinancialForm></OverlayDismissalContext.Provider>);
  fireEvent.change(screen.getByLabelText("Note"), {target: {value: "Immediate draft"}});
  await waitFor(() => expect(status).toBe("dirty"));
});

it("returns an attachment form to clean when the text edit is undone", async () => {
  let status = "";
  const context = { portalContainer: null, requestClose: vi.fn(), registerDraftGuard: (guard: OverlayDraftGuard) => { status = guard.status; return () => {}; } };
  render(<OverlayDismissalContext.Provider value={context}><FinancialForm draftGuard={{pending: false, saved: false}}><input aria-label="Note" name="note" defaultValue="Original" /><input name="attachment" type="file" /></FinancialForm></OverlayDismissalContext.Provider>);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  fireEvent.change(screen.getByLabelText("Note"), {target: {value: "Changed"}});
  await waitFor(() => expect(status).toBe("dirty"));
  fireEvent.change(screen.getByLabelText("Note"), {target: {value: "Original"}});
  await waitFor(() => expect(status).toBe("clean"));
});

it("preserves an unsuccessful action's draft and keeps it dirty", async () => {
  const user = userEvent.setup();
  let status = "";
  const submit = vi.fn().mockResolvedValueOnce({status: "error"}).mockResolvedValue({status: "success"});
  const context = { portalContainer: null, requestClose: vi.fn(), registerDraftGuard: (guard: OverlayDraftGuard) => { status = guard.status; return () => {}; } };
  function Form() {
    const [state, action, pending] = useActionState(submit, {status: "idle"});
    return <FinancialForm aria-label="Draft" action={action} draftGuard={{pending, saved: state.status === "success"}}><input aria-label="Note" name="note" /><button>Save</button><p>{state.status}</p></FinancialForm>;
  }
  render(<OverlayDismissalContext.Provider value={context}><Form /></OverlayDismissalContext.Provider>);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  fireEvent.change(screen.getByLabelText("Note"), {target: {value: "Keep this draft"}});
  await waitFor(() => expect(status).toBe("dirty"));
  fireEvent.submit(screen.getByRole("form", {name: "Draft"}));
  await screen.findByText("error");
  expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("Keep this draft");
  expect(status).toBe("dirty");
  await user.click(screen.getByRole("button", {name: "Save"}));
  await screen.findByText("success");
  await waitFor(() => expect(status).toBe("clean"));
  expect(submit).toHaveBeenCalledTimes(2);
  expect((submit.mock.calls[1][1] as FormData).get("note")).toBe("Keep this draft");
  expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("Keep this draft");
});

it("keeps native validation, submitter intent and the original financial generation", async () => {
  const user = userEvent.setup();
  const context = {generation: 2, status: "open" as const, financial_start_date: "2026-10-01", enforced: true};
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: true, json: async () => ({organizationId: "org", context})}));
  const submit = vi.fn().mockResolvedValue({status: "success"});
  function Form() {
    const [state, action, pending] = useActionState(submit, {status: "idle"});
    return <FinancialForm action={action} draftGuard={{pending, saved: state.status === "success"}}><input aria-label="Reason" name="reason" required /><button name="reviewAction" value="approve">Approve</button></FinancialForm>;
  }
  const { rerender } = render(<FinancialWriteProvider context={context} organizationId="org"><Form /></FinancialWriteProvider>);
  await user.click(screen.getByRole("button", {name: "Approve"}));
  expect(submit).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Reason"), "Checked receipt");
  await user.click(screen.getByRole("button", {name: "Approve"}));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  const data = submit.mock.calls[0][1] as FormData;
  expect(data.get("reviewAction")).toBe("approve");
  expect(data.get("reason")).toBe("Checked receipt");
  expect(data.get(FINANCIAL_GENERATION_FIELD)).toBe("2");
  rerender(<FinancialWriteProvider context={{...context, generation: 3}} organizationId="org"><Form /></FinancialWriteProvider>);
  await user.click(screen.getByRole("button", {name: "Approve"}));
  expect(submit).toHaveBeenCalledTimes(1);
});

it("does not dispatch after consumer cancellation or a second synchronous submit", async () => {
  const submit = vi.fn(async () => ({status: "success"}));
  function Form({cancel}: {cancel: boolean}) {
    const [state, action, pending] = useActionState(submit, {status: "idle"});
    return <FinancialForm aria-label="Draft" action={action} draftGuard={{pending, saved: state.status === "success"}} onSubmit={event => { if (cancel) event.preventDefault(); }}><button>Save</button></FinancialForm>;
  }
  const {rerender} = render(<Form cancel />);
  fireEvent.submit(screen.getByRole("form", {name: "Draft"}));
  expect(submit).not.toHaveBeenCalled();
  rerender(<Form cancel={false} />);
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", {name: "Draft"}));
    fireEvent.submit(screen.getByRole("form", {name: "Draft"}));
  });
  expect(submit).toHaveBeenCalledTimes(1);
});

it("keeps a sibling draft dirty and rebases the submitted form after repeated saves", async () => {
  let finish: (() => void) | undefined;
  const states = new Map<string, string>();
  const contexts = ["first", "second"].map(name => ({portalContainer: null, requestClose: vi.fn(), registerDraftGuard: (guard: OverlayDraftGuard) => { states.set(name, guard.status); return () => { states.delete(name); }; }}));
  function Forms() {
    const [state, action, pending] = useActionState(async () => { await new Promise<void>(resolve => { finish = resolve; }); return {status: "success"}; }, {status: "idle"});
    return <>{["first", "second"].map((name, index) => <OverlayDismissalContext.Provider key={name} value={contexts[index]}>
      <FinancialForm aria-label={name} action={action} draftGuard={{pending, saved: state.status === "success"}} onReset={event => event.preventDefault()}><input aria-label={`${name} amount`} name="amount" /><button>Save {name}</button></FinancialForm>
    </OverlayDismissalContext.Provider>)}</>;
  }
  render(<Forms />);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  fireEvent.change(screen.getByLabelText("first amount"), {target: {value: "25"}});
  fireEvent.change(screen.getByLabelText("second amount"), {target: {value: "70"}});
  await waitFor(() => expect(states.get("second")).toBe("dirty"));
  fireEvent.submit(screen.getByRole("form", {name: "first"}));
  await waitFor(() => expect(states.get("second")).toBe("saving"));
  await act(async () => finish?.());
  await waitFor(() => expect(states.get("first")).toBe("clean"));
  expect(states.get("second")).toBe("dirty");
  fireEvent.change(screen.getByLabelText("first amount"), {target: {value: "30"}});
  await waitFor(() => expect(states.get("first")).toBe("dirty"));
  fireEvent.submit(screen.getByRole("form", {name: "first"}));
  await waitFor(() => expect(states.get("first")).toBe("saving"));
  await act(async () => finish?.());
  await waitFor(() => expect(states.get("first")).toBe("clean"));
  expect(states.get("second")).toBe("dirty");
});
