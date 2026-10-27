/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fixtureActor, reviewFixture } from "./review.test-fixtures";
const { submit, context, stepUp, rpc, serviceRpc } = vi.hoisted(() => ({ submit: vi.fn(), context: vi.fn(), stepUp: vi.fn(), rpc: vi.fn(), serviceRpc: vi.fn() }));
vi.mock("./actions", () => ({ submitMaintenanceReviewAction: submit }));
vi.mock("./context", () => ({ requirePilotResetContext: context }));
vi.mock("@/lib/auth/privileged-step-up-guard", () => ({ requirePrivilegedStepUp: stepUp }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
import { MaintenanceForm } from "./maintenance-form";
const choose = (source: string | Promise<string>) => fireEvent.change(screen.getByLabelText("Reviewed authorization file"), {
  target: { files: [{ size: 4096, text: () => Promise.resolve(source) }] },
});
beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);
it("previews a file without issuing approval and resets consent when the stage changes", async () => {
  render(<MaintenanceForm />); choose(JSON.stringify(reviewFixture("freeze")));
  await screen.findByRole("heading", { name: "Authorize the financial write freeze" });
  const consent = screen.getByRole("checkbox") as HTMLInputElement;
  expect(consent.checked).toBe(false); fireEvent.click(consent); expect(consent.checked).toBe(true);
  expect(submit).not.toHaveBeenCalled();
  choose(JSON.stringify(reviewFixture("checkpoint")));
  await screen.findByRole("heading", { name: "Authorize the frozen-source checkpoint" });
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  expect(submit).not.toHaveBeenCalled();
});
it("ignores a late file read after the user selects a different stage", async () => {
  let resolveFirst!: (source: string) => void;
  const first = new Promise<string>(resolve => { resolveFirst = resolve; });
  render(<MaintenanceForm />); choose(first); choose(JSON.stringify(reviewFixture("seal")));
  await screen.findByRole("heading", { name: "Authorize sealing of the reviewed reset" });
  await act(async () => { resolveFirst(JSON.stringify(reviewFixture("execute"))); await first; });
  expect(screen.queryByRole("heading", { name: "Authorize the October empty-books reset" })).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});
it("rejects a secret-bearing document without submitting it", async () => {
  render(<MaintenanceForm />); choose(JSON.stringify({ ...reviewFixture(), token: "never-send-this" }));
  await screen.findByRole("alert"); expect(screen.queryByRole("checkbox")).toBeNull(); expect(submit).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain("never-send-this");
});
it("locks the form after an uncertain response instead of offering resubmission", async () => {
  submit.mockResolvedValue({ kind: "uncertain", message: "Check the original outcome before continuing." });
  render(<MaintenanceForm />); choose(JSON.stringify(reviewFixture()));
  fireEvent.click(await screen.findByRole("checkbox"));
  fireEvent.submit(screen.getByRole("button", { name: "Authorize the October empty-books reset" }).closest("form")!);
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  await screen.findByRole("alert");
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText("Reviewed authorization file") as HTMLInputElement).disabled).toBe(true);
});
it("submits rendered React form data containing Next metadata through the real server action", async () => {
  const { submitMaintenanceReviewAction } = await vi.importActual<typeof import("./actions")>("./actions");
  submit.mockImplementation(submitMaintenanceReviewAction);
  context.mockResolvedValue({ userId: fixtureActor, operationalTimezone: "Asia/Phnom_Penh" });
  stepUp.mockResolvedValue({ rpc: serviceRpc });
  rpc.mockResolvedValue({ data: "10000000-0000-4000-8000-000000000099", error: null });
  const review = reviewFixture("freeze");
  render(<MaintenanceForm />); choose(JSON.stringify(review));
  fireEvent.click(await screen.findByRole("checkbox"));
  const form = screen.getByRole("button", { name: "Authorize the financial write freeze" }).closest("form")!;
  for (const [name, value] of [["$ACTION_REF_0", ""], ["$ACTION_0:0", '{"id":"framework-reference","bound":[]}'],
    ["$ACTION_rpc", "execute_financial_reset"], ["$ACTION_organization_id", "foreign"]]) {
    const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; form.append(input);
  }
  fireEvent.submit(form);
  await screen.findByRole("status");
  expect(submit).toHaveBeenCalledOnce();
  const submitted = submit.mock.calls[0][1] as FormData;
  expect(submitted.get("$ACTION_REF_0")).toBe("");
  expect(submitted.get("review")).toBe(JSON.stringify(review));
  expect(context).toHaveBeenCalledOnce(); expect(stepUp).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledExactlyOnceWith("authorize_financial_reset_hosted_action", { p_binding: review.binding, p_action: "freeze" });
  expect(serviceRpc).not.toHaveBeenCalled();
});
