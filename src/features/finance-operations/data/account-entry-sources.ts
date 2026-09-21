import type { createSupabaseServerClient } from "@/lib/db/server";
import type { PropertyAccountEntry } from "../finance-operations.types";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// The projection's identity is not always the command identity. Resolve through
// explicit foreign keys, and leave the row read-only when a source is unavailable.
export async function hydrateAccountEntrySources(client: Client, organizationId: string, entries: PropertyAccountEntry[], options: {requireComplete?: boolean} = {}) {
  const assertComplete = (...results: {error: unknown}[]) => {
    if (options.requireComplete && results.some(result => result.error)) throw new Error("Transaction history could not be loaded completely. Refresh before reviewing activity.");
  };
  if (!entries.length) return entries;
  // Bound PostgREST URLs even if the account register limit grows.
  if (entries.length > 75) {
    const result: PropertyAccountEntry[] = [];
    for (let offset = 0; offset < entries.length; offset += 75) result.push(...await hydrateAccountEntrySources(client, organizationId, entries.slice(offset, offset + 75), options));
    return result;
  }
  const ids = (type: string) => entries.filter((entry) => entry.sourceType === type).map((entry) => entry.id);
  const propertyIds = [...new Set(entries.map((entry) => entry.propertyId))];
  const contributionUnits = new Map<string, string | null>();
  const sources = new Map<string, NonNullable<PropertyAccountEntry["source"]>>();
  const key = (type: string, id: string) => `${type}:${id}`;
  const cashProperties = entries.filter((entry) => ["property_withdrawal", "owner_contribution"].includes(entry.sourceType)).map((entry) => entry.propertyId);
  const properties = cashProperties.length ? await client.from("properties").select("id, branch_id").eq("organization_id", organizationId).in("id", [...new Set(cashProperties)]) : { data: [], error: null };
  // This is only an availability precheck. Finance-only staff may not have
  // properties.view, so an unknown branch must not hide a finance command.
  // Global locks and owner periods still apply; the RPC checks branch authority
  // and every affected period again when the reviewed correction is confirmed.
  const branches = new Map((properties.error ? [] : properties.data ?? []).map((property) => [property.id, property.branch_id]));
  const distributionIds = ids("property_withdrawal");
  if (distributionIds.length) {
    const [originals, reversals, periods, locks] = await Promise.all([
      client.from("property_withdrawals").select("*").eq("organization_id", organizationId).in("property_id", propertyIds).in("id", distributionIds),
      client.from("property_withdrawals").select("reversal_of_id").eq("organization_id", organizationId).in("property_id", propertyIds).in("reversal_of_id", distributionIds),
      client.from("owner_balance_periods").select("property_id, owner_person_id, currency, month_start").eq("organization_id", organizationId).eq("status", "closed").in("property_id", propertyIds),
      client.from("financial_month_locks").select("month_start, branch_id").eq("organization_id", organizationId).eq("is_locked", true),
    ]);
    assertComplete(originals, reversals, periods, locks);
    if (!originals.error && !reversals.error && !periods.error && !locks.error) {
      for (const row of originals.data ?? []) {
        const reversed = row.reversal_of_id || reversals.data?.some((item) => item.reversal_of_id === row.id);
        const month = `${row.withdrawal_date.slice(0, 7)}-01`;
        const closed = locks.data?.some((item) => item.month_start === month && (item.branch_id === null || branches.get(row.property_id) === null || item.branch_id === branches.get(row.property_id))) || periods.data?.some((item) => item.property_id === row.property_id && item.owner_person_id === row.owner_person_id && item.currency === row.currency && item.month_start >= month);
        sources.set(key("property_withdrawal", row.id), { kind: "distribution", id: row.id, reference: row.reference, isReversed: Boolean(reversed), blockedReason: reversed ? "This transaction has been reversed." : closed ? "This transaction belongs to a closed period." : undefined });
      }
    }
  }
  const contributionIds = ids("owner_contribution");
  if (contributionIds.length) {
    const [originals, reversals, periods, locks] = await Promise.all([
      client.from("owner_cash_events").select("*").eq("organization_id", organizationId).in("property_id", propertyIds).in("id", contributionIds),
      client.from("owner_cash_events").select("reversal_of_id").eq("organization_id", organizationId).in("property_id", propertyIds).in("reversal_of_id", contributionIds),
      client.from("owner_balance_periods").select("property_id, owner_person_id, currency, month_start").eq("organization_id", organizationId).eq("status", "closed").in("property_id", propertyIds),
      client.from("financial_month_locks").select("month_start, branch_id").eq("organization_id", organizationId).eq("is_locked", true),
    ]);
    assertComplete(originals, reversals, periods, locks);
    if (!originals.error && !reversals.error && !periods.error && !locks.error) for (const row of originals.data ?? []) {
      contributionUnits.set(row.id, row.unit_id);
      const reversed = row.reversal_of_id || reversals.data?.some((item) => item.reversal_of_id === row.id);
      const month = `${row.event_date.slice(0, 7)}-01`;
      const closed = locks.data?.some((item) => item.month_start === month && (item.branch_id === null || branches.get(row.property_id) === null || item.branch_id === branches.get(row.property_id))) || periods.data?.some((item) => item.property_id === row.property_id && item.owner_person_id === row.owner_person_id && item.currency === row.currency && item.month_start >= month);
      sources.set(key("owner_contribution", row.id), { kind: "contribution", id: row.id, reference: row.corrects_event_id ? row.reference : row.reference ?? row.reason, isReversed: Boolean(reversed || row.amount <= 0), blockedReason: reversed || row.amount <= 0 ? "This transaction has been reversed." : closed ? "This transaction belongs to a closed period." : undefined });
    }
  }
  for (const type of ["tenant_invoice_payment", "owner_collection_confirmation"] as const) {
    const sourceIds = ids(type);
    if (!sourceIds.length) continue;
    const table = type === "tenant_invoice_payment" ? "tenant_invoice_payment_allocations" : "owner_collection_confirmation_allocations";
    const result = await client.from(table).select("id, invoice_id, reversal_of_allocation_id").eq("organization_id", organizationId).in("id", sourceIds);
    assertComplete(result);
    if (!result.error) for (const row of result.data ?? []) {
      sources.set(key(type, row.id), { kind: "rent", id: row.invoice_id, reference: null, blockedReason: row.reversal_of_allocation_id ? "This is a reversal entry." : undefined });
    }
  }
  const expenseIds = ids("ips_expense_responsibility");
  if (expenseIds.length) {
    const result = await client.from("ips_expense_responsibilities").select("id, finance_expense_item_id").eq("organization_id", organizationId).in("property_id", propertyIds).in("id", expenseIds);
    assertComplete(result);
    if (!result.error && result.data?.length) {
      const submissions = await client.from("expense_submissions").select("id, approved_finance_expense_item_id, reference, status").eq("organization_id", organizationId).in("property_id", propertyIds).in("approved_finance_expense_item_id", result.data.map((row) => row.finance_expense_item_id));
      assertComplete(submissions);
      if (!submissions.error) for (const row of result.data) {
        const submission = submissions.data?.find((item) => item.approved_finance_expense_item_id === row.finance_expense_item_id);
        if (submission) sources.set(key("ips_expense_responsibility", row.id), { kind: "expense", id: submission.id, reference: submission.reference, isReversed: submission.status === "reversed", blockedReason: submission.status === "reversed" ? "This transaction has been reversed." : undefined });
      }
    }
  }
  const feeIds = ids("management_fee_occurrence");
  if (feeIds.length) {
    const [result, reversals] = await Promise.all([
      client.from("management_fee_occurrences").select("id, lease_id, reversal_of_id, settlement_status").eq("organization_id", organizationId).in("property_id", propertyIds).in("id", feeIds),
      client.from("management_fee_occurrences").select("reversal_of_id").eq("organization_id", organizationId).in("property_id", propertyIds).in("reversal_of_id", feeIds),
    ]);
    assertComplete(result, reversals);
    if (!result.error && !reversals.error) for (const row of result.data ?? []) sources.set(key("management_fee_occurrence", row.id), { kind: "lease", id: row.lease_id, reference: null, isReversed: Boolean(row.reversal_of_id || row.settlement_status === "reversed" || reversals.data?.some(reversal => reversal.reversal_of_id === row.id)) });
  }
  return entries.map((entry) => ({ ...entry, unitId: entry.sourceType === "owner_contribution" ? contributionUnits.get(entry.id) : entry.unitId, source: sources.get(key(entry.sourceType, entry.id)) }));
}
