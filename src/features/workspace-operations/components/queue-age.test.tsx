/* @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BusinessDateProvider } from "@/lib/dates/business-date-provider";
import { QueueAge } from "./queue-age";
afterEach(cleanup);
it.each([
  ["2026-11-06T16:59:00Z", "Yesterday"],
  ["2026-11-06T17:00:00Z", "Today"],
  ["2026-11-05T16:59:00Z", "2 days ago"],
])("uses workspace calendar days for %s", (value, label) => {
  render(<BusinessDateProvider businessDate="2026-11-07" serverTime="2026-11-07T05:00:00Z" timeZone="Asia/Phnom_Penh"><QueueAge value={value} /></BusinessDateProvider>);
  expect(screen.getByText(label).getAttribute("datetime")).toBe(value);
});
