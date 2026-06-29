"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { UnitImportCommitRow } from "@/features/imports/import.types";
import { mergeUnitImportUpdate } from "@/features/imports/unit-import";
import type { Json } from "@/types/database";

export type UnitImportActionState = {
  message?: string;
  status?: "error" | "success";
  summary?: {
    created: number;
    updated: number;
  };
};

type ExistingImportUnit = {
  current_rent_amount: number | null;
  current_rent_currency: "USD" | null;
  floor: string | null;
  id: string;
  property_id: string;
  size_sqm: number | null;
  status: UnitImportCommitRow["status"];
  unit_number: string;
};

const unitStatusSchema = z.enum([
  "vacant",
  "occupied",
  "reserved",
  "maintenance",
  "inactive",
]);

const importRowSchema = z.object({
  currentRentAmount: z.number().nonnegative().nullable(),
  floor: z.string().trim().max(40),
  mappedFields: z.object({
    currentRentAmount: z.boolean(),
    floor: z.boolean(),
    sizeSqm: z.boolean(),
    status: z.boolean(),
  }),
  propertyId: z.uuid(),
  sizeSqm: z.number().nonnegative().nullable(),
  sourceRowNumber: z.number().int().positive(),
  status: unitStatusSchema,
  unitNumber: z.string().trim().min(1).max(40),
});

const importRowsSchema = z.array(importRowSchema).min(1).max(500);

export async function commitUnitImportAction(
  _state: UnitImportActionState,
  formData: FormData,
): Promise<UnitImportActionState> {
  const rowsPayload = formData.get("rows");

  if (typeof rowsPayload !== "string") {
    return {
      message: "No import rows were submitted.",
      status: "error",
    };
  }

  let rawRows: unknown;

  try {
    rawRows = JSON.parse(rowsPayload);
  } catch {
    return {
      message: "The import payload could not be read.",
      status: "error",
    };
  }

  const parsed = importRowsSchema.safeParse(rawRows);

  if (!parsed.success) {
    return {
      message: "Review the import rows before committing them.",
      status: "error",
    };
  }

  const duplicateMessage = findDuplicateRowMessage(parsed.data);

  if (duplicateMessage) {
    return {
      message: duplicateMessage,
      status: "error",
    };
  }

  const context = await requireAdminContext();
  const supabase = await createSupabaseServerClient();
  const propertyIds = [...new Set(parsed.data.map((row) => row.propertyId))];
  const propertiesResult = await supabase
    .from("properties")
    .select("id")
    .eq("organization_id", context.organizationId)
    .in("id", propertyIds)
    .is("archived_at", null);

  if (propertiesResult.error) {
    return {
      message: `Could not verify properties: ${propertiesResult.error.message}`,
      status: "error",
    };
  }

  const propertyIdSet = new Set((propertiesResult.data ?? []).map((row) => row.id));

  if (propertyIdSet.size !== propertyIds.length) {
    return {
      message: "One or more properties no longer exist or are archived.",
      status: "error",
    };
  }

  const existingUnitsResult = await supabase
    .from("units")
    .select(
      "id, property_id, unit_number, floor, size_sqm, status, current_rent_amount, current_rent_currency",
    )
    .eq("organization_id", context.organizationId)
    .in("property_id", propertyIds)
    .is("archived_at", null);

  if (existingUnitsResult.error) {
    return {
      message: `Could not verify existing units: ${existingUnitsResult.error.message}`,
      status: "error",
    };
  }

  const existingUnits = new Map(
    (existingUnitsResult.data ?? []).map((unit) => {
      const existingUnit = normalizeExistingImportUnit(unit);

      return [
        getUnitKey(existingUnit.property_id, existingUnit.unit_number),
        existingUnit,
      ];
    }),
  );
  const affectedPropertyIds = new Set<string>();
  const affectedUnitIds = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const row of parsed.data) {
    const existingUnit = existingUnits.get(
      getUnitKey(row.propertyId, row.unitNumber),
    );
    const mutation = existingUnit
      ? await updateImportedUnit({
          existingUnit,
          organizationId: context.organizationId,
          row,
          supabase,
        })
      : await createImportedUnit({
          organizationId: context.organizationId,
          row,
          supabase,
        });

    if (mutation.error) {
      return {
        message: `Row ${row.sourceRowNumber}: ${unitImportErrorMessage(
          mutation.error.message,
        )}`,
        status: "error",
        summary: { created, updated },
      };
    }

    affectedPropertyIds.add(row.propertyId);

    if (existingUnit) {
      affectedUnitIds.add(existingUnit.id);
      updated += 1;
    } else if (typeof mutation.data === "string") {
      existingUnits.set(getUnitKey(row.propertyId, row.unitNumber), {
        current_rent_amount: row.currentRentAmount,
        current_rent_currency: row.currentRentAmount === null ? null : "USD",
        floor: nullableString(row.floor),
        id: mutation.data,
        property_id: row.propertyId,
        size_sqm: row.sizeSqm,
        status: row.status,
        unit_number: row.unitNumber,
      });
      affectedUnitIds.add(mutation.data);
      created += 1;
    }
  }

  await logUnitImportActivity({
    actorId: context.userId,
    created,
    organizationId: context.organizationId,
    rows: parsed.data,
    supabase,
    updated,
  });
  revalidateImportPaths(affectedPropertyIds, affectedUnitIds);

  return {
    message: `Imported ${created + updated} unit row${
      created + updated === 1 ? "" : "s"
    }.`,
    status: "success",
    summary: { created, updated },
  };
}

function createImportedUnit({
  organizationId,
  row,
  supabase,
}: {
  organizationId: string;
  row: UnitImportCommitRow;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}) {
  return supabase.rpc("create_unit", {
    p_current_rent_amount: row.currentRentAmount,
    p_current_rent_currency: row.currentRentAmount === null ? null : "USD",
    p_floor: nullableString(row.floor),
    p_organization_id: organizationId,
    p_property_id: row.propertyId,
    p_size_sqm: row.sizeSqm,
    p_status: row.status,
    p_unit_number: row.unitNumber,
  });
}

function updateImportedUnit({
  existingUnit,
  organizationId,
  row,
  supabase,
}: {
  existingUnit: ExistingImportUnit;
  organizationId: string;
  row: UnitImportCommitRow;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}) {
  const values = mergeUnitImportUpdate(row, {
    currentRentAmount: existingUnit.current_rent_amount,
    currentRentCurrency: existingUnit.current_rent_currency,
    floor: existingUnit.floor,
    sizeSqm: existingUnit.size_sqm,
    status: existingUnit.status,
  });

  return supabase.rpc("update_unit", {
    p_current_rent_amount: values.currentRentAmount,
    p_current_rent_currency: values.currentRentCurrency,
    p_floor: nullableString(values.floor),
    p_organization_id: organizationId,
    p_property_id: row.propertyId,
    p_size_sqm: values.sizeSqm,
    p_status: values.status,
    p_unit_id: existingUnit.id,
    p_unit_number: row.unitNumber,
  });
}

async function logUnitImportActivity({
  actorId,
  created,
  organizationId,
  rows,
  supabase,
  updated,
}: {
  actorId: string;
  created: number;
  organizationId: string;
  rows: UnitImportCommitRow[];
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  updated: number;
}) {
  const { error } = await supabase.from("activity_logs").insert({
    action: "unit_import_committed",
    actor_id: actorId,
    entity_id: crypto.randomUUID(),
    entity_type: "import",
    new_values: {
      created_count: created,
      import_type: "unit",
      row_count: rows.length,
      source_row_numbers: rows.map((row) => row.sourceRowNumber),
      updated_count: updated,
    } satisfies Json,
    organization_id: organizationId,
    previous_values: null,
  });

  if (error) {
    console.warn(`Could not log unit import activity: ${error.message}`);
  }
}

function normalizeExistingImportUnit(unit: {
  current_rent_amount: number | null;
  current_rent_currency: string | null;
  floor: string | null;
  id: string;
  property_id: string;
  size_sqm: number | null;
  status: string;
  unit_number: string;
}): ExistingImportUnit {
  return {
    current_rent_amount: unit.current_rent_amount,
    current_rent_currency: unit.current_rent_currency === "USD" ? "USD" : null,
    floor: unit.floor,
    id: unit.id,
    property_id: unit.property_id,
    size_sqm: unit.size_sqm,
    status: unitStatusSchema.parse(unit.status),
    unit_number: unit.unit_number,
  };
}

function findDuplicateRowMessage(rows: UnitImportCommitRow[]) {
  const seen = new Map<string, number>();

  for (const row of rows) {
    const key = getUnitKey(row.propertyId, row.unitNumber);
    const previousRowNumber = seen.get(key);

    if (previousRowNumber) {
      return `Rows ${previousRowNumber} and ${row.sourceRowNumber} contain the same property and unit number.`;
    }

    seen.set(key, row.sourceRowNumber);
  }

  return null;
}

function nullableString(value: string) {
  return value.trim().length > 0 ? value.trim() : null;
}

function getUnitKey(propertyId: string, unitNumber: string) {
  return `${propertyId}:${unitNumber.trim().toLowerCase()}`;
}

function revalidateImportPaths(
  propertyIds: Set<string>,
  unitIds: Set<string>,
) {
  revalidatePath("/import");
  revalidatePath("/overview");
  revalidatePath("/reports");
  revalidatePath("/units");
  revalidatePath("/properties");
  revalidatePath("/timeline");
  revalidatePath("/ledger");

  for (const propertyId of propertyIds) {
    revalidatePath(`/properties/${propertyId}`);
  }

  for (const unitId of unitIds) {
    revalidatePath(`/units/${unitId}`);
  }
}

function unitImportErrorMessage(message: string) {
  if (message.includes("duplicate key")) {
    return "A unit with this number already exists for that property.";
  }

  if (message.includes("Property not found")) {
    return "Choose an active property for every row.";
  }

  if (message.includes("Unit not found")) {
    return "The existing unit could not be found.";
  }

  if (message.includes("Unit property cannot be changed")) {
    return "An existing unit cannot be moved to another property through import.";
  }

  return "The unit row could not be saved.";
}

