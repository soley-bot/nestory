/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessDateProvider, useBusinessDate } from "./business-date-provider";

function Probe({ label }: { label: string }) {
  const { getBusinessDateValue, getBusinessMonthValue } = useBusinessDate();
  return <output aria-label={label}>{getBusinessDateValue()} / {getBusinessMonthValue()}</output>;
}

describe("authorized business date context", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("keeps simultaneous companies isolated at Cambodia midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T17:00:00Z"));
    render(<>
      <BusinessDateProvider businessDate="2027-01-01" timeZone="Asia/Phnom_Penh"><Probe label="Cambodia" /></BusinessDateProvider>
      <BusinessDateProvider businessDate="2026-12-31" timeZone="UTC"><Probe label="UTC" /></BusinessDateProvider>
    </>);
    expect(screen.getByLabelText("Cambodia").textContent).toBe("2027-01-01 / 2027-01");
    expect(screen.getByLabelText("UTC").textContent).toBe("2026-12-31 / 2026-12");
  });

  it("refreshes an open workspace across the business year boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T16:59:30Z"));
    render(<BusinessDateProvider businessDate="2026-12-31" serverTime="2026-12-31T16:59:30Z" timeZone="Asia/Phnom_Penh"><Probe label="Current date" /></BusinessDateProvider>);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByLabelText("Current date").textContent).toBe("2027-01-01 / 2027-01");
  });

  it("keeps the authorized date when the laptop clock is wrong", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2035-04-01T00:00:00Z"));
    render(<BusinessDateProvider businessDate="2027-01-01" serverTime="2026-12-31T17:00:00Z" timeZone="Asia/Phnom_Penh"><Probe label="Authorized date" /></BusinessDateProvider>);
    expect(screen.getByLabelText("Authorized date").textContent).toBe("2027-01-01 / 2027-01");
  });

  it("uses the new business day for a form opened before the refresh timer fires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T16:59:30Z"));
    const content = <BusinessDateProvider businessDate="2026-12-31" serverTime="2026-12-31T16:59:30Z" timeZone="Asia/Phnom_Penh"><Probe label="New form date" /></BusinessDateProvider>;
    const view = render(content);
    act(() => vi.advanceTimersByTime(31_000));
    view.rerender(<BusinessDateProvider businessDate="2026-12-31" serverTime="2026-12-31T16:59:30Z" timeZone="Asia/Phnom_Penh"><Probe label="New form date" /></BusinessDateProvider>);
    expect(screen.getByLabelText("New form date").textContent).toBe("2027-01-01 / 2027-01");
  });
});
