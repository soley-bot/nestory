/* @vitest-environment jsdom */
// Regression coverage with synthetic financial records.
// No database clients/actions are invoked; all records below are synthetic.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { ReportBuilderScreen } from '@/features/reports/components/reports-screen';
import { prepareTrustedReportForScreen } from '@/features/reports/data/reports';
import type { ReportsViewQuery, TrustedReport } from '@/features/reports/reports.types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => '/reports/unit-profit-loss' }));
beforeAll(() => vi.stubGlobal('ResizeObserver', class { disconnect() {} observe() {} unobserve() {} }));
afterEach(cleanup);

const query: ReportsViewQuery = {
  month: '2026-10', ownerPersonId: 'all', peopleArchiveState: 'active', peopleView: 'relationship',
  propertyId: 'all', report: 'unit-profit-loss', status: 'all', unitId: 'synthetic-unit',
};
const report: TrustedReport = {
  kind: 'unit-profit-loss', title: 'Monthly billing needs review', description: 'Billing is incomplete.',
  columns: [{ key: 'property', label: 'Property' }, { key: 'tenant', label: 'Tenant' }, { key: 'issue', label: 'Required action' }],
  rows: [{ id: 'missing-rent:synthetic-lease', title: 'Synthetic tenant', propertyId: 'synthetic-property',
    href: '/leases/synthetic-lease?section=rent', nextActionHref: '/leases/synthetic-lease?section=rent',
    sourceCount: 1, sourceLinks: [{ id: 'synthetic-lease', label: 'Review lease rent and billing', href: '/leases/synthetic-lease?section=rent', recordType: 'lease' }],
    sourceSummary: 'Lease has no issued rent invoice.', cells: { property: 'Synthetic property', tenant: 'Synthetic tenant', issue: 'Monthly rent invoice is missing.' } }],
  summary: [], generatedAt: '2026-11-07T00:00:00Z', periodLabel: '2026-10', scopeLabel: 'Selected scope',
  exportFilenameBase: 'unit-profit-loss', totalsTraceLabel: 'Totals unavailable until billing complete.',
  emptyTitle: 'Monthly billing needs review', emptyDescription: 'Billing is incomplete.',
  exportValidation: { code: 'monthly_rent_incomplete', message: 'Monthly rent billing is incomplete. Review the linked leases and generate the missing invoices before using this report.', status: 409 },
};

it('FIN-01 keeps incomplete P&L unavailable and exposes remediation links', () => {
  render(<ReportBuilderScreen organizationName="Synthetic audit" ownerOptions={[]} propertyOptions={[]} unitOptions={[]} trustedReport={report} viewQuery={query} />);
  expect(screen.getByText('Report unavailable')).toBeTruthy();
  expect(screen.queryByRole('row', { name: 'Income USD 0.00' })).toBeNull();
  expect(screen.queryByRole('row', { name: 'Operating expenses USD 0.00' })).toBeNull();
  expect(screen.queryByRole('row', { name: 'Net operating income USD 0.00' })).toBeNull();
  expect(screen.queryByText('No income in this period.')).toBeNull();
  expect(screen.getByRole('link', { name: 'Review billing for Synthetic tenant' }).getAttribute('href')).toContain('/leases/synthetic-lease?section=rent');
  expect(screen.getAllByText('Synthetic tenant').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
});

it('FIN-02 keeps every owner activity row and count through repeated preparation', () => {
  const complete = { ...report, kind: 'monthly-owner-activity' as const, rows: Array.from({ length: 100 }, (_, i) => ({ ...report.rows[0], id: `synthetic-${i}` })) };
  const first = prepareTrustedReportForScreen(complete);
  expect(first.rows).toHaveLength(100);
  expect(first.totalRowCount).toBe(100);
  const second = prepareTrustedReportForScreen(first, { financeSafeRecords: true });
  expect(second.rows).toHaveLength(100);
  expect(second.totalRowCount).toBe(100);
});
