// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DOCUMENT_FILE_ACCEPT, FileDropzoneField } from "./file-dropzone-field";

afterEach(cleanup);

it("clears a previous attachment and blocks submission when a replacement drop cannot be attached", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("DataTransfer", undefined);
  try {
    const onFile = vi.fn();
    render(<form><FileDropzoneField aria-label="Evidence" accept={DOCUMENT_FILE_ACCEPT} name="document" onFile={onFile} /></form>);
    const input = screen.getByLabelText("Evidence") as HTMLInputElement;
    await user.upload(input, new File(["previous"], "previous.pdf", {type: "application/pdf"}));
    const file = new File(["replacement"], "replacement.pdf", {type: "application/pdf"});
    fireEvent.drop(screen.getByRole("button", {name: "previous.pdf"}), {dataTransfer: {files: [file], items: [{kind: "file", type: file.type, getAsFile: () => file}], types: ["Files"]}});
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Please browse"));
    expect(input.files?.length).toBe(0);
    expect(input.validity.valid).toBe(false);
    expect(onFile).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});

it("preserves an existing attachment when the native picker is opened and cancelled", async () => {
  const user = userEvent.setup();
  render(<form><FileDropzoneField aria-label="Evidence" accept={DOCUMENT_FILE_ACCEPT} name="document" /></form>);
  const input = screen.getByLabelText("Evidence") as HTMLInputElement;
  const file = new File(["previous"], "previous.pdf", {type: "application/pdf"});
  await user.upload(input, file);
  await user.click(screen.getByRole("button", {name: "previous.pdf"}));
  fireEvent(input, new Event("cancel", {bubbles: true}));
  expect(input.files?.[0]).toBe(file);
  expect(screen.getByRole("button", {name: "previous.pdf"})).not.toBeNull();
});

it("ignores drops inside a disabled fieldset", async () => {
  const onFile = vi.fn();
  render(<fieldset disabled><FileDropzoneField aria-label="Evidence" accept={DOCUMENT_FILE_ACCEPT} onFile={onFile} /></fieldset>);
  const file = new File(["pdf"], "test.pdf", {type: "application/pdf"});
  fireEvent.drop(screen.getByRole("button", {name: "Drop file here or browse"}), {dataTransfer: {files: [file], items: [{kind: "file", type: file.type, getAsFile: () => file}], types: ["Files"]}});
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(onFile).not.toHaveBeenCalled();
});

it("blocks oversized uploads before submission and recovers after a valid selection", async () => {
  const onFile = vi.fn();
  const onReject = vi.fn();
  const onClear = vi.fn();
  render(<form><FileDropzoneField aria-label="Evidence" accept={DOCUMENT_FILE_ACCEPT} name="document" onFile={onFile} onReject={onReject} onClear={onClear} /></form>);
  const input = screen.getByLabelText("Evidence") as HTMLInputElement;
  const oversized = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [oversized] } });
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("4 MB"));
  expect(onFile).not.toHaveBeenCalled();
  expect(onReject).toHaveBeenCalledTimes(1);
  expect(input.validity.valid).toBe(false);
  fireEvent.click(screen.getByText("Clear file selection"));
  expect(onClear).toHaveBeenCalledTimes(1);
  expect(input.validity.valid).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.change(input, { target: { files: [new File(["pdf"], "small.pdf", { type: "application/pdf" })] } });
  await waitFor(() => expect(onFile).toHaveBeenCalledTimes(1));
  expect(input.validity.valid).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("reports when the browser cannot attach a dropped file to the form", async () => {
  const onFile = vi.fn();
  vi.stubGlobal("DataTransfer", undefined);
  try {
    const { container } = render(<form><FileDropzoneField aria-label="Evidence" accept={DOCUMENT_FILE_ACCEPT}
      name="document" onFile={onFile} required /></form>);
    const file = new File(["pdf"], "dropped.pdf", { type: "application/pdf" });
    fireEvent.drop(screen.getByRole("button", { name: "Drop file here or browse" }), {
      dataTransfer: { files: [file], items: [{ kind: "file", type: file.type, getAsFile: () => file }], types: ["Files"] },
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Please browse"));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.files?.length).toBe(0);
    expect(onFile).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
