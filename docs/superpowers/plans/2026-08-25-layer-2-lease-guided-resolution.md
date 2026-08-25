# Layer 2 Lease Guided Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved focused Lease payment-resolution state without replacing the normal Lease record or exposing the complexity of the Finance workspace.

**Architecture:** Keep `/leases/[leaseId]` as the canonical record route and add a narrowly parsed `record-payment` query state. The server loads the normal Lease summary plus one organization-and-Lease-scoped invoice read model; the client reuses the existing payment mutation through an extracted form and renders the approved two-column resolution body only for an eligible IPS-collected invoice. Stale, paid, voided, archived, direct-to-owner, and unavailable states fall back to the normal Lease record with concise guidance.

**Tech Stack:** Next.js App Router, React 19 client components and server actions, TypeScript, Supabase typed client, Tailwind CSS, Vitest, Testing Library, authenticated local browser verification.

**Spec:** `docs/superpowers/specs/2026-08-25-layer-2-lease-guided-resolution-design.md`

## Global Constraints

- Work only in the existing `codex/layer-1-register-queue-tasks-1-2` worktree.
- Preserve the unrelated modified `AGENTS.md` and the untracked Layer 1 plan.
- Do not add or change a database table, view, RPC, migration, enum, or financial classification.
- Do not write to hosted Supabase. Do not push, merge, deploy, or mutate production.
- Keep `recordTenantInvoicePaymentAction` as the only tenant-payment mutation authority.
- Never call `getFinanceOperationsData` from the Lease route; the focused loader must query only the selected invoice and the small set of records needed to render it.
- Support only `collectionRoute === "through_ips"` in the focused action. Direct-to-owner invoices remain in the existing Finance workflow.
- Keep the ordinary Lease record unchanged when the action query is absent or ineligible.
- Keep user-facing copy free of `Recent evidence`; the section is `Recent activity`.
- Use the existing business-date and money-formatting utilities. Do not derive a future financial calendar in the browser.
- Run each RED test before implementation, then rerun it GREEN before committing the task.

## File Map

| File | Ownership in this plan |
| --- | --- |
| `src/features/leases/lease-detail-route.ts` | Parse and build the URL-backed focused payment action. |
| `src/features/leases/lease-detail-route.test.ts` | Lock the canonical URL and query-clearing behavior. |
| `src/features/finance-operations/finance-operations.types.ts` | Define the small focused Lease payment read model and receipt-result type. |
| `src/features/finance-operations/data/finance-operations.ts` | Add the organization/Lease/invoice-scoped loader while reusing existing invoice mappers. |
| `src/features/finance-operations/data/finance-operations.test.ts` | Prove exact scoping, narrow queries, and next-invoice selection. |
| `src/features/finance-operations/components/tenant-invoice-payment-form.tsx` | Own the reusable authoritative invoice settlement form. |
| `src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx` | Prove form fields, route behavior, allocation disclosure, errors, and receipt results. |
| `src/features/finance-operations/components/finance-operations-screen.tsx` | Replace the private payment form with the extracted component; no Finance layout redesign. |
| `src/features/finance-operations/components/finance-operations-screen.test.tsx` | Preserve the existing Finance payment workflow after extraction. |
| `src/features/finance-operations/actions.ts` | Add a tenant-payment-only Lease and Records revalidation wrapper. |
| `src/features/finance-operations/actions.test.ts` | Lock the expanded revalidation boundary without changing the RPC payload. |
| `src/features/leases/components/lease-payment-resolution-view.tsx` | Render the approved resolution heading, progress, form/context split, Recent activity, and Upcoming. |
| `src/features/leases/components/lease-payment-resolution-view.test.tsx` | Cover visual copy, deposit states, activity, upcoming priority, permissions, and success return. |
| `src/features/leases/components/lease-detail-screen.tsx` | Select the focused body or the stable Lease record while retaining the existing header and actions. |
| `src/features/leases/components/lease-detail-screen.test.tsx` | Prove the focused state removes tabs and the default record stays intact. |
| `src/app/(dashboard)/leases/[leaseId]/page.tsx` | Load the focused invoice only when the action query is valid and classify fallbacks. |
| `src/app/(dashboard)/leases/[leaseId]/page.test.tsx` | Cover payable, stale, paid, voided, archived, direct-owner, and permission cases. |

---

## Task 1: Lock the URL-backed Lease action contract

**Files:**

- Modify: `src/features/leases/lease-detail-route.ts`
- Modify: `src/features/leases/lease-detail-route.test.ts`

**Interfaces:**

- Consumes: raw App Router search parameters and the existing `buildHref` utility.
- Produces: `LeaseDetailQuery`, `buildLeasePaymentResolutionHref`, and the existing stable `buildLeaseRecordHref`.

- [ ] **Step 1: Write the failing route tests.**

Add exact expectations for the ordinary record, the focused action, malformed action input, array-valued parameters, and clearing focus:

Update every existing parser expectation to include `paymentInvoiceId: null`; this prevents the new action state from being implicit in the ordinary record contract.

```ts
it("parses an exact invoice-backed payment action", () => {
  expect(
    parseLeaseDetailQuery({
      action: "record-payment",
      invoiceId: "30000000-0000-0000-0000-000000000001",
      section: "rent",
    }),
  ).toEqual({
    paymentInvoiceId: "30000000-0000-0000-0000-000000000001",
    section: "rent",
  });
});

it("does not enter focus without both exact parameters", () => {
  expect(parseLeaseDetailQuery({ action: "record-payment" })).toEqual({
    paymentInvoiceId: null,
    section: "overview",
  });
  expect(
    parseLeaseDetailQuery({ action: "owner-payment", invoiceId: "invoice-1" }),
  ).toEqual({ paymentInvoiceId: null, section: "overview" });
  expect(
    parseLeaseDetailQuery({
      action: "record-payment",
      invoiceId: "not-a-database-id",
    }),
  ).toEqual({ paymentInvoiceId: null, section: "overview" });
});

it("builds the focused action and stable return URLs", () => {
  expect(
    buildLeasePaymentResolutionHref({
      invoiceId: "invoice-1",
      leaseId: "lease-1",
    }),
  ).toBe("/leases/lease-1?action=record-payment&invoiceId=invoice-1");
  expect(buildLeaseRecordHref({ leaseId: "lease-1" })).toBe("/leases/lease-1");
});
```

- [ ] **Step 2: Run the focused test and confirm RED.**

Run:

```powershell
npm test -- src/features/leases/lease-detail-route.test.ts
```

Expected: failure because `paymentInvoiceId` and `buildLeasePaymentResolutionHref` do not exist.

- [ ] **Step 3: Implement the smallest route contract.**

Use one nullable action value rather than a generic action registry:

```ts
export type LeaseDetailQuery = {
  paymentInvoiceId: string | null;
  section: LeaseRecordSection;
};

const databaseIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseLeaseDetailQuery(
  searchParams: Record<string, string | string[] | undefined>,
): LeaseDetailQuery {
  const section = firstValue(searchParams.section);
  const action = firstValue(searchParams.action);
  const invoiceId = firstValue(searchParams.invoiceId)?.trim();

  return {
    paymentInvoiceId:
      action === "record-payment" &&
      invoiceId &&
      databaseIdPattern.test(invoiceId)
        ? invoiceId
        : null,
    section: leaseRecordSections.has(section as LeaseRecordSection)
      ? (section as LeaseRecordSection)
      : "overview",
  };
}

export function buildLeasePaymentResolutionHref({
  invoiceId,
  leaseId,
}: {
  invoiceId: string;
  leaseId: string;
}) {
  return buildHref(`/leases/${leaseId}`, {
    action: "record-payment",
    invoiceId,
  });
}
```

Do not add `action` to `buildLeaseRecordHref`; that function is the deliberate focus-clearing return path.

- [ ] **Step 4: Run the route tests GREEN.**

Run:

```powershell
npm test -- src/features/leases/lease-detail-route.test.ts
```

Expected: all Lease route tests pass.

- [ ] **Step 5: Commit the route contract.**

```powershell
git add src/features/leases/lease-detail-route.ts src/features/leases/lease-detail-route.test.ts
git commit -m "feat(leases): define payment resolution route"
```

---

## Task 2: Add the focused invoice read model without loading Finance

**Files:**

- Modify: `src/features/finance-operations/finance-operations.types.ts`
- Modify: `src/features/finance-operations/data/finance-operations.ts`
- Modify: `src/features/finance-operations/data/finance-operations.test.ts`

**Interfaces:**

- Consumes: `organizationId`, `leaseId`, `invoiceId`, `tenant_invoice_balances`, invoice lines/generation/settlements, one property/unit, active reconciliation sources, and commercial-document metadata.
- Produces: `Promise<LeasePaymentResolutionData | null>` where `null` means the selected invoice is not in the exact organization-and-Lease scope.
- Invariant: this loader never calls or wraps `getFinanceOperationsData`.

- [ ] **Step 1: Add the focused type and failing data tests.**

Add this feature-specific type:

```ts
export type LeasePaymentResolutionData = {
  invoice: TenantInvoiceSummary;
  nextInvoiceDueDate: string | null;
  reconciliationSources: FinanceOption[];
};
```

Add tests around a small injected query harness used only by the data suite. The assertions must prove:

```ts
it("loads only the invoice belonging to the requested organization and Lease", async () => {
  const result = await loadLeasePaymentResolutionData(client, {
    invoiceId,
    leaseId,
    organizationId,
  });

  expect(result?.invoice).toMatchObject({ id: invoiceId, leaseId });
  expect(client.filtersFor("tenant_invoice_balances")).toEqual(
    expect.arrayContaining([
      ["organization_id", organizationId],
      ["lease_id", leaseId],
      ["id", invoiceId],
    ]),
  );
  expect(client.tables()).not.toContain("current_leases");
  expect(client.tables()).not.toContain("property_finance_positions");
  expect(client.tables()).not.toContain("expense_submissions");
});

it("returns null for a stale or cross-Lease invoice", async () => {
  client.respond("tenant_invoice_balances", { data: null, error: null });
  await expect(
    loadLeasePaymentResolutionData(client, {
      invoiceId,
      leaseId,
      organizationId,
    }),
  ).resolves.toBeNull();
});

it("returns the earliest non-void future invoice date and scoped active sources", async () => {
  const result = await loadLeasePaymentResolutionData(client, input);
  expect(result).toMatchObject({ nextInvoiceDueDate: "2026-09-01" });
  expect(result?.reconciliationSources).toEqual([
    { id: "source-1", label: "ABA · Operating", propertyId },
  ]);
});
```

The query harness must record table names and equality filters, support the chain methods this loader calls, and return fixed fixture rows. It must not emulate unrelated Supabase behavior.

- [ ] **Step 2: Run the focused data suite and confirm RED.**

Run:

```powershell
npm test -- src/features/finance-operations/data/finance-operations.test.ts
```

Expected: failure because the focused type and loader do not exist.

- [ ] **Step 3: Add a client-taking loader and a server-client wrapper.**

Keep the implementation beside the current private invoice mapping helpers so it can reuse `getTenantInvoiceLineRows`, `getTenantInvoiceGenerationRows`, `getTenantInvoiceSettlementRows`, `loadCommercialDocumentLinks`, `buildSettlementsByInvoiceId`, and `toTenantInvoice` without exporting internal row aliases:

```ts
type FinanceServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type LeasePaymentResolutionInput = {
  invoiceId: string;
  leaseId: string;
  organizationId: string;
};

export async function getLeasePaymentResolutionData(
  input: LeasePaymentResolutionInput,
): Promise<LeasePaymentResolutionData | null> {
  return loadLeasePaymentResolutionData(
    await createSupabaseServerClient(),
    input,
  );
}

export async function loadLeasePaymentResolutionData(
  supabase: FinanceServerClient,
  { invoiceId, leaseId, organizationId }: LeasePaymentResolutionInput,
): Promise<LeasePaymentResolutionData | null> {
  const selectedResult = await supabase
    .from("tenant_invoice_balances")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("lease_id", leaseId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (selectedResult.error) {
    throw new Error(
      `Could not load Lease payment resolution: ${selectedResult.error.message}`,
    );
  }
  if (!selectedResult.data) return null;

  const row = selectedResult.data as TenantInvoiceBalanceRow;
  if (!row.property_id || row.lease_id !== leaseId) return null;
  // Load only row.property_id, row.unit_id, [invoiceId], scoped sources,
  // and the first future non-void invoice for this Lease.
}
```

The selected-invoice query must include all three equality filters before any supporting queries run.

- [ ] **Step 4: Implement the narrow supporting queries and reuse the existing mapper.**

Run the following in parallel after the selected row is accepted:

```ts
const [
  propertyResult,
  unitResult,
  linesResult,
  generationResult,
  settlementsResult,
  sourcesResult,
  nextInvoiceResult,
] = await Promise.all([
  supabase
    .from("properties")
    .select("id, code, name")
    .eq("organization_id", organizationId)
    .eq("id", row.property_id!)
    .maybeSingle(),
  row.unit_id
    ? supabase
        .from("units")
        .select("id, property_id, unit_number")
        .eq("organization_id", organizationId)
        .eq("property_id", row.property_id!)
        .eq("id", row.unit_id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null }),
  getTenantInvoiceLineRows(supabase, organizationId, [invoiceId]),
  getTenantInvoiceGenerationRows(supabase, organizationId, [invoiceId]),
  getTenantInvoiceSettlementRows(supabase, organizationId, [invoiceId]),
  supabase
    .from("financial_reconciliation_sources")
    .select("id, property_id, code, display_name, archived_at")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .or(`property_id.is.null,property_id.eq.${row.property_id}`)
    .order("code"),
  supabase
    .from("tenant_invoice_balances")
    .select("id, due_date")
    .eq("organization_id", organizationId)
    .eq("lease_id", leaseId)
    .neq("id", invoiceId)
    .neq("payment_status", "voided")
    .gte("due_date", getBusinessDateValue())
    .order("due_date", { ascending: true })
    .limit(1),
]);
```

Treat any supporting-query error as one fail-closed loader error. Build the existing line, generation, settlement, document, property, and unit maps, then call `toTenantInvoice`. Return `null` if the mapper cannot produce the selected invoice.

Return source options using the current Finance label contract:

```ts
return {
  invoice,
  nextInvoiceDueDate: nextInvoiceResult.data?.[0]?.due_date ?? null,
  reconciliationSources: (sourcesResult.data ?? []).map((source) => ({
    id: source.id,
    label: `${source.code} · ${source.display_name}`,
    propertyId: source.property_id,
  })),
};
```

Do not load organization members, all properties, all units, all leases, owner balances, expense submissions, positions, account entries, rent exceptions, or Finance categories.

- [ ] **Step 5: Run the focused data suite GREEN.**

Run:

```powershell
npm test -- src/features/finance-operations/data/finance-operations.test.ts
```

Expected: focused scope tests and all existing Finance data tests pass.

- [ ] **Step 6: Commit the focused read model.**

```powershell
git add src/features/finance-operations/finance-operations.types.ts src/features/finance-operations/data/finance-operations.ts src/features/finance-operations/data/finance-operations.test.ts
git commit -m "feat(leases): load focused payment resolution"
```

---

## Task 3: Extract the authoritative payment form and preserve Finance behavior

**Files:**

- Create: `src/features/finance-operations/components/tenant-invoice-payment-form.tsx`
- Create: `src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx`
- Modify: `src/features/finance-operations/components/finance-operations-screen.tsx`
- Modify: `src/features/finance-operations/components/finance-operations-screen.test.tsx`
- Modify: `src/features/finance-operations/actions.ts`
- Modify: `src/features/finance-operations/actions.test.ts`

**Interfaces:**

- Consumes: `TenantInvoiceSummary`, scoped `FinanceOption[]`, `recordTenantInvoicePaymentAction`, `confirmOwnerCollectionAction`, and optional presentation callbacks.
- Produces: `TenantInvoicePaymentForm` and `TenantPaymentReceiptResult`.
- Invariant: the server action names, form field names, RPC payload, allocation naming, idempotency behavior, and receipt result remain unchanged.

- [ ] **Step 1: Write the new component tests before moving code.**

Mock both existing actions and prove the extracted form retains these contracts:

```ts
it("submits an IPS payment with the authoritative field names", () => {
  render(
    <TenantInvoicePaymentForm
      invoice={invoice({ collectionRoute: "through_ips" })}
      onReceiptResult={vi.fn()}
      onSuccess={vi.fn()}
      reconciliationSources={[source()]}
      submitLabel="Record USD 258.00 payment"
    />,
  );

  expect(screen.getByLabelText("Amount")).toHaveAttribute("name", "amount");
  expect(screen.getByLabelText("Received date")).toHaveAttribute(
    "name",
    "settlementDate",
  );
  expect(screen.getByLabelText("Deposit to")).toHaveAttribute(
    "name",
    "reconciliationSourceId",
  );
  expect(
    screen.getByRole("button", { name: "Record USD 258.00 payment" }),
  ).toBeEnabled();
});

it("keeps allocations collapsed unless more than one line is outstanding", () => {
  renderForm({ lines: [openLine("Rent"), openLine("Parking")] });
  expect(screen.getByText("Change how payment is applied")).toBeVisible();
});

it("reports receipt publication success and failure without changing payment success", async () => {
  recordTenantInvoicePaymentAction.mockResolvedValueOnce({
    artifactHref: "/api/finance/documents/receipt-1",
    message: "Payment recorded.",
    paymentId: "payment-1",
    publicationStatus: "published",
    status: "success",
  });
  // Submit and assert onReceiptResult plus onSuccess receive the server result.
});

it("associates and focuses an authoritative payment error", async () => {
  recordTenantInvoicePaymentAction.mockResolvedValueOnce({
    message: "The selected receiving account is unavailable.",
    status: "error",
  });
  // Submit, then assert the form describes itself with the alert id and the
  // alert receives focus while the entered amount and reference remain.
});
```

Also keep one existing Finance screen test that opens its payment modal and sees `Deposit to` and `Record payment`.

- [ ] **Step 2: Run the new and existing component tests and confirm RED only for the missing extraction.**

Run:

```powershell
npm test -- src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx
```

Expected: the new suite fails because the component does not exist; existing Finance tests remain green before refactoring.

- [ ] **Step 3: Move `SettleInvoiceForm` into its own component.**

Export an exact receipt result and a presentation-only `submitLabel` override:

```ts
export type TenantPaymentReceiptResult = {
  href: string | null;
  paymentId: string | null;
  unavailable: boolean;
};

export function TenantInvoicePaymentForm({
  invoice,
  onChooseAnother,
  onReceiptResult,
  onSuccess,
  reconciliationSources,
  submitLabel,
}: {
  invoice: TenantInvoiceSummary;
  onChooseAnother?: () => void;
  onReceiptResult: (result: TenantPaymentReceiptResult) => void;
  onSuccess: (message: string) => void;
  reconciliationSources: FinanceOption[];
  submitLabel?: string;
}) {
  const idempotencyKey = useStableActionId(
    invoice.collectionRoute === "through_ips" ? "payment" : "owner-confirm",
  );
  const action =
    invoice.collectionRoute === "through_ips"
      ? recordTenantInvoicePaymentAction
      : confirmOwnerCollectionAction;
  const [state, formAction] = useActionState(action, {});

  // Preserve the current hidden fields, amount/date/source/reference fields,
  // allocation disclosure, server error alert, and callback effect.
}
```

Give the form's error message a stable ID and focus target:

```tsx
const errorId = useId();
const errorRef = useRef<HTMLParagraphElement | null>(null);

useEffect(() => {
  if (state.status === "error") errorRef.current?.focus();
}, [state.status]);

<form
  action={formAction}
  aria-describedby={state.status === "error" ? errorId : undefined}
>
  {/* unchanged fields */}
  {state.status === "error" && state.message ? (
    <p id={errorId} ref={errorRef} role="alert" tabIndex={-1}>
      {state.message}
    </p>
  ) : null}
</form>
```

Keep the component's small label/footer/message markup private in this file. Do not move the Finance screen's other form primitives or redesign unrelated Finance forms.

Use this submit-label expression:

```ts
const actionLabel =
  submitLabel ??
  (invoice.collectionRoute === "through_ips"
    ? "Record payment"
    : "Confirm collected");
```

- [ ] **Step 4: Replace the private Finance form with the extracted component.**

Import `TenantInvoicePaymentForm`, replace both `SettleInvoiceForm` call sites, then delete only the old private `SettleInvoiceForm` function. Preserve all existing modal callbacks and receipt handling.

- [ ] **Step 5: Add tenant-payment-only revalidation without changing mutation authority.**

Keep the general Finance revalidation list unchanged. Add a narrow wrapper and use it for every successful or committed-result return path inside `recordTenantInvoicePaymentAction`:

```ts
function revalidateTenantPayment() {
  revalidateFinance();
  revalidatePath("/leases");
  revalidatePath("/records");
}
```

Do not call this wrapper from owner-payment, expense, withdrawal, or category actions.

Add assertions to the existing successful payment test:

```ts
expect(revalidatePath).toHaveBeenCalledWith("/leases");
expect(revalidatePath).toHaveBeenCalledWith("/records");
expect(rpc).toHaveBeenCalledWith(
  "record_tenant_invoice_payment",
  expect.objectContaining({ p_invoice_id: invoiceId }),
);
```

The focused Lease page will additionally call `router.refresh()` after success to refresh its exact dynamic route.

- [ ] **Step 6: Run the component and action suites GREEN.**

Run:

```powershell
npm test -- src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/finance-operations/actions.test.ts
```

Expected: all tests pass and the Finance modal behaves exactly as before.

- [ ] **Step 7: Commit the extraction.**

```powershell
git add src/features/finance-operations/components/tenant-invoice-payment-form.tsx src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx src/features/finance-operations/components/finance-operations-screen.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/finance-operations/actions.ts src/features/finance-operations/actions.test.ts
git commit -m "refactor(finance): reuse tenant payment form"
```

---

## Task 4: Build the approved focused Lease resolution body

**Files:**

- Create: `src/features/leases/components/lease-payment-resolution-view.tsx`
- Create: `src/features/leases/components/lease-payment-resolution-view.test.tsx`

**Interfaces:**

- Consumes: `LeaseSummary`, `LeasePaymentResolutionData`, `canRecordPayments`, `canViewFinance`, `returnHref`, and success callback.
- Produces: the approved flat resolution composition beneath the Lease header.
- Invariant: the component does not decide whether an invoice belongs to the Lease; the server loader already enforced that boundary.

- [ ] **Step 1: Write rendering tests for the approved visual contract.**

Cover the exact copy and hierarchy:

```ts
it("renders one guided IPS payment resolution", () => {
  renderResolution();

  expect(
    screen.getByRole("heading", { name: "Resolve outstanding rent" }),
  ).toBeVisible();
  expect(
    screen.getByRole("list", { name: "Payment resolution progress" }),
  ).toHaveTextContent(
    "Invoice reviewedRecord paymentReceipt created",
  );
  expect(
    screen.getByRole("heading", { name: "Payment to record" }),
  ).toBeVisible();
  expect(screen.getByRole("heading", { name: "Lease context" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Recent activity" })).toBeVisible();
  expect(screen.queryByText("Recent evidence")).not.toBeInTheDocument();
});
```

Cover all deposit rules:

```ts
it.each([
  [258, 258, "USD 258.00", "Received"],
  [258, 100, "USD 258.00", "USD 100.00 received"],
  [258, 0, "USD 258.00", "Not received"],
])("shows the deposit obligation and receipt state", ...);

it("says No deposit required without a received badge", () => {
  const lease = leaseFixture({ deposits: [], depositLabel: "No deposit required" });
  renderResolution({ lease });
  expect(screen.getByText("No deposit required")).toBeVisible();
  expect(screen.queryByText("Received")).not.toBeInTheDocument();
});
```

Cover Upcoming priority with server data first, then scheduled activation/term, then Lease end. Assert no `Upcoming` heading when all legitimate sources are absent. Cover three-row maximum for Recent activity and Upcoming.

Cover permission behavior:

```ts
it("shows read-only invoice context when payment authority is absent", () => {
  renderResolution({ canRecordPayments: false, canViewFinance: true });
  expect(screen.queryByRole("button", { name: /Record .* payment/ })).toBeNull();
  expect(screen.getByRole("link", { name: "Open in Finance" })).toHaveAttribute(
    "href",
    `/rent-income?leaseId=${leaseId}`,
  );
});

it("does not render a dead-end submit action without a receiving account", () => {
  renderResolution({ reconciliationSources: [] });
  expect(screen.queryByRole("button", { name: /Record .* payment/ })).toBeNull();
  expect(screen.getByText("No receiving account is available.")).toBeVisible();
});
```

- [ ] **Step 2: Run the new view suite and confirm RED.**

Run:

```powershell
npm test -- src/features/leases/components/lease-payment-resolution-view.test.tsx
```

Expected: failure because the view does not exist.

- [ ] **Step 3: Implement the resolution heading and accessible progress line.**

The root remains flat and uses dividers, not a card grid:

```tsx
<div className="workspace-gutter-x pb-8">
  <section aria-labelledby="lease-resolution-heading" className="border-t border-border py-5">
    <h2 id="lease-resolution-heading" className="text-xl font-semibold">
      Resolve outstanding rent
    </h2>
    <p className="mt-1 text-sm text-muted-foreground">
      {formatMoneyDisplay(invoice.balanceDue).primary} was due {formatDate(invoice.dueDate)} for {invoice.lines[0]?.label ?? "this invoice"}.
    </p>
    <ol aria-label="Payment resolution progress" className="mt-4 grid gap-2 sm:grid-cols-3">
      <ProgressStep label="Invoice reviewed" state="complete" />
      <ProgressStep label="Record payment" state="current" />
      <ProgressStep label="Receipt created" state="future" />
    </ol>
  </section>
  {/* action/context, activity, and upcoming sections */}
</div>
```

Each progress item must include visible text such as `Complete`, `Current`, or `Next`; color is secondary.

- [ ] **Step 4: Implement the form/context split and the one dominant action.**

Use one divider at the wide breakpoint and stack below it:

```tsx
<div className="grid border-t border-border lg:grid-cols-[minmax(0,1fr)_20rem]">
  <section aria-labelledby="payment-to-record-heading" className="py-6 lg:pr-8">
    <h2 id="payment-to-record-heading" className="text-base font-semibold">
      Payment to record
    </h2>
    {canRecordPayments && resolution.reconciliationSources.length > 0 ? (
      <TenantInvoicePaymentForm
        invoice={invoice}
        onReceiptResult={onReceiptResult}
        onSuccess={onPaymentSuccess}
        reconciliationSources={resolution.reconciliationSources}
        submitLabel={`Record ${formatMoneyDisplay(invoice.balanceDue).primary} payment`}
      />
    ) : (
      <ReadOnlyPaymentSummary invoice={invoice} />
    )}
    <Button asChild variant="ghost">
      <Link href={returnHref}>Payment is not received</Link>
    </Button>
  </section>
  <aside aria-labelledby="lease-context-heading" className="border-t border-border py-6 lg:border-l lg:border-t-0 lg:pl-8">
    <h2 id="lease-context-heading" className="text-base font-semibold">
      Lease context
    </h2>
    {/* Unit, monthly rent, deposit amount/state, Lease end, return link */}
  </aside>
</div>
```

`Payment is not received` and `Open full lease record` both use `returnHref`. Only the payment submit uses the default button treatment.

- [ ] **Step 5: Implement exact deposit, Recent activity, and Upcoming rules.**

Use the first active deposit context already selected into `lease.deposits`. The display logic is exact:

```ts
function getDepositPresentation(lease: LeaseSummary) {
  const deposit = lease.deposits[0];
  if (!deposit) return { amount: "No deposit required", state: null };
  if (deposit.receivedAmount >= deposit.amount) {
    return { amount: deposit.amountDisplay.primary, state: "Received" };
  }
  if (deposit.receivedAmount > 0) {
    return {
      amount: deposit.amountDisplay.primary,
      state: `${formatMoneyDisplay(deposit.receivedAmount, deposit.currency).primary} received`,
    };
  }
  return { amount: deposit.amountDisplay.primary, state: "Not received" };
}
```

Build Recent activity from the focused invoice first, then `lease.activity`, de-duplicate by ID, sort newest first where dates are comparable, and slice to three. Use `invoice.pdf.href`, an existing activity `href`, or `/rent-income?leaseId=[leaseId]` only when that destination is legitimate.

Build Upcoming in this order and slice to three:

```ts
const upcoming = [
  resolution.nextInvoiceDueDate
    ? { date: resolution.nextInvoiceDueDate, label: "Next invoice due" }
    : null,
  lease.activationSchedule?.status === "pending"
    ? { date: lease.activationSchedule.activationDate, label: "Lease activation" }
    : null,
  lease.terms.find((term) => term.status === "upcoming")
    ? {
        date: lease.terms.find((term) => term.status === "upcoming")!.startDate,
        label: "Scheduled Lease term",
      }
    : null,
  lease.formValues.leaseEndDate
    ? { date: lease.formValues.leaseEndDate, label: "Lease ends" }
    : null,
]
  .filter(isPresent)
  .filter((item) => item.date >= getBusinessDateValue())
  .slice(0, 3);

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
```

Filtering already-owned dates against the existing business date is allowed; calculating a new financial date is not. Do not calculate a next rent date. Omit the entire Upcoming section when `upcoming.length === 0`.

- [ ] **Step 6: Implement authoritative success return and error retention.**

Keep server action errors inside the extracted form. On success, let the parent replace the URL and refresh the exact Lease route. Preserve the receipt result so `Payment recorded. Receipt unavailable.` remains a successful payment message.

- [ ] **Step 7: Run the view suite GREEN.**

Run:

```powershell
npm test -- src/features/leases/components/lease-payment-resolution-view.test.tsx
```

Expected: all focused copy, state, permission, and hierarchy tests pass.

- [ ] **Step 8: Commit the focused view.**

```powershell
git add src/features/leases/components/lease-payment-resolution-view.tsx src/features/leases/components/lease-payment-resolution-view.test.tsx
git commit -m "feat(leases): add guided payment resolution view"
```

---

## Task 5: Wire focused and fallback states into the Lease route

**Files:**

- Modify: `src/features/leases/components/lease-detail-screen.tsx`
- Modify: `src/features/leases/components/lease-detail-screen.test.tsx`
- Modify: `src/app/(dashboard)/leases/[leaseId]/page.tsx`
- Modify: `src/app/(dashboard)/leases/[leaseId]/page.test.tsx`

**Interfaces:**

- Consumes: parsed `paymentInvoiceId`, focused loader result, Lease summary, and permission keys.
- Produces: either the approved focused state or the unchanged normal Lease record plus a concise route notice.
- Invariant: no eligible focus means no focused shell.

- [ ] **Step 1: Add failing page tests for every route classification.**

Mock `getLeasePaymentResolutionData` and assert:

```ts
it("loads one focused invoice only for the exact payment action", async () => {
  await renderPage({ action: "record-payment", invoiceId });
  expect(getLeasePaymentResolutionData).toHaveBeenCalledWith({
    invoiceId,
    leaseId,
    organizationId: "organization-1",
  });
  expect(detailSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      canRecordPayments: true,
      paymentResolution: expect.objectContaining({
        invoice: expect.objectContaining({ id: invoiceId, leaseId }),
      }),
    }),
  );
});
```

Add separate assertions for:

- missing or cross-Lease result: normal record with `That invoice is no longer available for this Lease.`
- `paymentStatus === "paid"`: normal record with `This invoice is already paid.` and receipt link when published
- `paymentStatus === "voided"`: normal record with `This invoice is voided and cannot receive a payment.`
- `collectionRoute === "direct_to_owner"`: normal record with `Confirm owner collection in Finance.` and `/rent-income?leaseId=[leaseId]`
- `lease.isArchived`: normal record with `Archived Leases cannot receive a new payment.`
- no `finance.record_payments`: focused read-only view, not a fake disabled form
- unauthorized payment mutation: the server-rendered focused view remains read-only and the action still reauthorizes independently
- no action query: focused loader is not called and existing Lease detail props remain unchanged

- [ ] **Step 2: Add failing Lease screen tests.**

```ts
it("replaces record tabs with the focused resolution body", () => {
  renderLeaseDetail({ paymentResolution });
  expect(screen.getByRole("heading", { name: "Resolve outstanding rent" })).toBeVisible();
  expect(screen.queryByRole("tab", { name: "Overview" })).toBeNull();
});

it("keeps the ordinary four-section Lease record when focus is absent", () => {
  renderLeaseDetail();
  expect(screen.getByRole("tab", { name: "Overview" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Rent" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Occupancy" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Files" })).toBeVisible();
});
```

- [ ] **Step 3: Run route and screen suites and confirm RED.**

Run:

```powershell
npm test -- "src/app/(dashboard)/leases/[leaseId]/page.test.tsx" src/features/leases/components/lease-detail-screen.test.tsx
```

Expected: focused props and route classification assertions fail.

- [ ] **Step 4: Extend `LeaseDetailScreen` with feature-specific focused props.**

Add only these props; do not introduce a generic record action interface:

```ts
type LeaseRouteNotice = {
  href?: string;
  linkLabel?: string;
  message: string;
};

type LeasePaymentFocusProps = {
  canRecordPayments: boolean;
  canViewFinance: boolean;
  paymentResolution?: LeasePaymentResolutionData;
  routeNotice?: LeaseRouteNotice;
};
```

Initialize the existing status area from `routeNotice` and render its optional link. When `paymentResolution` exists, keep the `PageHeader` and `LeaseHeaderActions` but replace `LeaseDetailView` with `LeasePaymentResolutionView`.

In focused state, use:

```tsx
description={`${lease.propertyName} · ${lease.startDateLabel}–${lease.endDateLabel}`}
title={`${lease.tenantName} — ${lease.unitLabel.split(" / ")[0] ?? lease.unitLabel}`}
```

The header retains one status badge and the existing single `More` dropdown trigger.

On authoritative payment success:

```ts
const returnHref = buildLeaseRecordHref({ leaseId: lease.id });

function handlePaymentSuccess(message: string) {
  setStatusMessage(message);
  router.replace(returnHref);
  router.refresh();
}
```

Use `router.replace`, not `router.push`, so Browser Back returns to the pre-focus Lease or queue state rather than reopening a completed form.

- [ ] **Step 5: Load and classify the focused result on the server route.**

After authorization and query parsing, fetch the normal Lease data and focused invoice concurrently when an invoice ID exists:

```ts
const { paymentInvoiceId, section } = parseLeaseDetailQuery(rawSearchParams);
const [leaseData, paymentResolution] = await Promise.all([
  getLeasesScreenData(context.organizationId, viewQuery),
  paymentInvoiceId
    ? getLeasePaymentResolutionData({
        invoiceId: paymentInvoiceId,
        leaseId,
        organizationId: context.organizationId,
      })
    : Promise.resolve(null),
]);
```

Classify before passing props:

```ts
const eligiblePaymentResolution =
  paymentResolution &&
  !lease.isArchived &&
  paymentResolution.invoice.collectionRoute === "through_ips" &&
  paymentResolution.invoice.balanceDue > 0 &&
  (paymentResolution.invoice.paymentStatus === "unpaid" ||
    paymentResolution.invoice.paymentStatus === "partly_paid")
    ? paymentResolution
    : undefined;
```

Build a normal-record `routeNotice` for every other state. Only include the Finance link when `context.permissionKeys.has("finance.view")`. Use the existing `/rent-income?leaseId=[leaseId]` route so Finance opens with that Lease in context; do not invent a modal query contract in this pilot.

Pass these permission booleans from exact keys:

```ts
canRecordPayments={context.permissionKeys.has("finance.record_payments")}
canViewFinance={context.permissionKeys.has("finance.view")}
```

The action itself still reauthorizes through `requireFinanceOperationContext`.

- [ ] **Step 6: Run route and screen suites GREEN.**

Run:

```powershell
npm test -- "src/app/(dashboard)/leases/[leaseId]/page.test.tsx" src/features/leases/components/lease-detail-screen.test.tsx
```

Expected: all focused and fallback states pass, and the existing four-section Lease record tests remain green.

- [ ] **Step 7: Run the complete focused subsystem suite.**

Run:

```powershell
npm test -- src/features/leases/lease-detail-route.test.ts "src/app/(dashboard)/leases/[leaseId]/page.test.tsx" src/features/leases/components/lease-detail-screen.test.tsx src/features/leases/components/lease-payment-resolution-view.test.tsx src/features/finance-operations/data/finance-operations.test.ts src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/finance-operations/actions.test.ts
```

Expected: all focused Lease and preserved Finance tests pass.

- [ ] **Step 8: Commit route integration.**

```powershell
git add src/features/leases/components/lease-detail-screen.tsx src/features/leases/components/lease-detail-screen.test.tsx "src/app/(dashboard)/leases/[leaseId]/page.tsx" "src/app/(dashboard)/leases/[leaseId]/page.test.tsx"
git commit -m "feat(leases): guide outstanding rent resolution"
```

---

## Task 6: Verify Layer 2 locally and present browser evidence

**Files:**

- Verify only: all files changed by Tasks 1–5
- Do not create deployment or production files.

**Interfaces:**

- Consumes: the completed local feature branch and existing authenticated localhost fixture.
- Produces: test evidence, responsive browser evidence, and a review checkpoint for the user.

- [ ] **Step 1: Run focused Lease and Finance verification.**

```powershell
npm test -- src/features/leases/lease-detail-route.test.ts "src/app/(dashboard)/leases/[leaseId]/page.test.tsx" src/features/leases/components/lease-detail-screen.test.tsx src/features/leases/components/lease-payment-resolution-view.test.tsx src/features/finance-operations/data/finance-operations.test.ts src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/finance-operations/actions.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run the Layer 1 regression suites touched by the same page shell and Finance surface.**

```powershell
npm test -- src/components/data/interactive-table.test.tsx src/components/data/pagination-controls.test.tsx src/features/documents/components/document-screen.test.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/leases/components/lease-screen.test.tsx src/features/ledger/components/ledger-screen.test.tsx src/features/maintenance/components/maintenance-workspace-ui.test.tsx src/features/people/components/people-screen.test.tsx src/features/properties/components/property-screen.test.tsx src/features/timeline/components/timeline-screen.test.tsx
```

Expected: zero failures.

- [ ] **Step 3: Run static and full local verification.**

```powershell
npx tsc --noEmit
npm run lint
npm test
```

Expected: TypeScript emits no errors, ESLint exits zero, and full Vitest exits zero.

- [ ] **Step 4: Start or reuse the local app and inspect the authenticated focused URL.**

Use a real payable IPS invoice from the local fixture:

```text
http://localhost:3010/leases/[leaseId]?action=record-payment&invoiceId=[invoiceId]
```

At 1440 × 900 and 1280 × 800 verify:

- one H1 and logical H2 order
- Lease identity, one status badge, and one `More` trigger
- `Resolve outstanding rent` and all three textual progress stages
- one wide payment column and one narrow Lease context column with no document-level horizontal overflow
- `Deposit to`, the amount-bearing primary action, and no competing default button
- deposit amount plus correct received state
- `Recent activity`, no `Recent evidence`
- server-provided Upcoming ordering or complete omission
- `Open full lease record` and `Payment is not received` both clear focus

At a mobile width near 390 × 844 verify the Lease context stacks below the form, controls remain reachable, focus indicators remain visible, and there is no horizontal page overflow.

At 200 percent browser zoom verify the form and Lease context reflow without clipped labels or inaccessible actions. Enable reduced motion and confirm the focused state uses immediate transitions with no new animation.

- [ ] **Step 5: Exercise non-happy paths without hosted mutation.**

Verify with fixture data or mocked local state:

- stale invoice ID returns to the normal Lease summary with a concise notice
- paid and voided invoices do not show a payment form
- direct-to-owner invoice links to the existing Finance Lease context
- a role without `finance.record_payments` sees read-only context and no fake disabled form
- a validation error keeps focus state visible and is announced
- receipt publication failure reports `Payment recorded. Receipt unavailable.` as success

Do not create a real hosted payment. If a local fixture payment is recorded for browser verification, use the disposable local database only.

- [ ] **Step 6: Inspect the final diff and worktree state.**

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: no whitespace errors; only the pre-existing `AGENTS.md` modification and untracked Layer 1 plan remain outside committed Layer 2 work.

- [ ] **Step 7: Stop for user browser review.**

Present the focused and normal Lease views, the exact test results, the branch name, and the local commit range. Do not push, merge, deploy, or begin Unit/Property/Person Layer 2 work until the user approves this Lease pilot.
