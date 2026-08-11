import type { CutoverPanelDetail } from "@/features/imports/components/cutover-panel";
import { createSupabaseServerClient } from "@/lib/db/server";

type LatestBatchRow = { id: string };
type LatestBatchQuery = {
  eq: (column: string, value: string) => LatestBatchQuery;
  limit: (count: number) => LatestBatchQuery;
  maybeSingle: () => Promise<{
    data: LatestBatchRow | null;
    error: { message: string } | null;
  }>;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => LatestBatchQuery;
  select: (columns: string) => LatestBatchQuery;
};
type CutoverReadClient = {
  from: (table: string) => LatestBatchQuery;
  rpc: (
    name: string,
    args: Record<string, string>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function getLatestIpsCutoverDetail(
  organizationId: string,
): Promise<CutoverPanelDetail | null> {
  const supabase = (await createSupabaseServerClient()) as unknown as CutoverReadClient;
  const latest = await supabase
    .from("ips_cutover_batches")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) {
    throw new Error(`Could not load IPS cutover batch: ${latest.error.message}`);
  }
  if (!latest.data) return null;
  const detail = await supabase.rpc("get_ips_cutover_batch", {
    p_batch_id: latest.data.id,
    p_organization_id: organizationId,
  });
  if (detail.error) {
    throw new Error(`Could not load IPS cutover reconciliation: ${detail.error.message}`);
  }
  return mapCutoverDetail(detail.data);
}

function mapCutoverDetail(value: unknown): CutoverPanelDetail {
  if (!isRecord(value) || !isRecord(value.manifest)) {
    throw new Error("Could not read IPS cutover reconciliation authority.");
  }
  const manifest = value.manifest;
  const importRuns = arrayOfRecords(manifest.importRuns);
  const tenantBalances = arrayOfRecords(manifest.tenantOpeningBalances);
  const ownerOpenings = arrayOfRecords(manifest.ownerOpeningComponents);
  const signedExceptions = arrayOfRecords(manifest.signedExceptions);
  const items = arrayOfRecords(value.items);
  const reconciliation = isRecord(value.reconciliation) ? value.reconciliation : null;
  const actualCounts = reconciliation && isRecord(reconciliation.actual_counts)
    ? reconciliation.actual_counts
    : {};
  const reconciliationDifferences = [
    ...arrayOfRecords(value.reconciliation_differences),
    ...arrayOfRecords(reconciliation?.differences),
  ].map(readableDifference);
  return {
    authorityStartDate: requiredString(value.authority_start_date),
    batchId: requiredString(value.batch_id),
    blockers: items
      .filter((item) => item.status === "blocked")
      .map((item) => readableBlocker(requiredString(item.issue_code))),
    dataOwner: requiredString(value.data_owner),
    importCounts: importRuns.map((run) => {
      const sourceKey = requiredString(run.sourceKey);
      return {
        actual: countString(actualCounts[sourceKey]),
        expected: requiredCount(run.expectedCommittedRows),
        label: requiredString(run.importType),
      };
    }),
    manifestSha256: requiredString(value.manifest_sha256),
    ownerOpeningTotal: sumMoney(
      ownerOpenings.map((opening) => requiredMoney(opening.amount)),
    ),
    reconciliationDifferences,
    reconciliationSha256: reconciliation
      ? requiredString(reconciliation.sha256)
      : null,
    selectedRentMonths: tenantBalances
      .flatMap((balance) =>
        Array.isArray(balance.selectedRentMonths)
          ? balance.selectedRentMonths.map(requiredString)
          : [],
      )
      .sort(),
    signedExceptions: signedExceptions.map((exception) =>
      `${requiredString(exception.sourceKey)}: ${requiredString(exception.reason)} (${requiredString(exception.approvedBy)})`,
    ),
    status: cutoverStatus(value.status),
    tenantOpeningTotal: sumMoney(
      tenantBalances.map((balance) => requiredMoney(balance.expectedBalance)),
    ),
  };
}

function requiredCount(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) return value;
  throw new Error("Cutover entity count is not canonical.");
}

function countString(value: unknown) {
  return value === undefined ? null : requiredCount(value);
}

function readableDifference(value: Record<string, unknown>) {
  const sourceKey = requiredString(value.source_key);
  const expected = value.expected === undefined ? "unknown" : String(value.expected);
  const actual = value.actual === undefined ? "unknown" : String(value.actual);
  return `${sourceKey}: expected ${expected}, actual ${actual}`;
}

function sumMoney(values: string[]) {
  const hundred = BigInt(100);
  const cents = values.reduce((total, value) => {
    const [whole, fractional] = value.split(".");
    return total + BigInt(whole) * hundred + BigInt(fractional);
  }, BigInt(0));
  return `${cents / hundred}.${String(cents % hundred).padStart(2, "0")}`;
}

function requiredMoney(value: unknown) {
  const text = requiredString(value);
  if (!/^(0|[1-9][0-9]{0,11})\.[0-9]{2}$/.test(text)) {
    throw new Error("Cutover money is not canonical.");
  }
  return text;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Cutover authority field is missing.");
  }
  return value;
}

function cutoverStatus(value: unknown): CutoverPanelDetail["status"] {
  if (value === "staged" || value === "blocked" || value === "reconciled" || value === "abandoned") {
    return value;
  }
  throw new Error("Cutover status is not supported.");
}

function readableBlocker(value: string) {
  return value.replaceAll("_", " ");
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
