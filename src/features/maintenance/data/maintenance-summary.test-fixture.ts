import { buildMaintenanceSummary, maintenanceMatchesReview, type MaintenanceAggregate } from "./maintenance";
import { getMaintenanceTaskFacts } from "../maintenance.facts";
import type { MaintenanceCase, MaintenanceViewQuery } from "../maintenance.types";
import { matchesSearchText } from "@/lib/search/text";
import type { PortfolioSearch } from "@/lib/search/portfolio";

type Row = Record<string, unknown>;
export type MaintenanceRpcArgs = {
  p_organization_id: string;
  p_filters: MaintenanceViewQuery & { actorScope: string; actorBranchId?: string | null; actorPersonId?: string | null; searchTokens: string[] };
  p_today: string;
  p_current_time: string;
  p_month: string;
  p_include_queue_counts: boolean;
};

// Test oracle retains the old JS summary rules. SQL fixtures separately verify
// that the real authenticated RPC produces these counts without raw-row transfer.
export function aggregateMaintenanceFixture(
  rows: Row[], args: MaintenanceRpcArgs, tables: Record<string, Row[]>, portfolio?: PortfolioSearch,
): MaintenanceAggregate {
  const query = args.p_filters;
  const base = rows.filter(row =>
    (row.organization_id === undefined || row.organization_id === args.p_organization_id) &&
    (query.archiveState === "all" || (query.archiveState === "archived" ? row.archived_at != null : row.archived_at == null)) &&
    (query.actorScope === "organization" || row.branch_id === (query.actorBranchId ?? "00000000-0000-0000-0000-000000000000")) &&
    (query.actorScope !== "assigned" || row.assignee_person_id === (query.actorPersonId ?? "00000000-0000-0000-0000-000000000000")),
  );
  const toCase = (row: Row): MaintenanceCase => {
    const facts = getMaintenanceTaskFacts({ dueDate: row.due_date as string | null, priority: String(row.priority), status: String(row.status) }, args.p_today);
    const property = tables.properties?.find(p => p.id === row.property_id && p.archived_at == null);
    const unit = tables.units?.find(u => u.id === row.unit_id && u.archived_at == null);
    const reminderDate = row.reminder_date as string | null;
    const reminderTime = (row.reminder_time as string | null)?.slice(0, 5);
    return {
      ...facts, id: row.id, title: row.title, description: row.description ?? "", category: row.category,
      dueDate: row.due_date ?? undefined, reminderDate: reminderDate ?? undefined, createdAt: row.created_at,
      propertyId: row.property_id, propertyLabel: property ? `${property.code} - ${property.name}` : "Unknown property",
      unitId: row.unit_id ?? undefined, unitLabel: unit ? `Unit ${unit.unit_number}` : "No specific unit",
      actualCostAmount: row.actual_cost_amount ?? 0, costEstimateAmount: row.cost_estimate_amount ?? 0,
      isHighCost: Math.max(Number(row.actual_cost_amount ?? 0), Number(row.cost_estimate_amount ?? 0)) >= 1000,
      isUpcoming: facts.progressState === "upcoming" || facts.progressState === "due_today",
      isReminderDue: ["pending", "scheduled", "in_progress", "blocked"].includes(facts.status) && Boolean(reminderDate &&
        (reminderDate < args.p_today || reminderDate === args.p_today && (!reminderTime || reminderTime <= args.p_current_time))),
      recurrenceFrequency: row.recurrence_frequency,
    } as MaintenanceCase;
  };
  const context = (row: Row) =>
    (query.propertyId === "all" || row.property_id === query.propertyId) &&
    (query.unitId === "all" || row.unit_id === query.unitId) &&
    (query.priority === "all" || row.priority === query.priority) &&
    query.searchTokens.every(token => ["title", "description", "category", "status", "priority"].some(field =>
      String(row[field] ?? "").toLowerCase().includes(token)) ||
      matchesSearchText(token, portfolio?.propertyValues(String(row.property_id)) ?? []) ||
      matchesSearchText(token, portfolio?.unitValues(String(row.unit_id)) ?? []));
  const filtered = base.filter(row => query.taskId !== "all" ? row.id === query.taskId :
    context(row) && (query.status === "all" || row.status === query.status) && maintenanceMatchesReview(toCase(row), query.review));
  const compare = (column: string, ascending = true) => (a: Row, b: Row) => {
    if (a[column] === b[column]) return 0;
    if (a[column] == null) return 1;
    if (b[column] == null) return -1;
    const difference = typeof a[column] === "number" ? Number(a[column]) - Number(b[column]) : String(a[column]).localeCompare(String(b[column]));
    return ascending ? difference : -difference;
  };
  filtered.sort((a, b) => {
    const sort = query.sort === "created_desc" ? compare("created_at", false)(a, b)
      : query.sort === "cost_desc" ? compare("actual_cost_amount", false)(a, b) || compare("cost_estimate_amount", false)(a, b) || compare("due_date")(a, b)
      : query.sort === "priority_desc" ? compare("priority", false)(a, b) || compare("due_date")(a, b)
      : compare("due_date")(a, b) || compare("due_time")(a, b) || compare("created_at", false)(a, b);
    return sort || compare("id")(a, b);
  });
  const cases = filtered.map(toCase);
  const built = buildMaintenanceSummary(cases, query.month);
  const queue = base.filter(context).map(toCase);
  const pageSize = Math.max(1, Math.min(100, query.pageSize));
  const page = Math.min(Math.max(1, query.page), Math.max(1, Math.ceil(cases.length / pageSize)));
  return {
    page, pageSize, pageIds: cases.slice((page - 1) * pageSize, page * pageSize).map(c => c.id),
    summary: {
      ...built, actualCostAmount: cases.reduce((sum, c) => sum + c.actualCostAmount, 0),
      estimateCostAmount: cases.reduce((sum, c) => sum + c.costEstimateAmount, 0),
      repeatedIssues: built.repeatedIssues.map(issue => {
        const params = new URL(issue.href, "https://fixture.test").searchParams;
        return { ...issue, propertyId: params.get("propertyId")!, unitId: params.get("unitId") };
      }),
    },
    queueCounts: args.p_include_queue_counts ? {
      completed: queue.filter(c => c.status === "completed").length, open: queue.filter(c => c.isOpen).length,
      overdue: queue.filter(c => c.isOverdue).length, readyForReview: queue.filter(c => c.status === "ready_for_review").length,
      total: queue.length, upcoming: queue.filter(c => c.isUpcoming).length,
    } : null,
  };
}
