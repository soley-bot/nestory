// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EvidenceFileField, OwnerTransactionPicker } from "./owner-operation-inputs";
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
it("selects an internal transaction ID and shows a review of its human details", () => {
  const {container} = render(<form><OwnerTransactionPicker name="withdrawalId" label="Owner distribution" options={[{id: "record-id", label: "Synthetic owner / Property A / 2026-10-04 / USD 200.00"}]} /></form>);
  fireEvent.change(screen.getByLabelText("Owner distribution"), {target: {value: "record-id"}});
  expect(new FormData(container.querySelector("form")!).get("withdrawalId")).toBe("record-id");
  expect(screen.getByRole("status").textContent).toContain("USD 200.00");
});
it("clears a selected transaction when refreshed choices no longer allow it", () => {
  const view = (options: {id: string; label: string}[]) => <form><OwnerTransactionPicker name="withdrawalId" label="Owner distribution" options={options} /></form>;
  const {container, rerender} = render(view([{id: "record-id", label: "Synthetic distribution"}]));
  fireEvent.change(screen.getByLabelText("Owner distribution"), {target: {value: "record-id"}});
  rerender(view([]));
  expect(new FormData(container.querySelector("form")!).get("withdrawalId")).toBe("");
  expect(screen.queryByRole("status")).toBeNull();
  expect((screen.getByLabelText("Owner distribution") as HTMLSelectElement).validity.valueMissing).toBe(true);
});

it("keeps the latest selected file's fingerprint when an earlier digest finishes last", async () => {
  const finish: ((value: ArrayBuffer) => void)[] = [];
  vi.stubGlobal("crypto", {subtle: {digest: vi.fn(() => new Promise<ArrayBuffer>(resolve => {finish.push(resolve);} ))}});
  const {container} = render(<form><EvidenceFileField /></form>);
  const input = screen.getByLabelText("Evidence file") as HTMLInputElement;
  for (const name of ["earlier.txt", "current.txt"]) {
    const file = new File([name], name);
    Object.defineProperty(file, "arrayBuffer", {value: async () => new ArrayBuffer(1)});
    fireEvent.change(input, {target: {files: [file]}});
    await waitFor(() => expect(finish).toHaveLength(name === "earlier.txt" ? 1 : 2));
  }
  await act(async () => {finish[1](new Uint8Array(32).fill(2).buffer);});
  await act(async () => {finish[0](new Uint8Array(32).fill(1).buffer);});
  expect(new FormData(container.querySelector("form")!).get("evidenceSha256")).toBe("02".repeat(32));
  expect(screen.getByRole("status").textContent).toContain("current.txt");
  fireEvent.change(input, {target: {files: []}});
  expect(new FormData(container.querySelector("form")!).get("evidenceSha256")).toBe("");
});

it("clears a previous fingerprint and blocks submission when its replacement cannot be read", async () => {
  vi.stubGlobal("crypto", {subtle: {digest: vi.fn(async () => new Uint8Array(32).fill(3).buffer)}});
  const {container} = render(<form><EvidenceFileField /></form>);
  const input = screen.getByLabelText("Evidence file") as HTMLInputElement;
  const readable = new File(["valid"], "readable.txt");
  Object.defineProperty(readable, "arrayBuffer", {value: async () => new ArrayBuffer(1)});
  fireEvent.change(input, {target: {files: [readable]}});
  await waitFor(() => expect(new FormData(container.querySelector("form")!).get("evidenceSha256")).toBe("03".repeat(32)));
  const unreadable = new File(["unavailable"], "unreadable.txt");
  Object.defineProperty(unreadable, "arrayBuffer", {value: async () => {throw new Error("Unreadable");}});
  fireEvent.change(input, {target: {files: [unreadable]}});
  await waitFor(() => expect(input.validationMessage).toContain("readable evidence file"));
  expect(new FormData(container.querySelector("form")!).get("evidenceSha256")).toBe("");
  expect(screen.getByRole("status").textContent).toContain("Could not read");
});
it("calculates evidence fingerprint and blocks submission while hashing", async () => {
  let finish: ((value: ArrayBuffer) => void) | undefined;
  vi.stubGlobal("crypto", {subtle: {digest: vi.fn(() => new Promise<ArrayBuffer>(resolve => { finish = resolve; }))}});
  const {container} = render(<form><EvidenceFileField /></form>);
  const file = new File(["synthetic evidence"], "evidence.txt");
  Object.defineProperty(file, "arrayBuffer", {value: async () => new ArrayBuffer(1)});
  const input = screen.getByLabelText("Evidence file") as HTMLInputElement;
  fireEvent.change(input, {target: {files: [file]}});
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(input.validationMessage).toContain("Wait");
  finish!(new Uint8Array(32).fill(15).buffer);
  await waitFor(() => expect(new FormData(container.querySelector("form")!).get("evidenceSha256")).toBe("0f".repeat(32)));
  expect(input.validity.customError).toBe(false);
});
