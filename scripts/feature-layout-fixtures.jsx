// Controlled component fixtures only. No auth, database or application routes.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthPageShell } from '../src/features/auth/components/auth-page-shell';
import { LoginForm } from '../src/features/auth/components/login-form';
import { RecordsPropertyPreviewList } from '../src/features/overview/components/records-property-preview-list';
import { PropertyInspector } from '../src/features/properties/components/property-inspector';
import { UnitLeaseDetailsPanel, UnitMaintenanceCasePanel } from '../src/features/units/components/unit-related-record-panels';
import { UnitInspector } from '../src/features/units/components/unit-inspector';
import { PropertiesTable } from '../src/features/properties/components/properties-table';
import { UnitsTable } from '../src/features/units/components/units-table';
import { PeopleTable } from '../src/features/people/components/people-table';
import { LeasesTable } from '../src/features/leases/components/leases-table';
import { TimelineTable } from '../src/features/timeline/components/timeline-table';
import { PersonSelect } from '../src/features/people/components/person-select';
import { PropertyFilters } from '../src/features/properties/components/property-filters';
import { parsePropertySearchParams } from '../src/features/properties/property.filters';
import { ReportsFilters } from '../src/features/reports/components/reports-filters';
import { PeopleInspector } from '../src/features/people/components/people-inspector';
import { PeopleScreenSkeleton } from '../src/features/people/components/people-screen-skeleton';
import { LeaseInspector } from '../src/features/leases/components/lease-inspector';
import { BoardSurface } from '../src/features/maintenance/components/maintenance-board-surface';
import { TimelineInspector } from '../src/features/timeline/components/timeline-inspector';
import { ProfitLossDetail } from '../src/features/reports/components/profit-loss-detail';
import { ReportColumns } from '../src/features/reports/components/report-columns';
import { ReportResultsTable } from '../src/features/reports/components/report-results-table';
import { SettingsSectionHeader } from '../src/features/organization/components/settings-section-header';
import { Card, CardHeader } from '../src/components/ui/card';
import { DocumentList } from '../src/features/documents/components/document-list';
import { FinanceAccountActivityScreen } from '../src/features/finance-accounts/components/finance-account-activity-screen';

const name = 'Alexandria Catherine de la Cruz — Internationale Wohnungsverwaltung und Gemeinschaftsdienstleistungen';
const propertyName = 'Riverside Gardens North — Residential and Commercial Community Management Partnership';
const token = 'Reference_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const warning = `Unable to verify the supporting document for ${name}. Review the original record before continuing. ${token}`;
const money = { primary: 'USD 9,876,543,210.99' };
const noop = () => {};
const document = { id: 'document-1', fileName: `LeaseAgreement_RiversideGardensNorth_InternationalResidentialManagement_${token}.pdf`, category: 'Signed lease and supporting documentation', mimeType: 'application/pdf', sizeBytes: 4567890, uploadedAt: '2026-10-04', url: '#document' };
const hrefs = { property: '#property', unit: '#unit', documents: '#documents', timeline: '#timeline', leases: '#leases', ledger: '#ledger' };
const nextAction = { label: warning, description: warning, href: '#review', tone: 'warning' };
const person = { id: 'person-1', displayName: name, legalName: `${name} ${token}`, partyTypeLabel: 'Company', statusLabel: 'Active', statusTone: 'success', contact: { email: `accounts.${token}@example.invalid`, phone: '+44 7700 900123' }, roles: [{ role: 'tenant', status: 'active' }], linked: { activeLease: { unitLabel: `North wing ${token}`, propertyLabel: propertyName } }, hrefs, nextAction, riskIndicators: [{ id: 'risk-1', label: warning, tone: 'warning' }] };
const lease = { id: 'lease-1', tenantName: name, propertyName, propertyCode: 'RGN-001', unitLabel: `North wing ${token}`, hrefs, statusTone: 'success', statusLabel: 'Active', startDateLabel: '01 Jan 2026', endDateLabel: '31 Dec 2027', rentDisplay: money, deposits: [], depositLabel: 'USD 12,345,678.90 held', nextAction };
const task = { id: 'task-1', title: `Inspect and replace the ventilation system for ${propertyName} ${token}`, propertyLabel: propertyName, unitLabel: `North wing ${token}`, hrefs: { task: '#task' }, status: 'pending', statusTone: 'warning', statusLabel: 'Pending', priorityTone: 'danger', priorityLabel: 'Urgent', dueLabel: 'Overdue — follow-up required before resident return', assigneeLabel: name, vendorLabel: name, executionMode: 'internal' };
const event = { id: 'event-1', title: `Inspection follow-up — ${propertyName} ${token}`, description: warning, propertyName, propertyCode: 'RGN-001', unitNumber: token, eventType: 'Inspection', eventDate: '2026-10-04', cost: 9876543.21, currency: 'USD', hrefs, documents: [document], sources: [{ availability: 'available', entityId: 'source-1', entityType: 'maintenance_case', label: token, moduleLabel: 'Maintenance', href: '#source', isArchived: true }], activity: [], activityError: warning, riskIndicators: [{ label: warning, tone: 'warning' }], nextAction, recordCounts: { activity: 0, documents: 1, linkedRecords: 1 }, createdBy: name };
const row = { id: 'line-1', direction: 'expense', category: `Building services and extraordinary maintenance ${token}`, categoryCode: 'MAINT', amountCents: 987654321099n, currency: 'USD', date: '2026-10-04', name, property: propertyName, unit: token, description: warning, sourceHref: '#transaction' };
const reportQuery = { month: '2026-10', ownerPersonId: 'all', peopleArchiveState: 'active', peopleView: 'relationship', propertyId: 'all', report: 'unit-profit-loss', status: 'all', unitId: 'all' };
const report = { kind: 'unit-profit-loss', title: 'Monthly Unit Profit & Loss', columns: [{ key: 'property', label: `Property and operating scope ${token}` }, { key: 'unit', label: 'Unit' }, { key: 'income', label: 'Income', align: 'right' }, { key: 'expenses', label: 'Expenses', align: 'right' }, { key: 'netIncome', label: 'Net income', align: 'right' }], rows: [{ id: 'unit-1', title: propertyName, cells: { property: `${propertyName} ${token}`, unit: token, income: money.primary, expenses: money.primary, netIncome: money.primary }, sourceCount: 1, sourceLinks: [], sourceSummary: '1 source row' }], summary: [], unitProfitLossLines: [], emptyTitle: 'No unit rows', emptyDescription: 'No rows', scopeLabel: 'All properties' };
const propertyRecord = { id:'property-1', name:`${propertyName} ${token}`, code:'RGN-001', type:'Mixed residential and commercial', status:'Active', statusTone:'success', units:1234, occupiedUnits:1200, netIncome:money, netIncomeUsd:100, owner:`${name} ${token}`, address:token, hasActiveOwnerLink:true };
const unitRecord = { id:'unit-1', propertyId:'property-1', unitNumber:token, propertyCode:'RGN-001', propertyName, propertyOwnerName:name, occupancyTone:'success', occupancyLabel:'Occupied', rentDisplay:money, ledgerNetDisplay:money, leaseLabel:`Active lease — ${name} ${token}`, leaseStatusLabel:'Active', tenantName:name, floorLabel:token, readiness:{operational:'available',lease:'occupied',canStartLease:false}, ledgerNetUsd:10 };

const surfaces = {
  auth: <AuthPageShell title="Sign in" description={`Sign in to ${propertyName} ${token}`} switchHref="#home" switchLabel="Home" switchText="Return to the workspace entry page"><LoginForm /></AuthPageShell>,
  dashboard: <RecordsPropertyPreviewList rows={[{ href: '#property', label: `${propertyName} ${token}`, ownerLinked: false, missingTenantLinks: 12, documentCount: 45, unitCount: 99 }]} />,
  property: <PropertyInspector property={{ id: 'property-1', name: `${propertyName} ${token}`, code: 'RGN-001', type: 'Mixed residential and commercial', status: 'Active', statusTone: 'success', units: 1234, occupiedUnits: 1200, netIncome: money, netIncomeUsd: 100, owner: `${name} ${token}`, address: `112 Riverside Gardens, North Community Residential Quarter ${token}`, hasActiveOwnerLink: true }} onArchiveProperty={noop} onEditProperty={noop} onRestoreProperty={noop} />,
  unit: <UnitLeaseDetailsPanel fullRecordHref="#lease" lease={{ tenantName: `${name} ${token}`, statusLabel: 'Active', startDate: '2026-01-01', endDate: '2027-12-31', monthlyRentDisplay: money }} people={[{ id: 'person-1', displayName: `${name} ${token}`, href: '#person' }]} />,
  'unit-inspector': <UnitInspector unit={{ id:'unit-1', propertyId:'property-1', unitNumber:token, propertyCode:'RGN-001', propertyName, occupancyTone:'success', occupancyLabel:'Occupied', rentDisplay:money, ledgerNetDisplay:money, leaseLabel:`Active lease — ${name} ${token}`, floorLabel:`North wing — ${token}`, readiness:{operational:'available',lease:'active',canStartLease:false}, ledgerNetUsd:10 }} onEditUnit={noop} onArchiveUnit={noop} onRestoreUnit={noop} />,
  'properties-register': <PropertiesTable properties={[propertyRecord]} displayMode="table" sort="name_asc" onOpenProperty={noop} onSortChange={noop} onNetSortChange={noop} />,
  'units-register': <UnitsTable units={[unitRecord]} displayMode="table" archiveState="active" sort="unit_asc" onSelectUnit={noop} onSortChange={noop} />,
  'people-register': <PeopleTable people={[{...person, linked:{...person.linked, activeLeaseCount:1}}]} displayMode="table" archiveState="active" />,
  'leases-register': <LeasesTable leases={[{...lease,recordCounts:{ledgerEntries:12},depositDisplay:money}]} archiveState="active" getLeaseHref={()=>'#lease'} onSelectLease={noop} selectedLeaseId="" />,
  'timeline-register': <TimelineTable events={[event]} selectedEventId="" onSelectEvent={noop} />,
  'person-search': <PersonSelect aria-label="Choose tenant" name="tenantId" roles={['tenant']} options={[{id:'person-1',label:name,description:`Tenant — accounts.${token}@example.invalid`,roles:['tenant'],archived:false}]} />,
  'property-filters': <PropertyFilters displayMode="table" onDisplayModeChange={noop} onOpenProperty={noop} properties={[propertyRecord]} viewQuery={parsePropertySearchParams({query:token})} navigation={{isPending:false,replaceParam:noop,search:{query:token,onQueryChange:noop,onCompositionChange:noop,onSubmit:noop,cancelPending:noop}}} />,
  'report-filters': <ReportsFilters compact action="#reports" ownerOptions={[]} propertyOptions={[{id:'property-1',label:`${propertyName} ${token}`}]} unitOptions={[{id:'unit-1',propertyId:'property-1',label:token}]} viewQuery={{...reportQuery,propertyId:'property-1',unitId:'unit-1'}} />,
  people: <PeopleInspector person={person} getPersonHref={() => '#person'} onEditPerson={noop} onArchivePerson={noop} onRestorePerson={noop} />,
  leases: <LeaseInspector lease={lease} getLeaseHref={() => '#lease'} />,
  maintenance: <BoardSurface actorMode="manager" cases={[task]} selectedTaskId="" onSelect={noop} emptyLabel="No cases" />,
  timeline: <TimelineInspector event={event} historyHref="#retry" onEdit={noop} />,
  reports: <><ReportColumns columns={[{ key: 'memo', label: `Supporting transaction description and reconciliation ${token}` }]} selectedColumns={[{ key: 'memo' }]} viewQuery={{ report: 'unit_profit_loss', columns: 'memo' }} /><ProfitLossDetail lines={[row]} /></>,
  'report-detail': <ReportResultsTable report={report} reportRowCount={1} viewQuery={reportQuery} />,
  settings: <Card><CardHeader><SettingsSectionHeader title={`Organization identity — ${name} ${token}`} description={warning} action={<button className="rounded border px-3 py-2" type="button">Save settings</button>} /></CardHeader></Card>,
  documents: <DocumentList documents={[document]} />,
  finance: <FinanceAccountActivityScreen activity={{ account: { displayName: `${propertyName} ${token}`, accountClass: 'expense', accountSubtype: 'operating_expense', accountNumber: token, description: warning }, filters: { periodStart: '2026-01-01', periodEnd: '2026-12-31' }, properties: [{ id: 'property-1', label: `${propertyName} ${token}` }], basisLabel: 'Cash basis — all recorded payments', total: '9,876,543,210.99', runningBalance: null, rows: [{ id: 'entry-1', date: '2026-10-04', propertyLabel: `${propertyName} ${token}`, contact: name, description: warning, sourceHref: '#transaction', increase: '9,876,543,210.99' }] }} />,
  empty: <><RecordsPropertyPreviewList rows={[]} /><DocumentList documents={[]} /><UnitMaintenanceCasePanel maintenanceCase={{ href: '#task', title: warning, category: 'Inspection', statusLabel: 'Blocked', statusTone: 'warning', dueLabel: 'No scheduled date', priorityLabel: 'Urgent', actualCostLabel: 'No cost recorded' }} /></>,
  loading: <PeopleScreenSkeleton />,
};
const surface = new URLSearchParams(location.search).get('surface') || 'people';
createRoot(window.document.getElementById('root')).render(surface === 'auth' ? surfaces.auth : <main className="mx-auto min-w-0 max-w-6xl p-4"><h1 className="mb-4 text-base font-semibold">Synthetic fixture: {surface}</h1><div data-fixture-surface className="min-w-0">{surfaces[surface]}</div></main>);
