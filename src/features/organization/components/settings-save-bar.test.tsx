/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsSaveBar } from "@/features/organization/components/settings-save-bar";

afterEach(cleanup);

describe("SettingsSaveBar", () => {
  it("stays out of the way until the section has a meaningful state", () => {
    const { rerender } = render(
      <SettingsSaveBar
        onDiscard={vi.fn()}
        onSave={vi.fn()}
        status="clean"
      />,
    );

    expect(screen.queryByTestId("settings-save-bar")).toBeNull();

    rerender(
      <SettingsSaveBar
        onDiscard={vi.fn()}
        onSave={vi.fn()}
        status="dirty"
      />,
    );
    expect(screen.getByTestId("settings-save-bar")).not.toBeNull();
    expect(screen.getByText("Unsaved changes")).not.toBeNull();
  });

  it("keeps saving and success feedback visible", () => {
    const { rerender } = render(
      <SettingsSaveBar
        onDiscard={vi.fn()}
        onSave={vi.fn()}
        status="saving"
      />,
    );
    expect(screen.getByText("Saving changes")).not.toBeNull();

    rerender(
      <SettingsSaveBar
        onDiscard={vi.fn()}
        onSave={vi.fn()}
        status="saved"
      />,
    );
    expect(screen.getByText("Changes saved")).not.toBeNull();
  });
});
