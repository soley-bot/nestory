import { toRecentChange } from "@/features/activity/recent-changes";
import {
  HIGH_COST_AMOUNT,
  MAINTENANCE_UPCOMING_WINDOW_DAYS,
} from "@/features/maintenance/maintenance.constants";
import {
  formatMaintenanceChecklistText,
  parseMaintenanceChecklistValue,
} from "@/features/maintenance/maintenance.checklist";
import {
  buildMaintenancePagination,
  parseMaintenanceSearchParams,
} from "@/features/maintenance/maintenance.filters";
import type {
  MaintenanceBadgeTone,
  MaintenanceBranchOption,
  MaintenanceCase,
  MaintenanceCategoryStat,
  MaintenanceLinkedDocument,
  MaintenanceActor,
  MaintenancePriority,
  MaintenanceProgressState,
  MaintenancePropertyOption,
  MaintenancePropertyStat,
  MaintenanceRecurrenceFrequency,
  MaintenanceRepeatedIssue,
  MaintenanceReminderNotification,
  MaintenanceReviewFilter,
  MaintenanceScreenData,
  MaintenanceStatus,
  MaintenanceSummary,
  MaintenanceUnitStat,
  MaintenanceUnitOption,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";
import type { Json } from "@/types/database";
import { createSupabaseServerClient } from "@/lib/db/server";
import { formatDate } from "@/lib/dates/format";
import {
  formatMoney,
  formatMoneyDisplay,
  type CurrencyCode,
} from "@/lib/money/format";

const taskSelect =
  "id, tenant_request_id, property_id, unit_id, branch_id, assignee_person_id, title, description, category, priority, status, due_date, due_time, reminder_date, reminder_time, vendor_person_id, cost_estimate_amount, cost_estimate_currency, actual_cost_amount, actual_cost_currency, checklist, recurrence_frequency, ledger_entry_id, timeline_event_id, completed_at, created_at, archived_at";
const propertySelect = "id, code, name";
const unitSelect = "id, property_id, unit_number";
const personSelect = "id, display_name";
const branchSelect = "id, name, code";
const staffRoleSelect = "person_id";
const documentSelect =
  "id, task_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at";
const MAINTENANCE_QUERY_BATCH_SIZE = 1_000;
const OPEN_TASK_STATUSES = ["pending", "scheduled", "in_progress", "blocked"];

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type UntypedSupabaseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type MaintenanceTaskRow = {
  actual_cost_amount: number | null;
  actual_cost_currency: CurrencyCode | null;
  assignee_person_id: string | null;
  archived_at: string | null;
  branch_id: string | null;
  category: string;
  checklist: Json;
  completed_at: string | null;
  cost_estimate_amount: number | null;
  cost_estimate_currency: CurrencyCode | null;
  created_at: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  id: string;
  ledger_entry_id: string | null;
  priority: string;
  property_id: string;
  recurrence_frequency: string;
  reminder_date: string | null;
  reminder_time: string | null;
  status: string;
  tenant_request_id: string;
  timeline_event_id: string | null;
  title: string;
  unit_id: string | null;
  vendor_person_id: string | null;
};

type PropertyRow = {
  code: string;
  id: string;
  name: string;
};

type UnitRow = {
  id: string;
  property_id: string;
  unit_number: string;
};

type PersonRow = {
  display_name: string;
  id: string;
};

type BranchRow = {
  code: string;
  id: string;
  name: string;
};

type StaffRoleRow = {
  person_id: string;
};

type DocumentRow = {
  category: string;
  file_name: string;
  id: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  task_id: string | null;
  uploaded_at: string;
  url?: string;
};

type ActivityRow = Parameters<typeof toRecentChange>[0];

export async function getMaintenanceScreenData(
  organizationId: string,
  viewQuery: MaintenanceViewQuery = parseMaintenanceSearchParams({}),
  actor?: MaintenanceActor,
): Promise<MaintenanceScreenData> {
  const supabase = await createSupabaseServerClient();
  const untypedSupabase = supabase as unknown as UntypedSupabaseClient;
  const now = new Date();
  const today = toIsoDate(now);
  const currentTime = toIsoTime(now);
  const [
    branchesResult,
    propertiesResult,
    unitsResult,
    peopleResult,
    staffRolesResult,
  ] = await Promise.all([
    untypedSupabase
      .from("organization_branches")
      .select(branchSelect)
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .eq("status", "active")
      .order("name", { ascending: true }),
    supabase
      .from("properties")
      .select(propertySelect)
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("code", { ascending: true }),
    supabase
      .from("units")
      .select(unitSelect)
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("unit_number", { ascending: true }),
    supabase
      .from("people")
      .select(personSelect)
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("display_name", { ascending: true }),
    supabase
      .from("person_roles")
      .select(staffRoleSelect)
      .eq("organization_id", organizationId)
      .eq("role", "staff")
      .eq("status", "active")
      .is("archived_at", null),
  ]);

  if (branchesResult.error) {
    throw new Error(
      `Could not load maintenance branches: ${branchesResult.error.message}`,
    );
  }

  if (propertiesResult.error) {
    throw new Error(
      `Could not load maintenance properties: ${propertiesResult.error.message}`,
    );
  }

  if (unitsResult.error) {
    throw new Error(`Could not load maintenance units: ${unitsResult.error.message}`);
  }

  if (peopleResult.error) {
    throw new Error(`Could not load maintenance people: ${peopleResult.error.message}`);
  }

  if (staffRolesResult.error) {
    throw new Error(
      `Could not load maintenance staff roles: ${staffRolesResult.error.message}`,
    );
  }

  const branchesById = indexById(
    ((branchesResult.data ?? []) as unknown) as BranchRow[],
  );
  const propertiesById = indexById(propertiesResult.data ?? []);
  const unitsById = indexById(unitsResult.data ?? []);
  const peopleById = indexById(peopleResult.data ?? []);
  const staffPersonIds = new Set(
    ((staffRolesResult.data ?? []) as StaffRoleRow[]).map((role) => role.person_id),
  );

  const [pagedTasks, summaryTaskRows] = await Promise.all([
    getPagedTaskRows(untypedSupabase, organizationId, viewQuery, today, currentTime, actor),
    getSummaryTaskRows(
      untypedSupabase,
      organizationId,
      viewQuery,
      today,
      currentTime,
      actor,
    ),
  ]);
  const pageCases = pagedTasks.rows.map((task) =>
    toMaintenanceCase({
      activity: [],
      branchesById,
      documents: [],
      peopleById,
      propertiesById,
      currentTime,
      task,
      today,
      unitsById,
    }),
  );
  const summaryCases = summaryTaskRows.map((task) =>
    toMaintenanceCase({
      activity: [],
      branchesById,
      documents: [],
      peopleById,
      propertiesById,
      currentTime,
      task,
      today,
      unitsById,
    }),
  );
  const pageTaskIds = pageCases.map((maintenanceCase) => maintenanceCase.id);
  const [documentRows, activityRows] = await Promise.all([
    getTaskDocuments(supabase, organizationId, pageTaskIds),
    getTaskActivity(supabase, organizationId, pageTaskIds),
  ]);
  const documentsByTaskId = groupDocumentsByTaskId(documentRows);
  const activityByTaskId = groupActivityByTaskId(activityRows);

  return {
    cases: pageCases.map((maintenanceCase) => ({
      ...maintenanceCase,
      activity: activityByTaskId.get(maintenanceCase.id) ?? [],
      documents: (documentsByTaskId.get(maintenanceCase.id) ?? []).map(
        toLinkedDocument,
      ),
    })),
    pagination: pagedTasks.pagination,
    branchOptions: toBranchOptions(
      ((branchesResult.data ?? []) as unknown) as BranchRow[],
    ),
    peopleOptions: (peopleResult.data ?? []).map((person) => ({
      id: person.id,
      label: person.display_name,
    })),
    propertyOptions: toPropertyOptions(propertiesResult.data ?? []),
    summary: buildMaintenanceSummary(summaryCases, today, viewQuery.month),
    staffOptions: (peopleResult.data ?? [])
      .filter((person) => staffPersonIds.has(person.id))
      .map((person) => ({
        id: person.id,
        label: person.display_name,
      })),
    unitOptions: toUnitOptions(unitsResult.data ?? [], propertiesById),
  };
}

export async function getMaintenanceReminderNotifications(
  organizationId: string,
  actor?: MaintenanceActor,
): Promise<MaintenanceReminderNotification[]> {
  const supabase = await createSupabaseServerClient();
  const untypedSupabase = supabase as unknown as UntypedSupabaseClient;
  let query = untypedSupabase
    .from("tasks")
    .select(
      "id, property_id, unit_id, title, status, due_date, due_time, reminder_date, reminder_time",
    )
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .not("reminder_date", "is", null)
    .in("status", ["pending", "scheduled", "in_progress", "blocked"]);

  query = applyActorTaskScope(query, actor);

  const { data, error } = await query
    .order("reminder_date", { ascending: true, nullsFirst: false })
    .order("reminder_time", { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) {
    throw new Error(`Could not load maintenance reminders: ${error.message}`);
  }

  const taskRows = (data ?? []) as Array<
    Pick<
      MaintenanceTaskRow,
      | "due_date"
      | "due_time"
      | "id"
      | "property_id"
      | "reminder_date"
      | "reminder_time"
      | "title"
      | "unit_id"
    >
  >;

  if (taskRows.length === 0) {
    return [];
  }

  const propertyIds = [...new Set(taskRows.map((task) => task.property_id))];
  const unitIds = [
    ...new Set(taskRows.map((task) => task.unit_id).filter(Boolean) as string[]),
  ];
  const [propertiesResult, unitsResult] = await Promise.all([
    supabase
      .from("properties")
      .select(propertySelect)
      .eq("organization_id", organizationId)
      .in("id", propertyIds),
    unitIds.length > 0
      ? supabase
          .from("units")
          .select(unitSelect)
          .eq("organization_id", organizationId)
          .in("id", unitIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (propertiesResult.error) {
    throw new Error(
      `Could not load reminder properties: ${propertiesResult.error.message}`,
    );
  }

  if (unitsResult.error) {
    throw new Error(`Could not load reminder units: ${unitsResult.error.message}`);
  }

  const propertiesById = indexById(propertiesResult.data ?? []);
  const unitsById = indexById((unitsResult.data ?? []) as UnitRow[]);

  return taskRows.map((task) => {
    const property = propertiesById.get(task.property_id);
    const unit = task.unit_id ? unitsById.get(task.unit_id) : undefined;
    const reminderTime = normalizeTime(task.reminder_time) ?? "00:00";

    return {
      dueLabel: formatDateTimeLabel(task.due_date, task.due_time, "No due date"),
      href: buildHref("/maintenance", {
        archiveState: "all",
        taskId: task.id,
      }),
      id: task.id,
      propertyLabel: property
        ? `${property.code} - ${property.name}`
        : "Unknown property",
      reminderAt: `${task.reminder_date}T${reminderTime}:00`,
      reminderLabel: formatDateTimeLabel(
        task.reminder_date,
        task.reminder_time,
        "No reminder",
      ),
      title: task.title,
      unitLabel: unit ? `Unit ${unit.unit_number}` : "Property level",
    };
  });
}

export function isOpenMaintenanceStatus(status: MaintenanceStatus) {
  return status !== "completed" && status !== "cancelled";
}

export function getMaintenanceProgressState(
  task: Pick<MaintenanceCase, "dueDate" | "status">,
  today: string,
): MaintenanceProgressState {
  if (task.status === "completed") {
    return "completed";
  }

  if (task.status === "cancelled") {
    return "cancelled";
  }

  if (!task.dueDate) {
    return task.status === "scheduled" ? "scheduled" : "open";
  }

  if (task.dueDate < today) {
    return "overdue";
  }

  if (task.dueDate === today) {
    return "due_today";
  }

  return diffDays(today, task.dueDate) <= MAINTENANCE_UPCOMING_WINDOW_DAYS
    ? "upcoming"
    : "scheduled";
}

export function maintenanceMatchesReview(
  maintenanceCase: MaintenanceCase,
  review: MaintenanceReviewFilter,
) {
  if (review === "open") {
    return maintenanceCase.isOpen;
  }

  if (review === "overdue") {
    return maintenanceCase.isOverdue;
  }

  if (review === "scheduled") {
    return (
      maintenanceCase.isOpen &&
      (Boolean(maintenanceCase.dueDate) || Boolean(maintenanceCase.reminderDate))
    );
  }

  if (review === "upcoming") {
    return maintenanceCase.isUpcoming;
  }

  if (review === "reminders") {
    return maintenanceCase.isReminderDue;
  }

  if (review === "work_orders") {
    return true;
  }

  if (review === "inspections") {
    const inspectionText = [
      maintenanceCase.category,
      maintenanceCase.title,
      maintenanceCase.description,
    ]
      .join(" ")
      .toLowerCase();

    return inspectionText.includes("inspection") || inspectionText.includes("inspect");
  }

  if (review === "high_priority") {
    return maintenanceCase.priority === "high" || maintenanceCase.priority === "urgent";
  }

  if (review === "high_cost") {
    return maintenanceCase.isHighCost;
  }

  if (review === "recurring") {
    return maintenanceCase.recurrenceFrequency !== "none";
  }

  if (review === "completed") {
    return maintenanceCase.status === "completed";
  }

  return true;
}

export function buildMaintenanceSummary(
  cases: MaintenanceCase[],
  today: string,
  month: string,
): MaintenanceSummary {
  const monthCases = cases.filter((maintenanceCase) =>
    getMaintenanceMonthDate(maintenanceCase).startsWith(month),
  );
  const openCases = cases.filter((maintenanceCase) => maintenanceCase.isOpen);
  const categoryStats = buildCategoryStats(monthCases);

  return {
    actualCostDisplay: formatMoneyDisplay(
      cases.reduce((total, maintenanceCase) => total + getActualCostAmount(maintenanceCase), 0),
      "USD",
    ),
    blocked: cases.filter((maintenanceCase) => maintenanceCase.status === "blocked").length,
    categoryStats,
    completed: cases.filter((maintenanceCase) => maintenanceCase.status === "completed").length,
    estimateCostDisplay: formatMoneyDisplay(
      cases.reduce((total, maintenanceCase) => total + getEstimateCostAmount(maintenanceCase), 0),
      "USD",
    ),
    highCost: cases.filter((maintenanceCase) => maintenanceCase.isHighCost).length,
    highPriority: cases.filter(
      (maintenanceCase) =>
        maintenanceCase.priority === "high" || maintenanceCase.priority === "urgent",
    ).length,
    inProgress: cases.filter((maintenanceCase) => maintenanceCase.status === "in_progress").length,
    open: openCases.length,
    overdue: cases.filter((maintenanceCase) => maintenanceCase.isOverdue).length,
    pending: cases.filter((maintenanceCase) => maintenanceCase.status === "pending").length,
    propertyStats: buildPropertyStats(cases),
    recurring: cases.filter((maintenanceCase) => maintenanceCase.recurrenceFrequency !== "none").length,
    reminderDue: cases.filter((maintenanceCase) => maintenanceCase.isReminderDue).length,
    repeatedIssues: buildRepeatedIssues(cases),
    scheduled: cases.filter((maintenanceCase) => maintenanceCase.status === "scheduled").length,
    total: cases.length,
    upcoming: cases.filter((maintenanceCase) => isUpcomingCase(maintenanceCase, today)).length,
    unitStats: buildUnitStats(cases),
  };
}

async function getPagedTaskRows(
  supabase: UntypedSupabaseClient,
  organizationId: string,
  viewQuery: MaintenanceViewQuery,
  today: string,
  currentTime: string,
  actor?: MaintenanceActor,
) {
  let result = await buildTasksQuery(
    supabase,
    organizationId,
    viewQuery,
    today,
    currentTime,
    actor,
  ).range(getPageStart(viewQuery.page, viewQuery.pageSize), getPageEnd(viewQuery.page, viewQuery.pageSize));

  if (result.error) {
    throw new Error(`Could not load maintenance cases: ${result.error.message}`);
  }

  let pagination = buildMaintenancePagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: result.count ?? 0,
  });

  if (pagination.page !== viewQuery.page) {
    result = await buildTasksQuery(
      supabase,
      organizationId,
      { ...viewQuery, page: pagination.page },
      today,
      currentTime,
      actor,
    ).range(
      getPageStart(pagination.page, pagination.pageSize),
      getPageEnd(pagination.page, pagination.pageSize),
    );

    if (result.error) {
      throw new Error(`Could not load maintenance cases: ${result.error.message}`);
    }

    pagination = {
      ...pagination,
      totalCount: result.count ?? pagination.totalCount,
    };
  }

  return {
    pagination,
    rows: (result.data ?? []) as MaintenanceTaskRow[],
  };
}

async function getSummaryTaskRows(
  supabase: UntypedSupabaseClient,
  organizationId: string,
  viewQuery: MaintenanceViewQuery,
  today: string,
  currentTime: string,
  actor?: MaintenanceActor,
) {
  const rows: MaintenanceTaskRow[] = [];
  let from = 0;
  let totalCount: number | null = null;

  do {
    const result = await buildTasksQuery(
      supabase,
      organizationId,
      viewQuery,
      today,
      currentTime,
      actor,
    ).range(from, from + MAINTENANCE_QUERY_BATCH_SIZE - 1);

    if (result.error) {
      throw new Error(`Could not load maintenance summary: ${result.error.message}`);
    }

    totalCount = result.count ?? totalCount;
    const batch = (result.data ?? []) as MaintenanceTaskRow[];
    rows.push(...batch);

    if (batch.length < MAINTENANCE_QUERY_BATCH_SIZE) {
      break;
    }

    from += MAINTENANCE_QUERY_BATCH_SIZE;
  } while (totalCount === null || rows.length < totalCount);

  return rows;
}

function buildTasksQuery(
  supabase: UntypedSupabaseClient,
  organizationId: string,
  viewQuery: MaintenanceViewQuery,
  today: string,
  currentTime: string,
  actor?: MaintenanceActor,
) {
  let query = supabase
    .from("tasks")
    .select(taskSelect, { count: "exact" })
    .eq("organization_id", organizationId);

  query = applyActorTaskScope(query, actor);

  if (viewQuery.archiveState === "active") {
    query = query.is("archived_at", null);
  } else if (viewQuery.archiveState === "archived") {
    query = query.not("archived_at", "is", null);
  }

  if (viewQuery.taskId !== "all") {
    query = query.eq("id", viewQuery.taskId);
  } else if (viewQuery.propertyId !== "all") {
    query = query.eq("property_id", viewQuery.propertyId);
  }

  if (viewQuery.taskId === "all" && viewQuery.unitId !== "all") {
    query = query.eq("unit_id", viewQuery.unitId);
  }

  if (viewQuery.taskId !== "all") {
    return applyTaskSort(query, viewQuery.sort);
  }

  if (viewQuery.priority !== "all") {
    query = query.eq("priority", viewQuery.priority);
  }

  if (viewQuery.status !== "all") {
    query = query.eq("status", viewQuery.status);
  }

  query = applyReviewFilter(query, viewQuery, today, currentTime);
  query = applySearchFilter(query, viewQuery.query);

  return applyTaskSort(query, viewQuery.sort);
}

function applyReviewFilter(
  query: ReturnType<UntypedSupabaseClient["from"]>,
  viewQuery: MaintenanceViewQuery,
  today: string,
  currentTime: string,
) {
  if (viewQuery.review === "all" || viewQuery.review === "work_orders") {
    return query;
  }

  if (viewQuery.review === "open") {
    return query.in("status", OPEN_TASK_STATUSES);
  }

  if (viewQuery.review === "overdue") {
    return query.in("status", OPEN_TASK_STATUSES).lt("due_date", today);
  }

  if (viewQuery.review === "scheduled") {
    return query
      .in("status", OPEN_TASK_STATUSES)
      .or("due_date.not.is.null,reminder_date.not.is.null");
  }

  if (viewQuery.review === "upcoming") {
    return query
      .in("status", OPEN_TASK_STATUSES)
      .gte("due_date", today)
      .lte("due_date", addDaysIso(today, MAINTENANCE_UPCOMING_WINDOW_DAYS));
  }

  if (viewQuery.review === "reminders") {
    return query
      .in("status", OPEN_TASK_STATUSES)
      .not("reminder_date", "is", null)
      .or(
        `reminder_date.lt.${today},and(reminder_date.eq.${today},or(reminder_time.is.null,reminder_time.lte.${currentTime}))`,
      );
  }

  if (viewQuery.review === "inspections") {
    return query.or(
      "category.ilike.%inspect%,title.ilike.%inspect%,description.ilike.%inspect%",
    );
  }

  if (viewQuery.review === "high_priority") {
    return query.in("priority", ["high", "urgent"]);
  }

  if (viewQuery.review === "high_cost") {
    return query.or(
      `actual_cost_amount.gte.${HIGH_COST_AMOUNT},cost_estimate_amount.gte.${HIGH_COST_AMOUNT}`,
    );
  }

  if (viewQuery.review === "recurring") {
    return query.neq("recurrence_frequency", "none");
  }

  if (viewQuery.review === "completed") {
    return query.eq("status", "completed");
  }

  return query;
}

function applySearchFilter(
  query: ReturnType<UntypedSupabaseClient["from"]>,
  search: string,
) {
  return getSearchTokens(search).reduce(
    (currentQuery, token) =>
      currentQuery.or(
        [
          `title.ilike.%${token}%`,
          `description.ilike.%${token}%`,
          `category.ilike.%${token}%`,
          `status.ilike.%${token}%`,
          `priority.ilike.%${token}%`,
        ].join(","),
      ),
    query,
  );
}

function applyTaskSort(
  query: ReturnType<UntypedSupabaseClient["from"]>,
  sort: MaintenanceViewQuery["sort"],
) {
  if (sort === "created_desc") {
    return query.order("created_at", { ascending: false });
  }

  if (sort === "cost_desc") {
    return query
      .order("actual_cost_amount", { ascending: false, nullsFirst: false })
      .order("cost_estimate_amount", { ascending: false, nullsFirst: false })
      .order("due_date", { ascending: true, nullsFirst: false });
  }

  if (sort === "priority_desc") {
    return query
      .order("priority", { ascending: false })
      .order("due_date", { ascending: true, nullsFirst: false });
  }

  return query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
}

function getSearchTokens(search: string) {
  return search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/[%,]/g, ""));
}

function getPageStart(page: number, pageSize: number) {
  return (Math.max(page, 1) - 1) * pageSize;
}

function getPageEnd(page: number, pageSize: number) {
  return getPageStart(page, pageSize) + pageSize - 1;
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function applyActorTaskScope<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  actor?: MaintenanceActor,
) {
  if (actor?.role === "member") {
    return actor.personId
      ? query.eq("assignee_person_id", actor.personId)
      : query.eq("assignee_person_id", "00000000-0000-0000-0000-000000000000");
  }

  if (actor?.role === "manager" && actor.branchId) {
    return query.eq("branch_id", actor.branchId);
  }

  return query;
}

async function getTaskDocuments(
  supabase: SupabaseServerClient,
  organizationId: string,
  taskIds: string[],
): Promise<DocumentRow[]> {
  if (taskIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("documents")
    .select(documentSelect)
    .eq("organization_id", organizationId)
    .in("task_id", taskIds)
    .is("archived_at", null)
    .order("uploaded_at", { ascending: false });

  if (result.error) {
    throw new Error(`Could not load maintenance documents: ${result.error.message}`);
  }

  return addSignedDocumentUrls(result.data ?? [], supabase);
}

async function getTaskActivity(
  supabase: SupabaseServerClient,
  organizationId: string,
  taskIds: string[],
): Promise<ActivityRow[]> {
  if (taskIds.length === 0) {
    return [];
  }

  const result = await supabase
    .from("activity_logs")
    .select("id, entity_type, entity_id, action, previous_values, new_values, created_at")
    .eq("organization_id", organizationId)
    .eq("entity_type", "task")
    .in("entity_id", taskIds)
    .order("created_at", { ascending: false })
    .limit(180);

  if (result.error) {
    throw new Error(`Could not load maintenance activity: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function addSignedDocumentUrls(
  rows: DocumentRow[],
  supabase: SupabaseServerClient,
) {
  if (rows.length === 0) {
    return [];
  }

  const { data } = await supabase.storage.from("nestory-documents").createSignedUrls(
    rows.map((row) => row.storage_path),
    60 * 60,
  );

  return rows.map((row, index) => ({
    ...row,
    url: data?.[index]?.signedUrl ?? undefined,
  }));
}

function toMaintenanceCase({
  activity,
  branchesById,
  currentTime,
  documents,
  peopleById,
  propertiesById,
  task,
  today,
  unitsById,
}: {
  activity: ReturnType<typeof toRecentChange>[];
  branchesById: Map<string, BranchRow>;
  currentTime: string;
  documents: DocumentRow[];
  peopleById: Map<string, PersonRow>;
  propertiesById: Map<string, PropertyRow>;
  task: MaintenanceTaskRow;
  today: string;
  unitsById: Map<string, UnitRow>;
}): MaintenanceCase {
  const property = propertiesById.get(task.property_id);
  const unit = task.unit_id ? unitsById.get(task.unit_id) : undefined;
  const branch = task.branch_id ? branchesById.get(task.branch_id) : undefined;
  const assignee = task.assignee_person_id
    ? peopleById.get(task.assignee_person_id)
    : undefined;
  const vendor = task.vendor_person_id ? peopleById.get(task.vendor_person_id) : undefined;
  const status = normalizeMaintenanceStatus(task.status);
  const priority = normalizeMaintenancePriority(task.priority);
  const recurrenceFrequency = normalizeRecurrence(task.recurrence_frequency);
  const checklist = parseMaintenanceChecklistValue(task.checklist);
  const progressState = getMaintenanceProgressState(
    {
      dueDate: task.due_date ?? undefined,
      status,
    },
    today,
  );
  const actualCostDisplay =
    task.actual_cost_amount !== null && task.actual_cost_currency
      ? formatMoneyDisplay(task.actual_cost_amount, task.actual_cost_currency)
      : undefined;
  const costEstimateDisplay =
    task.cost_estimate_amount !== null && task.cost_estimate_currency
      ? formatMoneyDisplay(task.cost_estimate_amount, task.cost_estimate_currency)
      : undefined;
  const maintenanceCase = {
    activity,
    actualCostAmount: task.actual_cost_amount ?? 0,
    actualCostDisplay,
    actualCostLabel:
      task.actual_cost_amount !== null && task.actual_cost_currency
        ? formatMoney(task.actual_cost_amount, task.actual_cost_currency)
        : "No actual cost",
    archivedAt: task.archived_at ?? undefined,
    assigneeLabel: assignee?.display_name ?? "Unassigned",
    assigneePersonId: task.assignee_person_id ?? undefined,
    branchId: task.branch_id ?? undefined,
    branchLabel: branch ? `${branch.code} - ${branch.name}` : "No branch",
    category: task.category,
    checklist,
    checklistDoneCount: checklist.filter((item) => item.completed).length,
    checklistTotalCount: checklist.length,
    costEstimateAmount: task.cost_estimate_amount ?? 0,
    costEstimateDisplay,
    costEstimateLabel:
      task.cost_estimate_amount !== null && task.cost_estimate_currency
        ? formatMoney(task.cost_estimate_amount, task.cost_estimate_currency)
        : "No estimate",
    createdAt: task.created_at,
    description: task.description ?? "",
    documents: documents.map(toLinkedDocument),
    dueDate: task.due_date ?? undefined,
    dueLabel: formatDateTimeLabel(task.due_date, task.due_time, "No due date"),
    dueTime: normalizeTime(task.due_time),
    formValues: {
      actualCostAmount: task.actual_cost_amount,
      assigneePersonId: task.assignee_person_id,
      branchId: task.branch_id,
      category: task.category,
      checklistText: formatMaintenanceChecklistText(checklist),
      costEstimateAmount: task.cost_estimate_amount,
      description: task.description,
      dueDate: task.due_date,
      dueTime: normalizeTime(task.due_time),
      priority,
      propertyId: task.property_id,
      recurrenceFrequency,
      reminderDate: task.reminder_date,
      reminderTime: normalizeTime(task.reminder_time),
      status,
      title: task.title,
      unitId: task.unit_id,
      vendorPersonId: task.vendor_person_id,
    },
    hrefs: buildMaintenanceHrefs(task),
    id: task.id,
    isArchived: Boolean(task.archived_at),
    isHighCost: getRawCaseCost(task) >= HIGH_COST_AMOUNT,
    isOpen: isOpenMaintenanceStatus(status),
    isOverdue: progressState === "overdue",
    isReminderDue: isReminderDue(task, today, currentTime),
    isUpcoming:
      progressState === "upcoming" ||
      progressState === "due_today",
    ledgerEntryId: task.ledger_entry_id ?? undefined,
    priority,
    priorityLabel: formatStoredLabel(priority),
    priorityTone: getPriorityTone(priority),
    progressLabel: formatProgressState(progressState),
    progressState,
    progressTone: getProgressTone(progressState),
    propertyId: task.property_id,
    propertyLabel: property ? `${property.code} - ${property.name}` : "Unknown property",
    recurrenceFrequency,
    recurrenceLabel: formatRecurrence(recurrenceFrequency),
    reminderDate: task.reminder_date ?? undefined,
    reminderLabel: formatDateTimeLabel(
      task.reminder_date,
      task.reminder_time,
      "No reminder",
    ),
    reminderTime: normalizeTime(task.reminder_time),
    requestId: task.tenant_request_id,
    status,
    statusLabel: formatStoredLabel(status),
    statusTone: getStatusTone(status),
    timelineEventId: task.timeline_event_id ?? undefined,
    title: task.title,
    unitId: task.unit_id ?? undefined,
    unitLabel: unit ? `Unit ${unit.unit_number}` : "Property level",
    vendorLabel: vendor?.display_name ?? "No vendor/person",
    vendorPersonId: task.vendor_person_id ?? undefined,
  } satisfies MaintenanceCase;

  return maintenanceCase;
}

export function buildMaintenanceHrefs(task: MaintenanceTaskRow) {
  return {
    assignee: task.assignee_person_id
      ? buildHref("/people", {
          archiveState: "all",
          personId: task.assignee_person_id,
        })
      : undefined,
    documents: `/documents?archiveState=all&taskId=${task.id}`,
    documentUpload: buildHref("/documents", {
      action: "create",
      category: "Maintenance",
      propertyId: task.property_id,
      taskId: task.id,
      unitId: task.unit_id ?? undefined,
    }),
    ledger: task.ledger_entry_id
      ? buildHref("/ledger", {
          archiveState: "all",
          entryId: task.ledger_entry_id,
        })
      : undefined,
    property: `/properties/${task.property_id}`,
    task: buildHref("/maintenance", {
      archiveState: "all",
      taskId: task.id,
    }),
    timeline: task.timeline_event_id
      ? buildHref("/timeline", {
          archiveState: "all",
          eventId: task.timeline_event_id,
        })
      : undefined,
    unit: task.unit_id ? `/units/${task.unit_id}` : undefined,
    vendor: task.vendor_person_id
      ? buildHref("/people", {
          archiveState: "all",
          personId: task.vendor_person_id,
        })
      : undefined,
  };
}

function toLinkedDocument(document: DocumentRow): MaintenanceLinkedDocument {
  return {
    category: document.category,
    fileName: document.file_name,
    href: `/documents?archiveState=all&documentId=${document.id}`,
    id: document.id,
    mimeType: document.mime_type,
    sizeBytes: document.size_bytes,
    uploadedAt: document.uploaded_at,
    url: document.url,
  };
}

export function filterMaintenanceCases(
  cases: MaintenanceCase[],
  viewQuery: MaintenanceViewQuery,
  today: string,
) {
  if (viewQuery.taskId !== "all") {
    return cases.filter((maintenanceCase) => maintenanceCase.id === viewQuery.taskId);
  }

  const tokens = viewQuery.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return cases.filter((maintenanceCase) => {
    const haystack = [
      maintenanceCase.title,
      maintenanceCase.description,
      maintenanceCase.category,
      maintenanceCase.propertyLabel,
      maintenanceCase.unitLabel,
      maintenanceCase.vendorLabel,
      maintenanceCase.statusLabel,
      maintenanceCase.priorityLabel,
    ]
      .join(" ")
      .toLowerCase();

    return (
      tokens.every((token) => haystack.includes(token)) &&
      maintenanceMatchesReview(maintenanceCase, viewQuery.review) &&
      (viewQuery.propertyId === "all" ||
        maintenanceCase.propertyId === viewQuery.propertyId) &&
      (viewQuery.unitId === "all" || maintenanceCase.unitId === viewQuery.unitId) &&
      (viewQuery.status === "all" || maintenanceCase.status === viewQuery.status) &&
      (viewQuery.priority === "all" ||
        maintenanceCase.priority === viewQuery.priority) &&
      (viewQuery.review !== "upcoming" || isUpcomingCase(maintenanceCase, today))
    );
  });
}

function buildCategoryStats(cases: MaintenanceCase[]): MaintenanceCategoryStat[] {
  const counts = new Map<string, number>();

  for (const maintenanceCase of cases) {
    counts.set(maintenanceCase.category, (counts.get(maintenanceCase.category) ?? 0) + 1);
  }

  const total = cases.length || 1;

  return Array.from(counts.entries())
    .map(([category, caseCount]) => ({
      caseCount,
      category,
      percentLabel: `${Math.round((caseCount / total) * 100)}%`,
    }))
    .toSorted(
      (first, second) =>
        second.caseCount - first.caseCount ||
        first.category.localeCompare(second.category),
    )
    .slice(0, 6);
}

function buildPropertyStats(cases: MaintenanceCase[]): MaintenancePropertyStat[] {
  const grouped = new Map<string, MaintenancePropertyStat>();

  for (const maintenanceCase of cases) {
    const stat =
      grouped.get(maintenanceCase.propertyId) ??
      {
        completed: 0,
        inProgress: 0,
        open: 0,
        overdue: 0,
        pending: 0,
        propertyId: maintenanceCase.propertyId,
        propertyLabel: maintenanceCase.propertyLabel,
      };

    if (maintenanceCase.isOpen) {
      stat.open += 1;
    }

    if (maintenanceCase.status === "completed") {
      stat.completed += 1;
    }

    if (maintenanceCase.status === "in_progress") {
      stat.inProgress += 1;
    }

    if (maintenanceCase.status === "pending") {
      stat.pending += 1;
    }

    if (maintenanceCase.isOverdue) {
      stat.overdue += 1;
    }

    grouped.set(maintenanceCase.propertyId, stat);
  }

  return Array.from(grouped.values())
    .toSorted(
      (first, second) =>
        second.open - first.open ||
        second.overdue - first.overdue ||
        first.propertyLabel.localeCompare(second.propertyLabel),
    )
    .slice(0, 8);
}

function buildUnitStats(cases: MaintenanceCase[]): MaintenanceUnitStat[] {
  const grouped = new Map<string, MaintenanceUnitStat>();

  for (const maintenanceCase of cases) {
    if (!maintenanceCase.unitId) {
      continue;
    }

    const stat =
      grouped.get(maintenanceCase.unitId) ??
      {
        completed: 0,
        inProgress: 0,
        open: 0,
        overdue: 0,
        pending: 0,
        propertyId: maintenanceCase.propertyId,
        unitId: maintenanceCase.unitId,
        unitLabel: maintenanceCase.unitLabel,
      };

    if (maintenanceCase.isOpen) {
      stat.open += 1;
    }

    if (maintenanceCase.status === "completed") {
      stat.completed += 1;
    }

    if (maintenanceCase.status === "in_progress") {
      stat.inProgress += 1;
    }

    if (maintenanceCase.status === "pending") {
      stat.pending += 1;
    }

    if (maintenanceCase.isOverdue) {
      stat.overdue += 1;
    }

    grouped.set(maintenanceCase.unitId, stat);
  }

  return Array.from(grouped.values())
    .toSorted(
      (first, second) =>
        second.open - first.open ||
        second.overdue - first.overdue ||
        first.unitLabel.localeCompare(second.unitLabel),
    )
    .slice(0, 8);
}

function buildRepeatedIssues(cases: MaintenanceCase[]): MaintenanceRepeatedIssue[] {
  const grouped = new Map<string, MaintenanceCase[]>();

  for (const maintenanceCase of cases) {
    const propertyKey = [
      "property",
      maintenanceCase.propertyId,
      maintenanceCase.category.toLowerCase(),
    ].join(":");
    const unitKey = [
      "unit",
      maintenanceCase.propertyId,
      maintenanceCase.unitId ?? "property",
      maintenanceCase.category.toLowerCase(),
    ].join(":");

    for (const key of [propertyKey, unitKey]) {
      const group = grouped.get(key) ?? [];
      group.push(maintenanceCase);
      grouped.set(key, group);
    }
  }

  return Array.from(grouped.values())
    .filter((group) => group.length >= 2)
    .map((group) => {
      const first = group[0];
      const unitIds = new Set(group.map((maintenanceCase) => maintenanceCase.unitId ?? "property"));
      const isPropertyWide = unitIds.size > 1;

      return {
        caseCount: group.length,
        category: first.category,
        href: buildHref("/maintenance", {
          propertyId: first.propertyId,
          query: first.category,
          unitId: isPropertyWide ? undefined : first.unitId,
        }),
        propertyLabel: first.propertyLabel,
        scopeLabel: isPropertyWide ? "Property-wide" : "Unit repeat",
        unitLabel: isPropertyWide ? "Across units" : first.unitLabel,
      };
    })
    .toSorted(
      (first, second) =>
        second.caseCount - first.caseCount ||
        first.scopeLabel.localeCompare(second.scopeLabel) ||
        first.propertyLabel.localeCompare(second.propertyLabel),
    )
    .slice(0, 6);
}

function isUpcomingCase(maintenanceCase: MaintenanceCase, today: string) {
  return (
    maintenanceCase.isOpen &&
    Boolean(maintenanceCase.dueDate) &&
    maintenanceCase.dueDate! >= today &&
    diffDays(today, maintenanceCase.dueDate!) <= MAINTENANCE_UPCOMING_WINDOW_DAYS
  );
}

function getMaintenanceMonthDate(maintenanceCase: MaintenanceCase) {
  return maintenanceCase.dueDate ?? maintenanceCase.createdAt.slice(0, 10);
}

function getEstimateCostAmount(maintenanceCase: MaintenanceCase) {
  return maintenanceCase.costEstimateAmount;
}

function getActualCostAmount(maintenanceCase: MaintenanceCase) {
  return maintenanceCase.actualCostAmount;
}

function getRawCaseCost(task: MaintenanceTaskRow) {
  return Math.max(
    Number(task.actual_cost_amount ?? 0),
    Number(task.cost_estimate_amount ?? 0),
  );
}

function isReminderDue(task: MaintenanceTaskRow, today: string, currentTime: string) {
  const status = normalizeMaintenanceStatus(task.status);

  if (!isOpenMaintenanceStatus(status) || !task.reminder_date) {
    return false;
  }

  if (task.reminder_date < today) {
    return true;
  }

  if (task.reminder_date > today) {
    return false;
  }

  return !task.reminder_time || normalizeTime(task.reminder_time)! <= currentTime;
}

function normalizeMaintenanceStatus(status: string): MaintenanceStatus {
  const normalized = normalizeValue(status);

  if (
    normalized === "scheduled" ||
    normalized === "in_progress" ||
    normalized === "blocked" ||
    normalized === "completed" ||
    normalized === "cancelled"
  ) {
    return normalized;
  }

  return "pending";
}

function normalizeMaintenancePriority(priority: string): MaintenancePriority {
  const normalized = normalizeValue(priority);

  if (normalized === "low" || normalized === "high" || normalized === "urgent") {
    return normalized;
  }

  return "normal";
}

function normalizeRecurrence(value: string): MaintenanceRecurrenceFrequency {
  const normalized = normalizeValue(value);

  if (
    normalized === "weekly" ||
    normalized === "monthly" ||
    normalized === "quarterly" ||
    normalized === "semi_annual" ||
    normalized === "annual"
  ) {
    return normalized;
  }

  return "none";
}

function getPriorityTone(priority: MaintenancePriority): MaintenanceBadgeTone {
  if (priority === "urgent") {
    return "danger";
  }

  if (priority === "high") {
    return "warning";
  }

  if (priority === "low") {
    return "neutral";
  }

  return "accent";
}

function getStatusTone(status: MaintenanceStatus): MaintenanceBadgeTone {
  if (status === "completed") {
    return "success";
  }

  if (status === "blocked" || status === "cancelled") {
    return "warning";
  }

  if (status === "in_progress") {
    return "accent";
  }

  return "neutral";
}

function getProgressTone(state: MaintenanceProgressState): MaintenanceBadgeTone {
  if (state === "overdue") {
    return "danger";
  }

  if (state === "due_today" || state === "upcoming") {
    return "warning";
  }

  if (state === "completed") {
    return "success";
  }

  if (state === "cancelled") {
    return "neutral";
  }

  return "accent";
}

function formatProgressState(state: MaintenanceProgressState) {
  if (state === "due_today") {
    return "Due today";
  }

  return formatStoredLabel(state);
}

function formatRecurrence(value: MaintenanceRecurrenceFrequency) {
  if (value === "none") {
    return "One-time";
  }

  if (value === "semi_annual") {
    return "Semi-annual";
  }

  return formatStoredLabel(value);
}

function formatDateTimeLabel(date: string | null, time: string | null, fallback: string) {
  if (!date) {
    return fallback;
  }

  return `${formatDate(date)}${time ? ` at ${normalizeTime(time)}` : ""}`;
}

function normalizeTime(value: string | null) {
  return value ? value.slice(0, 5) : undefined;
}

function formatStoredLabel(value: string) {
  return normalizeValue(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function diffDays(start: string, end: string) {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);

  return Math.round((endMs - startMs) / 86_400_000);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toIsoTime(date: Date) {
  return date.toISOString().slice(11, 16);
}

function toPropertyOptions(properties: PropertyRow[]): MaintenancePropertyOption[] {
  return properties.map((property) => ({
    id: property.id,
    label: `${property.code} - ${property.name}`,
  }));
}

function toBranchOptions(branches: BranchRow[]): MaintenanceBranchOption[] {
  return branches.map((branch) => ({
    id: branch.id,
    label: `${branch.code} - ${branch.name}`,
  }));
}

function toUnitOptions(
  units: UnitRow[],
  propertiesById: Map<string, PropertyRow>,
): MaintenanceUnitOption[] {
  return units.map((unit) => {
    const property = propertiesById.get(unit.property_id);

    return {
      id: unit.id,
      label: `${property?.code ?? "Unknown"} / Unit ${unit.unit_number}`,
      propertyId: unit.property_id,
    };
  });
}

function groupDocumentsByTaskId(rows: DocumentRow[]) {
  const grouped = new Map<string, DocumentRow[]>();

  for (const row of rows) {
    if (!row.task_id) {
      continue;
    }

    const group = grouped.get(row.task_id) ?? [];
    group.push(row);
    grouped.set(row.task_id, group);
  }

  return grouped;
}

function groupActivityByTaskId(rows: ActivityRow[]) {
  const grouped = new Map<string, ReturnType<typeof toRecentChange>[]>();

  for (const row of rows) {
    const group = grouped.get(row.entity_id) ?? [];
    group.push(toRecentChange(row));
    grouped.set(row.entity_id, group);
  }

  return grouped;
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function buildHref(pathname: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}
