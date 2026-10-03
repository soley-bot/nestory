/* @vitest-environment jsdom */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrganizationActionState } from "@/features/organization/actions";
import { useSettingsDraft } from "@/features/organization/components/use-settings-draft";

afterEach(cleanup);

describe("useSettingsDraft", () => {
  it("keeps the in-flight save locked when a repeated submit contains newer invalid values", async () => {
    const pending = deferred<{ message: string; status: "success" }>();
    const action = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useHarnessDraft(action));
    act(() => result.current.setField("name", "Submitted name"));
    let saving!: Promise<void>;
    act(() => { saving = result.current.submit(vi.fn()); });
    act(() => result.current.setField("name", ""));
    await act(async () => result.current.submit(vi.fn()));
    expect(result.current.status).toBe("saving");
    expect(action).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve({ message: "Saved", status: "success" }); await saving; });
    expect(result.current.values.name).toBe("");
    expect(result.current.status).toBe("dirty");
  });
  it("locks synchronously so two immediate valid submissions invoke the action once", async () => {
    const pending = deferred<{ message: string; status: "success" }>();
    const action = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useHarnessDraft(action));
    act(() => {
      result.current.setField("name", "Phuket");
    });

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.submit(vi.fn());
      second = result.current.submit(vi.fn());
    });

    expect(action).toHaveBeenCalledOnce();

    await act(async () => {
      pending.resolve({ message: "Saved.", status: "success" });
      await Promise.all([first, second]);
    });
    expect(result.current.status).toBe("saved");
    expect(result.current.values.name).toBe("Phuket");

    act(() => result.current.discard());
    expect(result.current.values.name).toBe("Phuket");
  });
});

function useHarnessDraft(
  action: (
    state: OrganizationActionState,
    formData: FormData,
  ) => Promise<{ message: string; status: "success" }>,
) {
  return useSettingsDraft({
    action,
    errorMessage: "Not saved",
    initialValues: { name: "" },
    retainValuesAfterSuccess: true,
    savedMessage: "Saved",
    savingMessage: "Saving",
    validate: (values) =>
      values.name.trim().length < 2 ? { name: "Name is required." } : {},
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

it("retains newer edits after a slow save and discards to the successful server baseline", async () => {
  const pending = deferred<{ message: string; status: "success" }>();
  const action = vi.fn(() => pending.promise);
  const { result } = renderHook(() => useHarnessDraft(action));
  act(() => result.current.setField("name", "Saved name"));
  let saving!: Promise<void>;
  act(() => { saving = result.current.submit(vi.fn()); });
  act(() => result.current.setField("name", "Newer unsaved name"));
  await act(async () => { pending.resolve({ message: "Saved", status: "success" }); await saving; });
  expect(result.current.values.name).toBe("Newer unsaved name");
  expect(result.current.status).toBe("dirty");
  expect(result.current.resultMessage).toBeUndefined();
  act(() => result.current.discard());
  expect(result.current.values.name).toBe("Saved name");
  expect(result.current.status).toBe("clean");
});

it("ignores a response after the draft was explicitly discarded", async () => {
  const pending = deferred<{ message: string; status: "success" }>();
  const { result } = renderHook(() => useHarnessDraft(() => pending.promise));
  act(() => result.current.setField("name", "Pending"));
  let saving!: Promise<void>;
  act(() => { saving = result.current.submit(vi.fn()); });
  act(() => result.current.discard());
  await act(async () => { pending.resolve({ message: "Saved", status: "success" }); await saving; });
  expect(result.current.values.name).toBe("");
  expect(result.current.status).toBe("clean");
  expect(result.current.resultMessage).toBeUndefined();
});

it("becomes clean when edits return to the submitted values before a successful save", async () => {
  const pending = deferred<{ message: string; status: "success" }>();
  const { result } = renderHook(() => useHarnessDraft(() => pending.promise));
  act(() => result.current.setField("name", "Saved name"));
  let saving!: Promise<void>;
  act(() => { saving = result.current.submit(vi.fn()); });
  act(() => result.current.setField("name", "Temporary name"));
  act(() => result.current.setField("name", "Saved name"));
  expect(result.current.status).toBe("saving");
  await act(async () => { pending.resolve({ message: "Saved", status: "success" }); await saving; });
  expect(result.current.values.name).toBe("Saved name");
  expect(result.current.status).toBe("clean");
  expect(result.current.resultMessage).toBeUndefined();
});

it("becomes dirty when edits return to the old baseline before a different value is saved", async () => {
  const pending = deferred<{ message: string; status: "success" }>();
  const { result } = renderHook(() => useHarnessDraft(() => pending.promise));
  act(() => result.current.setField("name", "Saved name"));
  let saving!: Promise<void>;
  act(() => { saving = result.current.submit(vi.fn()); });
  act(() => result.current.setField("name", ""));
  expect(result.current.status).toBe("saving");
  await act(async () => { pending.resolve({ message: "Saved", status: "success" }); await saving; });
  expect(result.current.values.name).toBe("");
  expect(result.current.status).toBe("dirty");
  act(() => result.current.discard());
  expect(result.current.values.name).toBe("Saved name");
  expect(result.current.status).toBe("clean");
});

it.each([false, true])("retains newer edits after an in-flight failure (throw: %s)", async (throws) => {
  let finish!: () => void;
  const action = vi.fn(() => new Promise<OrganizationActionState>((resolve, reject) => {
    finish = () => throws ? reject(new Error("Unavailable")) : resolve({ status: "error" });
  }));
  const { result } = renderHook(() => useSettingsDraft({ action, initialValues: { name: "Initial" }, retainValuesAfterSuccess: true, errorMessage: "Not saved", savedMessage: "Saved", savingMessage: "Saving", validate: () => ({}) }));
  act(() => result.current.setField("name", "Submitted"));
  let saving!: Promise<void>;
  act(() => { saving = result.current.submit(vi.fn()); });
  act(() => result.current.replaceValues({ name: "Newer draft" }));
  expect(result.current.status).toBe("saving");
  await act(async () => { finish(); await saving; });
  expect(result.current.status).toBe("dirty");
  expect(result.current.values.name).toBe("Newer draft");
  expect(result.current.statusMessage).toBeUndefined();
  act(() => result.current.discard());
  expect(result.current.values.name).toBe("Initial");
});
