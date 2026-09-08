/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OwnerAccountsLoading from "./loading";

describe("OwnerAccountsLoading", () => {
  it("announces the owner-account register while it streams", () => {
    const { container } = render(<OwnerAccountsLoading />);

    expect(screen.getByRole("status").textContent).toBe("Owner accounts is loading");
    expect(container.querySelector('[data-loading-kind="list"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="loading-work-surface"]')).toBeTruthy();
  });
});
