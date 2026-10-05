/* @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BusinessDateProvider, useBusinessDate } from './business-date-provider';
function Probe() { const { getToday } = useBusinessDate(); return <output>{getToday()}</output>; }
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('adopts a fresh authoritative server time on router refresh without changing organization', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2035-04-01T00:00:00Z'));
  const view = render(<BusinessDateProvider businessDate="2026-12-31" serverTime="2026-12-31T16:59:30Z" timeZone="Asia/Phnom_Penh"><Probe /></BusinessDateProvider>);
  expect(screen.getByRole('status').textContent).toBe('2026-12-31');
  act(() => vi.advanceTimersByTime(1000));
  view.rerender(<BusinessDateProvider businessDate="2027-01-01" serverTime="2026-12-31T17:01:00Z" timeZone="Asia/Phnom_Penh"><Probe /></BusinessDateProvider>);
  expect(screen.getByRole('status').textContent).toBe('2027-01-01');
});
