import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/types/database";

const organizationId = "00000000-0000-0000-0000-000000000001";
const financeMemberId = "00000000-0000-0000-0000-000000000801";
const vendorId = "80000000-0000-0000-0000-000000000006";
const closePropertyId = "10000000-0000-0000-0000-000000000004";
const closeOwnerId = "80000000-0000-0000-0000-000000000014";
const centralPropertyId = "10000000-0000-0000-0000-000000000001";
const centralOwnerId = "80000000-0000-0000-0000-000000000004";
const centralLegacyUnitId = "20000000-0000-0000-0000-000000000001";
const riversidePropertyId = "10000000-0000-0000-0000-000000000002";
const riversideUnitId = "20000000-0000-0000-0000-000000000005";
const gardenPropertyId = "10000000-0000-0000-0000-000000000003";
const gardenUnitId = "20000000-0000-0000-0000-000000000006";
const gardenTenantUnitId = "20000000-0000-0000-0000-000000000007";

let fixturePhase = "initialize";

async function main() {
  const runtime = localRuntime();
  process.env.NEXT_PUBLIC_SUPABASE_URL = runtime.apiUrl;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = runtime.anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = runtime.serviceRoleKey;
  const { preparePaidCostEvidence } = await import(
    "../src/features/finance-operations/paid-cost-evidence"
  );

  const service = client(runtime.apiUrl, runtime.serviceRoleKey);
  const member = client(runtime.apiUrl, runtime.anonKey);
  const manager = client(runtime.apiUrl, runtime.anonKey);
  const admin = client(runtime.apiUrl, runtime.anonKey);
  await Promise.all([
    signIn(member, "finance.member@nestory.com"),
    signIn(manager, "finance.manager@nestory.com"),
    signIn(admin, "nestory@gmail.com"),
  ]);

  fixturePhase = "verify retained paid-cost namespace";
  await verifyPriorEvidenceNamespace(service);

  const bankSourceId = await requiredSource(admin, "bank");
  fixturePhase = "load task-bound maintenance paid-cost evidence";
  await loadMaintenancePaidCosts({
    admin,
    bankSourceId,
    manager,
    preparePaidCostEvidence,
    service,
  });
  fixturePhase = "create petty-cash funding source";
  const pettyCashSourceId = requiredScalar(
    await rpc(admin, "create_financial_reconciliation_source", {
      p_code: "TRACK6-PETTY",
      p_currency: "USD",
      p_display_name: "Track 6 verified petty cash",
      p_masked_reference: "****006",
      p_organization_id: organizationId,
      p_property_id: null,
      p_scope_kind: "organization_pooled",
      p_source_kind: "petty_cash",
    }),
    "petty-cash source",
  );
  const closeMonth = monthOffset(24);
  const closePaidDate = `${closeMonth.slice(0, 8)}10`;
  const closeDate = (day: number) =>
    `${closeMonth.slice(0, 8)}${String(day).padStart(2, "0")}`;

  fixturePhase = "open isolated close month";
  await rpc(admin, "set_financial_month_lock", {
    p_locked: false,
    p_month_start: closeMonth,
    p_organization_id: organizationId,
    p_reason: "Load verified Track 6 paid-cost lifecycle before official close",
  });

  async function submit(input: {
    category: string;
    cost: string;
    date: string;
    id: string;
    markup?: string;
    propertyId: string;
    reconciliationSourceId: string;
    reference: string;
    responsibility: "owner" | "tenant";
    tenantInvoiceId?: string | null;
    unitId?: string | null;
    vendorLabel?: string;
  }) {
    fixturePhase = `evidence ${input.id}`;
    const file = new File(
      [fixturePdfBytes(input.id, input.reference)],
      `${input.id}.pdf`,
      { type: "application/pdf" },
    );
    const evidence = await preparePaidCostEvidence({
      actorId: financeMemberId,
      file,
      idempotencyKey: `fixture-track6-${input.id}`,
      organizationId,
      propertyId: input.propertyId,
    });
    fixturePhase = `submit ${input.id}`;
    const result = await rpc(member, "submit_expense", {
      p_currency: "USD",
      p_customer_category: input.category,
      p_expense_date: input.date,
      p_idempotency_key: `fixture-track6-submit-${input.id}`,
      p_internal_cost_amount: input.cost,
      p_internal_markup_amount: input.markup ?? "0.00",
      p_organization_id: organizationId,
      p_property_id: input.propertyId,
      p_reconciliation_source_id: input.reconciliationSourceId,
      p_reference: input.reference,
      p_responsibility: input.responsibility,
      p_source_id: null,
      p_source_type: "general",
      p_supporting_document_id: evidence.documentId,
      p_tenant_invoice_id: input.tenantInvoiceId ?? null,
      p_unit_id: input.unitId ?? null,
      p_vendor_label: input.vendorLabel ?? "Khmer Home Services",
      p_vendor_person_id: vendorId,
    });
    return requiredString(result, "submission_id");
  }

  async function review(
    id: string,
    submissionId: string,
    decision: "approve" | "reject",
  ) {
    fixturePhase = `${decision} ${id}`;
    return rpc(manager, "review_expense", {
      p_decision: decision,
      p_idempotency_key: `fixture-track6-review-${id}`,
      p_organization_id: organizationId,
      p_reason:
        decision === "approve"
          ? "Verified retained receipt, paid date, funding source, and responsibility"
          : "Rejected receipt requires a corrected paid-cost submission",
      p_reconciliation_source_id: null,
      p_submission_id: submissionId,
    });
  }

  async function reverse(id: string, submissionId: string, reversalDate: string) {
    fixturePhase = `reverse ${id}`;
    return rpc(admin, "reverse_expense", {
      p_idempotency_key: `fixture-track6-reverse-${id}`,
      p_organization_id: organizationId,
      p_reason: "Append-only correction of the verified paid cost",
      p_reversal_date: reversalDate,
      p_submission_id: submissionId,
    });
  }

  const ownerApproved = await submit({
    category: "repairs_maintenance",
    cost: "120.00",
    date: closeDate(10),
    id: "owner-approved",
    propertyId: closePropertyId,
    reconciliationSourceId: bankSourceId,
    reference: "TRACK6-OWNER-APPROVED",
    responsibility: "owner",
  });
  await review("owner-approved", ownerApproved, "approve");

  const pettyApproved = await submit({
    category: "cleaning",
    cost: "25.00",
    date: closeDate(11),
    id: "petty-approved",
    propertyId: closePropertyId,
    reconciliationSourceId: pettyCashSourceId,
    reference: "TRACK6-PETTY-APPROVED",
    responsibility: "owner",
  });
  await review("petty-approved", pettyApproved, "approve");

  const rejected = await submit({
    category: "utility",
    cost: "45.00",
    date: closeDate(12),
    id: "rejected",
    propertyId: closePropertyId,
    reconciliationSourceId: bankSourceId,
    reference: "TRACK6-REJECTED",
    responsibility: "owner",
  });
  await review("rejected", rejected, "reject");
  const resubmitted = await submit({
    category: "utility",
    cost: "40.00",
    date: closeDate(13),
    id: "rejected-corrected",
    propertyId: closePropertyId,
    reconciliationSourceId: bankSourceId,
    reference: "TRACK6-REJECTED-CORRECTED",
    responsibility: "owner",
  });
  await review("rejected-corrected", resubmitted, "approve");

  const reversed = await submit({
    category: "cleaning",
    cost: "85.00",
    date: closeDate(14),
    id: "approved-reversed",
    markup: "15.00",
    propertyId: closePropertyId,
    reconciliationSourceId: bankSourceId,
    reference: "TRACK6-APPROVED-REVERSED",
    responsibility: "owner",
  });
  await review("approved-reversed", reversed, "approve");
  await reverse("approved-reversed", reversed, closeDate(15));

  const wrong = await submit({
    category: "other",
    cost: "60.00",
    date: closeDate(16),
    id: "wrong-amount",
    propertyId: closePropertyId,
    reconciliationSourceId: bankSourceId,
    reference: "TRACK6-WRONG-60",
    responsibility: "owner",
  });
  await review("wrong-amount", wrong, "approve");
  await reverse("wrong-amount", wrong, closeDate(17));
  const corrected = await submit({
    category: "other",
    cost: "50.00",
    date: closeDate(18),
    id: "corrected-amount",
    propertyId: closePropertyId,
    reconciliationSourceId: bankSourceId,
    reference: "TRACK6-CORRECTED-50",
    responsibility: "owner",
  });
  await review("corrected-amount", corrected, "approve");

  fixturePhase = "restore prior verified general cost fixtures";
  const legacyCentralReversed = await submit({
    category: "cleaning",
    cost: "85.00",
    date: dateOffset(-4),
    id: "legacy-central-reversed",
    markup: "15.00",
    propertyId: centralPropertyId,
    reconciliationSourceId: bankSourceId,
    reference: "KH-CLN-1001",
    responsibility: "owner",
    unitId: centralLegacyUnitId,
  });
  await review("legacy-central-reversed", legacyCentralReversed, "approve");
  await reverse(
    "legacy-central-reversed",
    legacyCentralReversed,
    dateOffset(0),
  );
  await allocateOwnerEvents(admin, monthOffset(0), centralPropertyId);
  await rpc(admin, "generate_owner_balance_period", {
    p_currency: "USD",
    p_idempotency_key: "fixture-track6-central-current-reroll",
    p_month_start: monthOffset(0),
    p_organization_id: organizationId,
    p_owner_person_id: centralOwnerId,
    p_property_id: centralPropertyId,
  });
  await rpc(admin, "generate_owner_balance_period", {
    p_currency: "USD",
    p_idempotency_key: "fixture-track6-central-next-reroll",
    p_month_start: monthOffset(1),
    p_organization_id: organizationId,
    p_owner_person_id: centralOwnerId,
    p_property_id: centralPropertyId,
  });

  const legacyRiversideRejected = await submit({
    category: "utility",
    cost: "45.00",
    date: dateOffset(-3),
    id: "legacy-riverside-rejected",
    propertyId: riversidePropertyId,
    reconciliationSourceId: bankSourceId,
    reference: "RIV-WATER-DUPLICATE",
    responsibility: "owner",
    unitId: riversideUnitId,
  });
  await review("legacy-riverside-rejected", legacyRiversideRejected, "reject");

  fixturePhase = "isolated tenant invoice";
  const tenantMonth = monthOffset(0);
  const lease = await requiredRow(
    admin
      .from("leases")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("property_id", gardenPropertyId)
      .eq("unit_id", gardenTenantUnitId)
      .limit(1)
      .single(),
  );
  const tenantInvoice = await requiredRow(
    admin
      .from("tenant_invoices")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("lease_id", lease.id)
      .eq("billing_period_start", tenantMonth)
      .single(),
  );
  const tenantApproved = await submit({
    category: "utility",
    cost: "30.00",
    date: `${tenantMonth.slice(0, 8)}10`,
    id: "tenant-approved",
    markup: "5.00",
    propertyId: gardenPropertyId,
    reconciliationSourceId: bankSourceId,
    reference: "TRACK6-TENANT-APPROVED",
    responsibility: "tenant",
    tenantInvoiceId: tenantInvoice.id,
    unitId: gardenTenantUnitId,
  });
  await review("tenant-approved", tenantApproved, "approve");

  await submit({
    category: "repairs_maintenance",
    cost: "210.00",
    date: dateOffset(-2),
    id: "pending-review",
    markup: "20.00",
    propertyId: gardenPropertyId,
    reconciliationSourceId: bankSourceId,
    reference: "GDN-PUMP-2088",
    responsibility: "owner",
    unitId: gardenUnitId,
  });

  fixturePhase = "missing evidence denial";
  const missing = await member.rpc("submit_expense", {
    p_currency: "USD",
    p_customer_category: "other",
    p_expense_date: closePaidDate,
    p_idempotency_key: "fixture-track6-submit-missing-evidence",
    p_internal_cost_amount: "10.00",
    p_internal_markup_amount: "0.00",
    p_organization_id: organizationId,
    p_property_id: closePropertyId,
    p_reconciliation_source_id: bankSourceId,
    p_reference: "TRACK6-MISSING-EVIDENCE",
    p_responsibility: "owner",
    p_source_id: null,
    p_source_type: "general",
    p_supporting_document_id: null,
    p_tenant_invoice_id: null,
    p_unit_id: null,
    p_vendor_label: "Missing Evidence Vendor",
    p_vendor_person_id: vendorId,
  });
  if (!missing.error || !/Paid cost evidence document is required/i.test(missing.error.message)) {
    throw missing.error ?? new Error("Missing evidence paid cost unexpectedly persisted");
  }

  fixturePhase = "allocate owner paid-cost sources and reversals";
  await allocateOwnerEvents(admin, closeMonth, closePropertyId);

  fixturePhase = "reroll isolated owner balance";
  await rpc(admin, "generate_owner_balance_period", {
    p_currency: "USD",
    p_idempotency_key: "fixture-track6-owner-period-reroll",
    p_month_start: closeMonth,
    p_organization_id: organizationId,
    p_owner_person_id: closeOwnerId,
    p_property_id: closePropertyId,
  });
  await rpc(admin, "set_financial_month_lock", {
    p_locked: true,
    p_month_start: closeMonth,
    p_organization_id: organizationId,
    p_reason: "Track 6 paid costs reconciled for official Owner Statement",
  });

  process.stdout.write(
    "Track 6 paid-cost fixture loaded: owner, tenant, petty cash, rejection, reversal, correction, pending, and missing evidence.\n",
  );
}

async function loadMaintenancePaidCosts({
  admin,
  bankSourceId,
  manager,
  preparePaidCostEvidence,
  service,
}: {
  admin: SupabaseClient<Database>;
  bankSourceId: string;
  manager: SupabaseClient<Database>;
  preparePaidCostEvidence: typeof import("../src/features/finance-operations/paid-cost-evidence").preparePaidCostEvidence;
  service: SupabaseClient<Database>;
}) {
  const taskResult = await service
    .from("tasks")
    .select("id, property_id, title")
    .eq("organization_id", organizationId)
    .in("title", ["Kitchen sink repair", "Garden Court pump replacement"]);
  if (taskResult.error || taskResult.data.length !== 2) {
    throw taskResult.error ?? new Error("Maintenance paid-cost tasks are missing");
  }
  const tasks = taskResult.data;

  for (const task of tasks) {
    const approved = task.title === "Kitchen sink repair";
    const key = approved ? "fixture-maintenance-cost" : "fixture-maintenance-pending-review";
    const reference = approved ? "KH-INV-1042" : "GDN-PUMP-2088";
    const file = new File(
      [fixturePdfBytes(task.id, reference)],
      `${key}.pdf`,
      { type: "application/pdf" },
    );
    const evidence = await preparePaidCostEvidence({
      actorId: "00000000-0000-0000-0000-000000000101",
      file,
      idempotencyKey: `${key}-evidence`,
      organizationId,
      propertyId: requiredScalar(task.property_id, "maintenance property"),
      taskId: task.id,
    });
    const submitted = await rpc(admin, "submit_maintenance_cost", {
      p_expense_date: dateOffset(approved ? -1 : 0),
      p_idempotency_key: key,
      p_organization_id: organizationId,
      p_reference: reference,
      p_supporting_document_id: evidence.documentId,
      p_task_id: task.id,
    });

    if (approved) {
      await rpc(manager, "review_expense", {
        p_decision: "approve",
        p_idempotency_key: "fixture-maintenance-approval",
        p_organization_id: organizationId,
        p_reconciliation_source_id: bankSourceId,
        p_reason: "Maintenance invoice and work record verified",
        p_submission_id: requiredString(submitted, "submission_id"),
      });
    }
  }
}

function client(url: string, key: string) {
  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function signIn(client: SupabaseClient<Database>, email: string) {
  const result = await client.auth.signInWithPassword({
    email,
    password: "123456789",
  });
  if (result.error) throw result.error;
}

async function rpc(
  client: SupabaseClient<Database>,
  name: keyof Database["public"]["Functions"],
  args: Record<string, unknown>,
) {
  const result = await client.rpc(name, args as never);
  if (result.error) throw result.error;
  return result.data;
}

async function requiredSource(service: SupabaseClient<Database>, kind: string) {
  const result = await service
    .from("financial_reconciliation_sources")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("source_kind", kind)
    .eq("currency", "USD")
    .is("archived_at", null)
    .limit(1)
    .single();
  return (await requiredRow(Promise.resolve(result))).id;
}

async function allocateOwnerEvents(
  admin: SupabaseClient<Database>,
  monthStart: string,
  propertyId: string,
) {
  const periodEnd = new Date(`${monthStart}T00:00:00.000Z`);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  periodEnd.setUTCDate(0);
  const periodEndText = periodEnd.toISOString().slice(0, 10);

  for (let pass = 0; pass < 4; pass += 1) {
    const queue = await admin.rpc("get_owner_event_allocation_queue", {
      p_currency: "USD",
      p_organization_id: organizationId,
      p_period_end: periodEndText,
      p_period_start: monthStart,
      p_property_id: propertyId,
    });
    if (queue.error) throw queue.error;
    const pending = (queue.data ?? [])
      .filter((row) => row.allocation_state === "pending")
      .sort((left, right) =>
        `${left.event_date}|${left.source_type}|${left.source_line_id}`.localeCompare(
          `${right.event_date}|${right.source_type}|${right.source_line_id}`,
        ),
      );
    if (pending.length === 0) {
      const blocked = (queue.data ?? []).filter(
        (row) => row.allocation_state === "blocked",
      );
      if (blocked.length > 0) {
        throw new Error(
          `Track 6 owner allocation remains blocked: ${blocked
            .map((row) => `${row.source_type}:${row.remediation_code}`)
            .join(",")}`,
        );
      }
      return;
    }
    for (const row of pending) {
      await rpc(admin, "allocate_owner_event", {
        p_idempotency_key: `fixture-track6-allocate-${row.source_type}-${row.source_line_id}`,
        p_organization_id: organizationId,
        p_source_line_id: row.source_line_id,
        p_source_type: row.source_type,
      });
    }
  }
  throw new Error("Track 6 owner allocation queue did not settle");
}

async function requiredRow<T extends { id: string }>(
  resultPromise: PromiseLike<{ data: T | null; error: { message: string } | null }>,
) {
  const result = await resultPromise;
  if (result.error || !result.data) {
    throw result.error ?? new Error("Required fixture row is missing");
  }
  return result.data;
}

async function verifyPriorEvidenceNamespace(service: SupabaseClient<Database>) {
  const folder = `${organizationId}/paid-cost-evidence`;
  const bucket = service.storage.from("nestory-documents");
  for (let offset = 0; ; offset += 100) {
    const listed = await bucket.list(folder, { limit: 100, offset });
    if (listed.error) throw listed.error;
    for (const object of listed.data ?? []) {
      if (object.id && !/^[0-9a-f]{64}$/.test(object.name)) {
        throw new Error(`Unexpected paid-cost evidence object: ${folder}/${object.name}`);
      }
    }
    if ((listed.data?.length ?? 0) < 100) break;
  }
}

function requiredString(value: unknown, key: string) {
  if (!value || typeof value !== "object") throw new Error(`Missing ${key}`);
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(`Missing ${key}`);
  }
  return candidate;
}

function requiredScalar(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function monthOffset(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 10);
}

function dateOffset(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset))
    .toISOString()
    .slice(0, 10);
}

function fixturePdfBytes(identity: string, reference: string) {
  const encoder = new TextEncoder();
  const header = `%PDF-1.7\n% Nestory local verified receipt ${identity} ${reference}\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n",
  ];
  const offsets: number[] = [];
  let body = header;
  for (const object of objects) {
    offsets.push(encoder.encode(body).byteLength);
    body += object;
  }
  const xrefOffset = encoder.encode(body).byteLength;
  body += "xref\n0 3\n0000000000 65535 f \n";
  body += `${String(offsets[0]).padStart(10, "0")} 00000 n \n`;
  body += `${String(offsets[1]).padStart(10, "0")} 00000 n \n`;
  body += "trailer\n<< /Size 3 /Root 1 0 R >>\n";
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(body);
}

function localRuntime() {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = spawnSync(
    process.platform === "win32"
      ? "cmd.exe"
      : path.join(cwd, "node_modules", ".bin", "supabase"),
    process.platform === "win32"
      ? ["/d", "/s", "/c", "node_modules\\.bin\\supabase.cmd status -o env"]
      : ["status", "-o", "env"],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(result.stderr);
  }
  const values = Object.fromEntries(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2].replace(/"$/, "")]),
  );
  const apiUrl = values.API_URL;
  const anonKey = values.ANON_KEY ?? values.PUBLISHABLE_KEY;
  const serviceRoleKey = values.SERVICE_ROLE_KEY ?? values.SECRET_KEY;
  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Local Supabase API runtime is unavailable");
  }
  const hostname = new URL(apiUrl).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Refusing non-local paid-cost fixture target: ${hostname}`);
  }
  return { anonKey, apiUrl, serviceRoleKey };
}

main().catch((error) => {
  const detail =
    error && typeof error === "object"
      ? JSON.stringify(error, Object.getOwnPropertyNames(error))
      : String(error);
  process.stderr.write(`Paid-cost fixture failed during ${fixturePhase}: ${detail}\n`);
  process.exitCode = 1;
});
