// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { UploadFileInput } from "./upload-file-input";

afterEach(cleanup);

it("clears an oversized file before a form or evidence callback can submit it", async () => {
  const files: Array<File | null> = [];
  const submit = vi.fn();
  render(<form onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <UploadFileInput aria-label="Receipt" name="receipt" onChange={(event) => files.push(event.currentTarget.files?.[0] ?? null)} />
    <button type="submit">Save</button>
  </form>);
  const user = userEvent.setup();
  const input = screen.getByLabelText("Receipt") as HTMLInputElement;
  await user.upload(input, new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" }));
  expect(files).toEqual([null]);
  expect(input.files).toHaveLength(0);
  expect(screen.getByRole("alert").textContent).toContain("4 MB");
  await user.click(screen.getByText("Save"));
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByText("Clear file selection"));
  await user.click(screen.getByText("Save"));
  expect(submit).toHaveBeenCalledOnce();
  expect(input.files).toHaveLength(0);
  submit.mockClear();
  await user.upload(input, new File(["pdf"], "small.pdf", { type: "application/pdf" }));
  await user.click(screen.getByText("Save"));
  expect(submit).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).toBeNull();
});
