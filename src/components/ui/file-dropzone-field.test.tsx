// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DOCUMENT_FILE_ACCEPT, FileDropzoneField } from "./file-dropzone-field";

afterEach(cleanup);

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
