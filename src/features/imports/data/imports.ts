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
  const { data, error } = await supabase
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
  const [
    propertiesResult,
    unitsResult,
    peopleResult,
    rolesResult,
    occupanciesResult,
  ] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, code, name")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("code", { ascending: true }),
      supabase
        .from("units")
        .select("id, property_id, unit_number")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("unit_number", { ascending: true }),
      supabase
        .from("people")
        .select("id, display_name, primary_email")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("display_name", { ascending: true }),
      supabase
        .from("person_roles")
        .select("person_id, role")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .is("archived_at", null),
      supabase
        .from("lease_occupancies")
        .select(
          "lease_id, unit_id, status, scheduled_move_in_date, actual_move_in_date, scheduled_move_out_date",
        )
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .is("actual_move_out_date", null)
        .not("unit_id", "is", null)
        .in("status", ["reserved", "occupied", "notice_given"]),
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

  if (occupanciesResult.error) {
    throw new Error(
      `Could not load import lease occupancy: ${occupanciesResult.error.message}`,
    );
  }

  const propertyRows = (propertiesResult.data ?? []) as PropertyReferenceRow[];
  const unitRows = (unitsResult.data ?? []) as UnitReferenceRow[];
  const peopleRows = (peopleResult.data ?? []) as PersonReferenceRow[];
  const roleRows = (rolesResult.data ?? []) as RoleReferenceRow[];
  const occupancyRows = (occupanciesResult.data ??
    []) as LeaseOccupancyReferenceRow[];
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
    leaseOccupancies: occupancyRows.flatMap((occupancy) => {
      const status = toLeaseOccupancyStatus(occupancy.status);

      if (!occupancy.unit_id || !status) {
        return [];
      }

      return [
        {
          endDate: occupancy.scheduled_move_out_date,
          leaseId: occupancy.lease_id,
          startDate:
            occupancy.actual_move_in_date ?? occupancy.scheduled_move_in_date,
          status,
          unitId: occupancy.unit_id,
        },
      ];
    }),
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
  const { data, error } = await supabase
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

type LeaseOccupancyReferenceRow = {
  actual_move_in_date: string | null;
  lease_id: string;
  scheduled_move_in_date: string | null;
  scheduled_move_out_date: string | null;
  status: string;
  unit_id: string | null;
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

function toLeaseOccupancyStatus(value: string) {
  if (
    value === "notice_given" ||
    value === "occupied" ||
    value === "reserved"
  ) {
    return value;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
