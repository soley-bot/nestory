"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { createDocumentAction, type DocumentActionState } from "@/features/documents/actions";
import { sha256Hex } from "@/features/documents/content-fingerprint";
import {
  reviewOwnerOpeningBalanceAction,
  submitOwnerOpeningBalanceAction,
  submitOwnerOpeningBalanceCorrectionAction,
} from "@/features/owner-balances/actions";
import {
  OWNER_BALANCE_COMPONENTS,
  OWNER_BALANCE_COMPONENT_LABELS,
  type OpeningBalanceAuthorityData,
  type OwnerBalanceActionState,
  type OwnerOpeningAuthorityGroup,
  type OwnerOpeningComponentRecord,
  type OwnerOpeningEvidence,
  type OwnerOpeningRequestRecord,
} from "@/features/owner-balances/owner-balance.types";
import { cn } from "@/lib/utils";

type Option = { id: string; label: string };

type OpeningBalanceScreenProps = {
  actorUserId: string;
  canReview: boolean;
  canSubmitCorrection: boolean;
  canSubmitInitial: boolean;
  data: OpeningBalanceAuthorityData;
  isSuperAdmin: boolean;
  ownerOptions: Option[];
  propertyOptions: Option[];
  selectedMonth: string;
  selectedOwnerPersonId?: string;
  selectedPropertyId?: string;
};

type OpeningIntent = {
  component: OwnerOpeningComponentRecord;
  group: OwnerOpeningAuthorityGroup;
  mode: "initial" | "correction";
  predecessor: OwnerOpeningRequestRecord | null;
};

type ReviewIntent = {
  decision: "approve" | "reject";
  request: OwnerOpeningRequestRecord;
};

const actionInitialState: OwnerBalanceActionState | Record<string, never> = {};
const documentInitialState: DocumentActionState = {};

export function OpeningBalanceScreen(props: OpeningBalanceScreenProps) {
  const [openingIntent, setOpeningIntent] = useState<OpeningIntent | null>(null);
  const [reviewIntent, setReviewIntent] = useState<ReviewIntent | null>(null);
  const groups = useMemo(() => groupsForScope(props), [props]);
  const labels = useMemo(
    () => ({
      owners: new Map(props.ownerOptions.map((option) => [option.id, option.label])),
      properties: new Map(
        props.propertyOptions.map((option) => [option.id, option.label]),
      ),
    }),
    [props.ownerOptions, props.propertyOptions],
  );
  const eligibleEvidence = useMemo(
    () => collectEligibleEvidence(props.data, props.selectedPropertyId),
    [props.data, props.selectedPropertyId],
  );
  const blockers = props.data.readiness.filter(
    (row) => !props.selectedPropertyId || row.propertyId === props.selectedPropertyId,
  );

  return (
    <section aria-labelledby="opening-authority-heading" className="border-b bg-card">
      <div className="border-b px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-base font-semibold" id="opening-authority-heading">
              Opening authority
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Approved cutover balances with immutable ownership and evidence history.
              Missing authority stays Unknown until independently approved.
            </p>
          </div>
          <form action="/balances" className="grid gap-2 sm:grid-cols-4" method="get">
            <FilterLabel label="Month">
              <MonthPickerField
                ariaLabel="Opening month"
                defaultValue={props.selectedMonth}
                name="month"
                required
              />
            </FilterLabel>
            <FilterLabel label="Property">
              <NativeSelect
                ariaLabel="Opening property"
                defaultValue={props.selectedPropertyId ?? ""}
                name="propertyId"
                options={props.propertyOptions}
                placeholder="All properties"
              />
            </FilterLabel>
            <FilterLabel label="Owner">
              <NativeSelect
                ariaLabel="Opening owner"
                defaultValue={props.selectedOwnerPersonId ?? ""}
                name="ownerPersonId"
                options={props.ownerOptions}
                placeholder="All owners"
              />
            </FilterLabel>
            <Button className="self-end" type="submit" variant="outline">
              Apply
            </Button>
          </form>
        </div>
      </div>

      {blockers.length > 0 ? (
        <div aria-live="polite" className="border-b bg-amber-500/5 px-4 py-3 sm:px-6">
          {blockers.map((blocker) => (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" key={`${blocker.propertyId}-${blocker.boundaryDate}`}>
              <strong>Ownership setup required</strong>
              <span className="text-muted-foreground">
                {labels.properties.get(blocker.propertyId) ?? "Selected property"}: {blocker.ownershipPercentTotal}% assigned ({humanize(blocker.issueCode)}).
              </span>
              {props.isSuperAdmin ? (
                <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/properties/${blocker.propertyId}#property-ownership`}>
                  Resolve ownership
                </Link>
              ) : (
                <span className="font-medium">Ask a Super Admin to correct the ownership facts.</span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div
        aria-label="Opening authority components"
        className="overflow-x-auto"
        role="region"
        tabIndex={0}
      >
        <table className="w-full min-w-[1120px] border-collapse text-sm">
          <thead className="bg-[var(--table-header-bg)] text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium sm:px-6">Property / owner</th>
              <th className="px-3 py-2 font-medium">Component</th>
              <th className="px-3 py-2 font-medium">Authority</th>
              <th className="px-3 py-2 font-medium">Workflow &amp; lineage</th>
              <th className="px-3 py-2 font-medium">Evidence &amp; ownership</th>
              <th className="px-4 py-2 text-right font-medium sm:px-6">Action</th>
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((group) =>
              group.components.map((component, index) => (
                <OpeningRow
                  actorUserId={props.actorUserId}
                  canReview={props.canReview}
                  canSubmitCorrection={props.canSubmitCorrection}
                  canSubmitInitial={props.canSubmitInitial}
                  component={component}
                  group={group}
                  key={`${group.propertyId}-${group.ownerPersonId}-${component.component}`}
                  labels={labels}
                  onOpen={(intent) => setOpeningIntent(intent)}
                  onReview={(intent) => setReviewIntent(intent)}
                  showIdentity={index === 0}
                />
              )),
            )}
          </tbody>
        </table>
        {groups.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">
            Choose a property and owner to prepare the four opening components, or adjust the filters to inspect existing requests.
          </div>
        ) : null}
      </div>

      {openingIntent ? (
        <OpeningFormModal
          eligibleEvidence={eligibleEvidence.filter(
            (evidence) => evidence.propertyId === openingIntent.group.propertyId,
          )}
          intent={openingIntent}
          isSuperAdmin={props.isSuperAdmin}
          onClose={() => setOpeningIntent(null)}
        />
      ) : null}
      {reviewIntent ? (
        <ReviewFormModal
          intent={reviewIntent}
          onClose={() => setReviewIntent(null)}
        />
      ) : null}
    </section>
  );
}

function OpeningRow({
  actorUserId,
  canReview,
  canSubmitCorrection,
  canSubmitInitial,
  component,
  group,
  labels,
  onOpen,
  onReview,
  showIdentity,
}: {
  actorUserId: string;
  canReview: boolean;
  canSubmitCorrection: boolean;
  canSubmitInitial: boolean;
  component: OwnerOpeningComponentRecord;
  group: OwnerOpeningAuthorityGroup;
  labels: { owners: Map<string, string>; properties: Map<string, string> };
  onOpen: (intent: OpeningIntent) => void;
  onReview: (intent: ReviewIntent) => void;
  showIdentity: boolean;
}) {
  const latestRejected = [...component.requests]
    .reverse()
    .find((request) => request.status === "rejected");
  const submitted = component.requests.filter((request) => request.status === "submitted");
  const pendingCorrection = submitted.some(
    (request) =>
      request.requestKind === "correction" &&
      request.correctionOfEntryId === component.currentAuthorityEntryId,
  );
  const pendingInitial = submitted.some((request) => request.requestKind === "initial");
  const canResubmit =
    latestRejected &&
    ((latestRejected.requestKind === "initial" && canSubmitInitial) ||
      (latestRejected.requestKind === "correction" &&
        canSubmitCorrection &&
        latestRejected.correctionOfEntryId === component.currentAuthorityEntryId));
  const evidence = component.requests.find((request) => request.evidence)?.evidence;
  const ownership = component.requests.at(-1) ?? null;

  return (
    <tr className="border-b align-top">
      <td className="px-4 py-3 sm:px-6">
        {showIdentity ? (
          <div>
            <p className="font-medium">{labels.properties.get(group.propertyId) ?? group.propertyId}</p>
            <p className="text-xs text-muted-foreground">{labels.owners.get(group.ownerPersonId) ?? group.ownerPersonId}</p>
            <p className="mt-1 text-xs text-muted-foreground">{group.effectiveDate} · {group.currency}</p>
          </div>
        ) : (
          <span className="sr-only">Same property and owner</span>
        )}
      </td>
      <td className="px-3 py-3 font-medium">{OWNER_BALANCE_COMPONENT_LABELS[component.component]}</td>
      <td className="px-3 py-3">
        {component.authority.state === "unknown" ? (
          <StatusPill tone="neutral">Unknown</StatusPill>
        ) : (
          <div className="space-y-1">
            <p className="font-mono font-semibold tabular-nums">{formatUsd(component.authority.amount)}</p>
            {component.authority.knownZero ? <StatusPill tone="success">Known zero</StatusPill> : <StatusPill tone="success">Known</StatusPill>}
            <p className="text-xs text-muted-foreground">{component.authority.entryCount} immutable {component.authority.entryCount === 1 ? "entry" : "entries"}</p>
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="space-y-2">
          {component.requests.length === 0 ? <span className="text-muted-foreground">No request</span> : null}
          {component.requests.map((request) => (
            <details key={request.id} open={request.status === "submitted"}>
              <summary className="cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {capitalize(request.status)} {request.requestKind}
              </summary>
              <div className="mt-1 space-y-1 pl-2 text-xs text-muted-foreground">
                <p>Submitted {shortDate(request.submittedAt)} by {shortId(request.submittedBy)}</p>
                {request.reviewedAt ? <p>Reviewed {shortDate(request.reviewedAt)} by {shortId(request.reviewedBy)}</p> : null}
                {request.reviewReason ? <p>{request.reviewReason}</p> : null}
                {request.resubmissionOfRequestId ? <p>Resubmission of rejected request</p> : null}
              </div>
            </details>
          ))}
          {component.entries.map((entry) => (
            <p className="text-xs text-muted-foreground" key={entry.id}>
              {entry.entryKind === "correction_reversal"
                ? "Reversal of opening entry"
                : entry.entryKind === "correction_replacement"
                  ? "Current replacement"
                  : "Opening entry"}{" "}
              <span className="font-mono tabular-nums">{entry.signedAmount}</span>
            </p>
          ))}
        </div>
      </td>
      <td className="px-3 py-3">
        {ownership ? (
          <div className="space-y-1 text-xs">
            <p><span className="text-muted-foreground">Ownership:</span> {ownership.ownershipPercentSnapshot}%</p>
            <p className="text-muted-foreground">Roster {ownership.ownershipRosterHash.slice(0, 8)}</p>
            {evidence ? (
              <>
                <p className="font-medium">{evidence.fileName}</p>
                <p className="max-w-64 break-all font-mono text-muted-foreground">{evidence.contentSha256}</p>
              </>
            ) : (
              <p className="text-muted-foreground">Reference: {ownership.sourceReference ?? "Document unavailable"}</p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">Captured on submission</span>
        )}
      </td>
      <td className="px-4 py-3 text-right sm:px-6">
        <div className="flex flex-col items-end gap-2">
          {component.authority.state === "unknown" && !pendingInitial && canSubmitInitial ? (
            <Button onClick={() => onOpen({ component, group, mode: "initial", predecessor: null })} size="sm">
              Submit opening balance
            </Button>
          ) : null}
          {component.authority.state === "known" && component.currentAuthorityEntryId && !pendingInitial && !pendingCorrection && canSubmitCorrection ? (
            <Button onClick={() => onOpen({ component, group, mode: "correction", predecessor: null })} size="sm" variant="outline">
              Request correction
            </Button>
          ) : null}
          {canResubmit && latestRejected ? (
            <Button onClick={() => onOpen({ component, group, mode: latestRejected.requestKind, predecessor: latestRejected })} size="sm" variant="outline">
              Resubmit rejected opening
            </Button>
          ) : null}
          {submitted.map((request) =>
            request.submittedBy === actorUserId ? (
              <span className="text-xs text-muted-foreground" key={request.id}>Independent review required</span>
            ) : canReview ? (
              <div className="flex gap-1" key={request.id}>
                <Button aria-label="Approve opening balance" onClick={() => onReview({ decision: "approve", request })} size="sm">Approve</Button>
                <Button aria-label="Reject opening balance" onClick={() => onReview({ decision: "reject", request })} size="sm" variant="outline">Reject</Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground" key={request.id}>Awaiting Super Admin review</span>
            ),
          )}
        </div>
      </td>
    </tr>
  );
}

function OpeningFormModal({
  eligibleEvidence,
  intent,
  isSuperAdmin,
  onClose,
}: {
  eligibleEvidence: Array<OwnerOpeningEvidence & { propertyId: string }>;
  intent: OpeningIntent;
  isSuperAdmin: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const action = intent.mode === "initial" ? submitOwnerOpeningBalanceAction : submitOwnerOpeningBalanceCorrectionAction;
  const [state, formAction, pending] = useActionState(action, actionInitialState);
  const [evidence, setEvidence] = useState<OwnerOpeningEvidence | null>(() =>
    intent.predecessor?.evidence ?? eligibleEvidence[0] ?? null,
  );
  const [localHash, setLocalHash] = useState("");
  const idempotencyKey = useMemo(
    () => `owner-opening-${intent.mode}-${crypto.randomUUID()}`,
    [intent.mode],
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      onClose();
    }
  }, [onClose, router, state.status]);

  const evidenceHash = evidence?.contentSha256 ?? localHash;
  const currentAmount = intent.component.authority.state === "known" ? intent.component.authority.amount : "";

  return (
    <Modal
      description={`${OWNER_BALANCE_COMPONENT_LABELS[intent.component.component]} · ${intent.group.effectiveDate}`}
      onClose={onClose}
      open
      title={intent.mode === "initial" ? "Submit opening balance" : "Request opening correction"}
    >
      <div className="space-y-5 p-4 sm:p-6">
        {isSuperAdmin ? (
          <EvidenceUploadForm
            group={intent.group}
            onRegistered={(registered) => {
              setEvidence(registered);
              setLocalHash("");
            }}
          />
        ) : null}

        <form action={formAction} className="space-y-4">
          {intent.mode === "initial" ? (
            <>
              <Hidden name="component" value={intent.component.component} />
              <Hidden name="currency" value={intent.group.currency} />
              <Hidden name="effectiveDate" value={intent.group.effectiveDate} />
              <Hidden name="ownerPersonId" value={intent.group.ownerPersonId} />
              <Hidden name="propertyId" value={intent.group.propertyId} />
            </>
          ) : (
            <Hidden name="entryId" value={intent.component.currentAuthorityEntryId ?? intent.predecessor?.correctionOfEntryId ?? ""} />
          )}
          <Hidden name="evidenceSha256" value={evidenceHash ?? ""} />
          <Hidden name="idempotencyKey" value={idempotencyKey} />
          <Hidden name="resubmissionOfRequestId" value={intent.predecessor?.id ?? ""} />
          <Hidden name="supportingDocumentId" value={evidence?.id ?? ""} />

          <Field label={intent.mode === "initial" ? "Opening amount" : "Replacement amount"}>
            <Input
              defaultValue={intent.predecessor?.proposedAmount ?? currentAmount}
              inputMode="decimal"
              name={intent.mode === "initial" ? "amount" : "replacementAmount"}
              required
              type="text"
            />
          </Field>
          <Field label="Reason">
            <Input defaultValue={intent.predecessor?.reason ?? ""} maxLength={500} minLength={3} name="reason" required />
          </Field>
          <Field label="Existing eligible evidence">
            <select
              aria-label="Existing eligible evidence"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => {
                setEvidence(eligibleEvidence.find((item) => item.id === event.target.value) ?? null);
                setLocalHash("");
              }}
              value={evidence?.id ?? ""}
            >
              <option value="">Use file fingerprint and source reference</option>
              {eligibleEvidence.map((item) => <option key={item.id} value={item.id}>{item.fileName} · {item.contentSha256?.slice(0, 10)}</option>)}
            </select>
          </Field>
          <Field label="Evidence file">
            <Input
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setEvidence(null);
                setLocalHash(await sha256Hex(await file.arrayBuffer()));
              }}
              type="file"
            />
          </Field>
          {evidenceHash ? <p className="break-all font-mono text-xs text-muted-foreground">Fingerprint {evidenceHash}</p> : <p className="text-xs text-muted-foreground">Choose registered evidence or a real file to compute its fingerprint.</p>}
          <Field label="Source reference">
            <Input defaultValue={intent.predecessor?.sourceReference ?? ""} maxLength={240} minLength={3} name="sourceReference" />
          </Field>

          {state.status === "error" ? <p className="text-sm text-destructive" role="alert">{state.message}</p> : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
            <Button disabled={pending || !evidenceHash} type="submit">{pending ? "Submitting…" : "Submit for review"}</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function EvidenceUploadForm({
  group,
  onRegistered,
}: {
  group: OwnerOpeningAuthorityGroup;
  onRegistered: (evidence: OwnerOpeningEvidence) => void;
}) {
  const [state, action, pending] = useActionState(createDocumentAction, documentInitialState);

  useEffect(() => {
    if (state.status === "success" && state.documentId && state.contentSha256 && state.fileName) {
      onRegistered({
        archivedAt: null,
        category: "owner_opening_balance_evidence",
        contentSha256: state.contentSha256,
        fileName: state.fileName,
        hashMatchesRequest: true,
        id: state.documentId,
        storagePath: "",
      });
    }
  }, [onRegistered, state]);

  return (
    <form action={action} className="rounded-md border bg-muted/30 p-3">
      <p className="text-sm font-medium">Upload and register evidence</p>
      <p className="mt-0.5 text-xs text-muted-foreground">The checked document action hashes the actual bytes and registers an immutable document.</p>
      <Hidden name="category" value="owner_opening_balance_evidence" />
      <Hidden name="leaseId" value="" />
      <Hidden name="propertyId" value={group.propertyId} />
      <Hidden name="taskId" value="" />
      <Hidden name="unitId" value="" />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input aria-label="Upload evidence document" accept="application/pdf,image/jpeg,image/png,image/webp" name="document" required type="file" />
        <Button disabled={pending} type="submit" variant="outline">{pending ? "Registering…" : "Register file"}</Button>
      </div>
      {state.status === "error" ? <p className="mt-2 text-xs text-destructive" role="alert">{state.message ?? "Evidence could not be registered."}</p> : null}
      {state.status === "success" ? <p className="mt-2 text-xs text-emerald-700" role="status">Registered {state.fileName}.</p> : null}
    </form>
  );
}

function ReviewFormModal({ intent, onClose }: { intent: ReviewIntent; onClose: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(reviewOwnerOpeningBalanceAction, actionInitialState);
  const idempotencyKey = useMemo(() => `owner-opening-review-${crypto.randomUUID()}`, []);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      onClose();
    }
  }, [onClose, router, state.status]);

  return (
    <Modal description="The database revalidates evidence, ownership, month state, and independent review." onClose={onClose} open title={intent.decision === "approve" ? "Approve opening balance" : "Reject opening balance"}>
      <form action={action} className="space-y-4 p-4 sm:p-6">
        <Hidden name="decision" value={intent.decision} />
        <Hidden name="idempotencyKey" value={idempotencyKey} />
        <Hidden name="requestId" value={intent.request.id} />
        <p className="text-sm">{formatUsd(intent.request.proposedAmount)} · {capitalize(intent.request.requestKind)} request</p>
        <Field label="Review reason">
          <Input maxLength={500} minLength={3} name="reviewReason" required={intent.decision === "reject"} />
        </Field>
        {state.status === "error" ? <p className="text-sm text-destructive" role="alert">{state.message}</p> : null}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button disabled={pending} type="submit">{pending ? "Saving…" : intent.decision === "approve" ? "Approve" : "Reject"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function groupsForScope(props: OpeningBalanceScreenProps) {
  if (props.data.groups.length > 0 || !props.selectedPropertyId || !props.selectedOwnerPersonId) {
    return props.data.groups;
  }
  return [{
    components: OWNER_BALANCE_COMPONENTS.map((component) => ({
      authority: { state: "unknown" as const },
      component,
      currentAuthorityEntryId: null,
      entries: [],
      requests: [],
    })),
    currency: "USD",
    effectiveDate: `${props.selectedMonth}-01`,
    organizationId: "",
    ownerPersonId: props.selectedOwnerPersonId,
    propertyId: props.selectedPropertyId,
  } satisfies OwnerOpeningAuthorityGroup];
}

function collectEligibleEvidence(data: OpeningBalanceAuthorityData, selectedPropertyId?: string) {
  const byId = new Map<string, OwnerOpeningEvidence & { propertyId: string }>();
  for (const group of data.groups) {
    if (selectedPropertyId && group.propertyId !== selectedPropertyId) continue;
    for (const component of group.components) {
      for (const request of component.requests) {
        const evidence = request.evidence;
        if (
          evidence?.contentSha256 &&
          evidence.archivedAt === null &&
          evidence.hashMatchesRequest &&
          evidence.category === "owner_opening_balance_evidence"
        ) {
          byId.set(evidence.id, { ...evidence, propertyId: group.propertyId });
        }
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.fileName.localeCompare(b.fileName) || a.id.localeCompare(b.id));
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="grid gap-1.5 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function FilterLabel({ children, label }: { children: ReactNode; label: string }) {
  return <label className="grid min-w-36 gap-1 text-xs font-medium text-muted-foreground"><span>{label}</span>{children}</label>;
}

function NativeSelect({ ariaLabel, defaultValue, name, options, placeholder }: { ariaLabel: string; defaultValue: string; name: string; options: Option[]; placeholder: string }) {
  return (
    <select aria-label={ariaLabel} className="h-8 min-w-36 rounded-md border border-input bg-card px-2 text-sm text-foreground" defaultValue={defaultValue} name={name}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  );
}

function Hidden({ name, value }: { name: string; value: string }) {
  return <input name={name} type="hidden" value={value} />;
}

function StatusPill({ children, tone }: { children: ReactNode; tone: "neutral" | "success" }) {
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", tone === "success" ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-700" : "border-border bg-muted text-muted-foreground")}>{children}</span>;
}

function formatUsd(value: string) {
  return value.startsWith("-") ? `-$${value.slice(1)}` : `$${value}`;
}

function shortId(value: string | null) {
  return value ? value.slice(0, 8) : "—";
}

function shortDate(value: string) {
  return value.slice(0, 10);
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}
