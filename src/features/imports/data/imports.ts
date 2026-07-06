import type {
  ImportReferenceData,
  ImportRunSummary,
  ImportSavedMapping,
  ImportType,
} from "@/features/imports/import.types";
import { createSupabaseServerClient } from "@/lib/db/server";

const importTypes: ImportType[] = ["properties", "units", "people", "leases"];

export async function getRecentImportRuns(
  organizationId: string,
): Promise<ImportRunSummary[]> {
  const supabase = await createSupabaseServerClient();
  const importDb = supabase as unknown as ImportRunsClient;
  const { data, error } = await importDb
    .from("import_runs")
    .select(
      "id, import_type, status, source_file_name, total_rows, ready_rows, warning_rows, error_rows, created_count, updated_count, failed_count, skipped_count, committed_at, created_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    throw new Error(`Could not load import runs: ${error.message}`);
  }

  return (data ?? []).map((run) => ({
    blockedRows: run.error_rows,
    committedAt: run.committed_at,
    createdAt: run.created_at,
    createdCount: run.created_count,
    failedCount: run.failed_count,
    fileName: run.source_file_name,
    id: run.id,
    importType: toImportType(run.import_type),
    readyRows: run.ready_rows,
    skippedCount: run.skipped_count,
    status: toImportRunStatus(run.status),
    totalRows: run.total_rows,
    updatedCount: run.updated_count,
    warningRows: run.warning_rows,
  }));
}

export async function getImportReferenceData(
  organizationId: string,
): Promise<ImportReferenceData> {
  const supabase = await createSupabaseServerClient();
  const importDb = supabase as unknown as ImportReferenceClient;
  const [propertiesResult, unitsResult, peopleResult, rolesResult] =
    await Promise.all([
      importDb
        .from("properties")
        .select("id, code, name")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("code", { ascending: true }),
      importDb
        .from("units")
        .select("id, property_id, unit_number")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("unit_number", { ascending: true }),
      importDb
        .from("people")
        .select("id, display_name, primary_email")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("display_name", { ascending: true }),
      importDb
        .from("person_roles")
        .select("person_id, role")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .is("archived_at", null),
    ]);

  if (propertiesResult.error) {
    throw new Error(
      `Could not load import properties: ${propertiesResult.error.message}`,
    );
  }

  if (unitsResult.error) {
    throw new Error(`Could not load import units: ${unitsResult.error.message}`);
  }

  if (peopleResult.error) {
    throw new Error(
      `Could not load import people: ${peopleResult.error.message}`,
    );
  }

  if (rolesResult.error) {
    throw new Error(`Could not load import roles: ${rolesResult.error.message}`);
  }

  const propertyRows = (propertiesResult.data ?? []) as PropertyReferenceRow[];
  const unitRows = (unitsResult.data ?? []) as UnitReferenceRow[];
  const peopleRows = (peopleResult.data ?? []) as PersonReferenceRow[];
  const roleRows = (rolesResult.data ?? []) as RoleReferenceRow[];
  const properties = propertyRows.map((property) => ({
    code: property.code,
    id: property.id,
    label: `${property.code} - ${property.name}`,
    name: property.name,
  }));
  const propertyById = new Map(
    properties.map((property) => [property.id, property]),
  );
  const rolesByPersonId = new Map<string, string[]>();

  for (const role of roleRows) {
    const roles = rolesByPersonId.get(role.person_id) ?? [];
    roles.push(role.role);
    rolesByPersonId.set(role.person_id, roles);
  }

  return {
    people: peopleRows.map((person) => ({
      displayName: person.display_name,
      id: person.id,
      label: person.primary_email
        ? `${person.display_name} (${person.primary_email})`
        : person.display_name,
      primaryEmail: person.primary_email,
      roles: rolesByPersonId.get(person.id) ?? [],
    })),
    properties,
    units: unitRows.map((unit) => {
      const property = propertyById.get(unit.property_id);

      return {
        id: unit.id,
        label: property
          ? `${property.code} - ${unit.unit_number}`
          : unit.unit_number,
        propertyCode: property?.code ?? "",
        propertyId: unit.property_id,
        unitNumber: unit.unit_number,
      };
    }),
  };
}

export async function getImportSavedMappings(
  organizationId: string,
): Promise<ImportSavedMapping[]> {
  const supabase = await createSupabaseServerClient();
  const importDb = supabase as unknown as ImportMappingsClient;
  const { data, error } = await importDb
    .from("import_mappings")
    .select("id, import_type, name, mapping, updated_at")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load import mappings: ${error.message}`);
  }

  return (data ?? []).map((mapping) => ({
    id: mapping.id,
    importType: toImportType(mapping.import_type),
    mapping: isRecord(mapping.mapping)
      ? Object.fromEntries(
          Object.entries(mapping.mapping).flatMap(([key, value]) =>
            typeof value === "string" ? [[key, value]] : [],
          ),
        )
      : {},
    name: mapping.name,
    updatedAt: mapping.updated_at,
  }));
}

type ImportRunRow = {
  committed_at: string | null;
  created_at: string;
  created_count: number;
  error_rows: number;
  failed_count: number;
  id: string;
  import_type: string;
  ready_rows: number;
  skipped_count: number;
  source_file_name: string;
  status: string;
  total_rows: number;
  updated_count: number;
  warning_rows: number;
};

type ImportRunsClient = {
  from: (table: "import_runs") => {
    select: (columns: string) => {
      eq: (column: "organization_id", value: string) => {
        order: (
          column: "created_at",
          options: { ascending: boolean },
        ) => {
          limit: (count: number) => Promise<{
            data: ImportRunRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

type PropertyReferenceRow = {
  code: string;
  id: string;
  name: string;
};

type UnitReferenceRow = {
  id: string;
  property_id: string;
  unit_number: string;
};

type PersonReferenceRow = {
  display_name: string;
  id: string;
  primary_email: string | null;
};

type RoleReferenceRow = {
  person_id: string;
  role: string;
};

type ImportReferenceClient = {
  from: (table: "people" | "person_roles" | "properties" | "units") => {
    select: (columns: string) => {
      eq: (
        column: "organization_id" | "status",
        value: string,
      ) => ImportReferenceQuery;
    };
  };
};

type ImportReferenceQuery = Promise<{
  data:
    | Array<{
        code: string;
        id: string;
        name: string;
      }>
    | Array<{
        id: string;
        property_id: string;
        unit_number: string;
      }>
    | Array<{
        display_name: string;
        id: string;
        primary_email: string | null;
      }>
    | Array<{
        person_id: string;
        role: string;
      }>
    | null;
  error: { message: string } | null;
}> & {
  eq: (column: "organization_id" | "status", value: string) => ImportReferenceQuery;
  is: (
    column: "archived_at",
    value: null,
  ) => ImportReferenceQuery & {
    order: (
      column: "code" | "display_name" | "unit_number",
      options: { ascending: boolean },
    ) => Promise<{
      data:
        | Array<{
            code: string;
            id: string;
            name: string;
          }>
        | Array<{
            id: string;
            property_id: string;
            unit_number: string;
          }>
        | Array<{
            display_name: string;
            id: string;
            primary_email: string | null;
          }>
        | null;
      error: { message: string } | null;
    }>;
  };
};

type ImportMappingsClient = {
  from: (table: "import_mappings") => {
    select: (columns: string) => {
      eq: (column: "organization_id", value: string) => {
        order: (
          column: "updated_at",
          options: { ascending: boolean },
        ) => Promise<{
          data: ImportMappingRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

type ImportMappingRow = {
  id: string;
  import_type: string;
  mapping: unknown;
  name: string;
  updated_at: string;
};

function toImportType(value: string): ImportType {
  return importTypes.includes(value as ImportType)
    ? (value as ImportType)
    : "units";
}

function toImportRunStatus(status: string): ImportRunSummary["status"] {
  if (
    status === "staged" ||
    status === "committing" ||
    status === "committed" ||
    status === "committed_with_errors" ||
    status === "failed"
  ) {
    return status;
  }

  return "failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
