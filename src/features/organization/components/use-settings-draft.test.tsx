/* @vitest-environment jsdom */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrganizationActionState } from "@/features/organization/actions";
import { useSettingsDraft } from "@/features/organization/components/use-settings-draft";

afterEach(cleanup);

describe("useSettingsDraft", () => {
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
