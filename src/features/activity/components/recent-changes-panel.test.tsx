// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { RecentChange } from "../activity.types";
import { RecentChangesPanel } from "./recent-changes-panel";

afterEach(cleanup);

it("keeps full record labels and selection identities without displaying raw UUIDs", async () => {
  const user = userEvent.setup();
  const id = "00000000-0000-4000-8000-000000000001";
  const longName = "A property with a detailed and meaningful name ".repeat(5).trim();
  const change: RecentChange = { id, recordLabel: id, action: "updated", actionLabel: "Updated", entityLabel: "Property", createdAt: "2026-10-03", details: [], tone: "neutral" };
  const onSelectChange = vi.fn();
  const { container } = render(<RecentChangesPanel changes={[change, { ...change, id: "second", recordLabel: longName }]} onSelectChange={onSelectChange} />);
  expect(container.textContent).not.toContain(id);
  expect(screen.getByText(longName)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /Record unavailable/ }));
  expect(onSelectChange).toHaveBeenCalledWith(change);
});
