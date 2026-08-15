"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuditDetails } from "@/components/ui/audit-details";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { sha256Hex } from "@/features/documents/content-fingerprint";
import {
  reviewOwnerOpeningBalanceAction,
  submitOwnerOpeningBalanceAction,
  submitOwnerOpeningBalanceCorrectionAction,
} from "@/features/owner-balances/actions";
import {
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

type DetailsIntent = {
  component: OwnerOpeningComponentRecord;
  group: OwnerOpeningAuthorityGroup;
};

const actionInitialState: OwnerBalanceActionState | Record<string, never> = {};

export function OpeningBalanceScreen(props: OpeningBalanceScreenProps) {
  const [detailsIntent, setDetailsIntent] = useState<DetailsIntent | null>(
    null,
  );
  const [openingIntent, setOpeningIntent] = useState<OpeningIntent | null>(
    null,
  );
  const [reviewIntent, setReviewIntent] = useState<ReviewIntent | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const statusRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupsForScope(props), [props]);
  const labels = useMemo(
    () => ({
      owners: new Map(
        props.ownerOptions.map((option) => [option.id, option.label]),
      ),
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
    (row) =>
      !props.selectedPropertyId || row.propertyId === props.selectedPropertyId,
  );
  const handleSuccess = useCallback((message: string) => {
    setOpeningIntent(null);
    setReviewIntent(null);
    setAnnouncement(message);
  }, []);

  useEffect(() => {
    if (announcement) statusRef.current?.focus();
  }, [announcement]);

  return (
    <section
      aria-labelledby="opening-authority-heading"
      className="bg-background"
    >
      <div className="border-b px-4 py-3 sm:px-6">
        <h2 className="text-base font-semibold" id="opening-authority-heading">
          Opening balances
        </h2>
      </div>

      <div
        aria-atomic="true"
        aria-live="polite"
        className={cn(
          "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          announcement
            ? "border-b bg-success-soft px-4 py-3 text-sm font-medium text-success sm:px-6"
            : "sr-only",
        )}
        ref={statusRef}
        role="status"
        tabIndex={-1}
      >
        {announcement}
      </div>

      {blockers.length > 0 ? (
        <div
          aria-live="polite"
          className="border-b bg-warning-soft px-4 py-3 sm:px-6"
        >
          {blockers.map((blocker) => (
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
              key={`${blocker.propertyId}-${blocker.boundaryDate}-${blocker.issueCode}`}
            >
              <strong>Ownership setup required</strong>
              <span className="text-muted-foreground">
                {labels.properties.get(blocker.propertyId) ??
                  "Selected property"}
                : {blocker.ownershipPercentTotal}% assigned.
              </span>
              {props.isSuperAdmin ? (
                <Link
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  href={`/properties/${blocker.propertyId}#property-ownership`}
                >
                  Resolve ownership
                </Link>
              ) : (
                <span className="font-medium">
                  Ask a Super Admin to correct the ownership facts.
                </span>
              )}
              <AuditDetails
                entries={[{ label: "Issue code", value: blocker.issueCode }]}
                label="Technical details"
              />
            </div>
          ))}
        </div>
      ) : null}

      <div
        aria-label="Opening balance components"
        className="overflow-x-auto"
        data-slot="opening-authority-components"
        role="region"
        tabIndex={0}
      >
        <table className="w-full min-w-[680px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[28%]" />
            <col className="w-[22%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead className="bg-[var(--table-header-bg)] text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium sm:px-6">
                Property / owner
              </th>
              <th className="px-3 py-2 font-medium">Component</th>
              <th className="px-3 py-2 font-medium">Balance</th>
              <th className="px-4 py-2 text-right font-medium sm:px-6">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((group) =>
              group.components.map((component, index) => (
                <OpeningRow
                  component={component}
                  group={group}
                  key={`${group.propertyId}-${group.ownerPersonId}-${component.component}`}
                  labels={labels}
                  onView={(intent) => setDetailsIntent(intent)}
                  showIdentity={index === 0}
                />
              )),
            )}
          </tbody>
        </table>
        {groups.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">
            {blockers.length > 0
              ? "Resolve the ownership details before submitting the opening balance."
              : "No effective property-owner assignments match this month and filter scope."}
          </div>
        ) : null}
      </div>

      {detailsIntent ? (
        <OpeningDetailsModal
          actorUserId={props.actorUserId}
          canReview={props.canReview}
          canSubmitCorrection={props.canSubmitCorrection}
          canSubmitInitial={props.canSubmitInitial}
          intent={detailsIntent}
          labels={labels}
          onClose={() => setDetailsIntent(null)}
          onOpen={(intent) => {
            setDetailsIntent(null);
            setOpeningIntent(intent);
          }}
          onReview={(intent) => {
            setDetailsIntent(null);
            setReviewIntent(intent);
          }}
        />
      ) : null}

      {openingIntent ? (
        <OpeningFormModal
          eligibleEvidence={eligibleEvidence.filter(
            (evidence) =>
              evidence.propertyId === openingIntent.group.propertyId,
          )}
          intent={openingIntent}
          isSuperAdmin={props.isSuperAdmin}
          onClose={() => setOpeningIntent(null)}
          onSuccess={handleSuccess}
        />
      ) : null}
      {reviewIntent ? (
        <ReviewFormModal
          intent={reviewIntent}
          onClose={() => setReviewIntent(null)}
          onSuccess={handleSuccess}
        />
      ) : null}
    </section>
  );
}

function OpeningRow({
  component,
  group,
  labels,
  onView,
  showIdentity,
}: {
  component: OwnerOpeningComponentRecord;
  group: OwnerOpeningAuthorityGroup;
  labels: { owners: Map<string, string>; properties: Map<string, string> };
  onView: (intent: DetailsIntent) => void;
  showIdentity: boolean;
}) {
  const currentRequest = component.requests[0] ?? null;

  return (
    <tr className="border-b align-middle">
      <td className="px-4 py-3 sm:px-6">
        {showIdentity ? (
          <div>
            <p className="font-medium">
              {labels.properties.get(group.propertyId) ?? group.propertyId}
            </p>
            <p className="text-xs text-muted-foreground">
              {labels.owners.get(group.ownerPersonId) ?? group.ownerPersonId}
            </p>
          </div>
        ) : (
          <span className="sr-only">Same property and owner</span>
        )}
      </td>
      <td className="px-3 py-3 font-medium">
        {OWNER_BALANCE_COMPONENT_LABELS[component.component]}
      </td>
      <td className="px-3 py-3">
        {component.authority.state === "unknown" ? (
          <div className="space-y-1">
            <StatusPill tone="neutral">Unknown</StatusPill>
            {currentRequest ? (
              <p className="text-xs text-muted-foreground">
                {capitalize(currentRequest.status)} {currentRequest.requestKind}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-mono font-semibold tabular-nums">
              {formatUsd(component.authority.amount)}
            </p>
            {component.authority.knownZero ? (
              <StatusPill tone="success">Approved zero</StatusPill>
            ) : (
              <StatusPill tone="success">Approved</StatusPill>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right sm:px-6">
        <Button
          aria-label={`View opening balance details for ${OWNER_BALANCE_COMPONENT_LABELS[component.component]}`}
          onClick={() => onView({ component, group })}
          size="sm"
          variant="outline"
        >
          View
        </Button>
      </td>
    </tr>
  );
}

function OpeningDetailsModal({
  actorUserId,
  canReview,
  canSubmitCorrection,
  canSubmitInitial,
  intent,
  labels,
  onClose,
  onOpen,
  onReview,
}: {
  actorUserId: string;
  canReview: boolean;
  canSubmitCorrection: boolean;
  canSubmitInitial: boolean;
  intent: DetailsIntent;
  labels: { owners: Map<string, string>; properties: Map<string, string> };
  onClose: () => void;
  onOpen: (intent: OpeningIntent) => void;
  onReview: (intent: ReviewIntent) => void;
}) {
  const { component, group } = intent;
  const currentRequest = component.requests[0] ?? null;
  const currentRejected =
    currentRequest?.status === "rejected" ? currentRequest : null;
  const currentSubmitted =
    currentRequest?.status === "submitted" ? currentRequest : null;
  const canResubmit =
    group.rosterState === "ready" &&
    currentRejected &&
    ((currentRejected.requestKind === "initial" && canSubmitInitial) ||
      (currentRejected.requestKind === "correction" &&
        canSubmitCorrection &&
        currentRejected.correctionOfEntryId ===
          component.currentAuthorityEntryId));
  const evidence = currentRequest?.evidence ?? null;

  return (
    <Modal
      description={`${labels.properties.get(group.propertyId) ?? group.propertyId} · ${labels.owners.get(group.ownerPersonId) ?? group.ownerPersonId}`}
      onClose={onClose}
      open
      title="Opening balance details"
    >
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">
              {OWNER_BALANCE_COMPONENT_LABELS[component.component]}
            </p>
            <p className="text-sm text-muted-foreground">
              {group.effectiveDate} · {group.currency}
            </p>
          </div>
          {component.authority.state === "known" ? (
            <div className="text-right">
              <p className="font-mono font-semibold tabular-nums">
                {formatUsd(component.authority.amount)}
              </p>
              <StatusPill tone="success">
                {component.authority.knownZero ? "Approved zero" : "Approved"}
              </StatusPill>
            </div>
          ) : (
            <StatusPill tone="neutral">Unknown</StatusPill>
          )}
        </div>

        <section className="border-y border-border py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Request history
          </h3>
          <div className="mt-2 space-y-3 text-sm">
            {component.requests.length === 0 ? (
              <p className="text-muted-foreground">No request</p>
            ) : (
              component.requests.map((request, index) => (
                <div key={request.id}>
                  <p className="font-medium">
                    {index === 0 ? "Current — " : "Earlier request — "}
                    {capitalize(request.status)} {request.requestKind}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Submitted {shortDate(request.submittedAt)}
                    {request.reviewedAt
                      ? ` · Reviewed ${shortDate(request.reviewedAt)}`
                      : ""}
                  </p>
                  {request.reviewReason ? (
                    <p className="text-xs text-muted-foreground">
                      {request.reviewReason}
                    </p>
                  ) : null}
                  {request.resubmissionOfRequestId ? (
                    <p className="text-xs text-muted-foreground">
                      Resubmission of rejected request
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>

        {currentRequest ? (
          <section className="space-y-2 text-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Evidence
            </h3>
            <p>
              <span className="text-muted-foreground">Ownership:</span>{" "}
              {currentRequest.ownershipPercentSnapshot}%
            </p>
            <p className="font-medium">
              {evidence?.fileName ??
                currentRequest.sourceReference ??
                "Document unavailable"}
            </p>
            <AuditDetails
              entries={[
                {
                  label: "Ownership hash",
                  value: currentRequest.ownershipRosterHash,
                },
                {
                  label: "Evidence fingerprint",
                  value: evidence?.contentSha256,
                },
              ]}
            />
          </section>
        ) : null}

        {component.entries.length > 0 ? (
          <details className="border-t border-border pt-3">
            <summary className="cursor-pointer text-sm font-medium">
              Balance entry history ({component.entries.length})
            </summary>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {component.entries.map((entry) => (
                <p key={entry.id}>
                  {entry.entryKind === "correction_reversal"
                    ? "Reversal of opening entry"
                    : entry.entryKind === "correction_replacement"
                      ? "Current replacement"
                      : "Opening entry"}{" "}
                  <span className="font-mono tabular-nums">
                    {entry.signedAmount}
                  </span>
                </p>
              ))}
            </div>
          </details>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {group.rosterState === "ready" &&
            component.authority.state === "unknown" &&
            !currentRequest &&
            canSubmitInitial ? (
              <Button
                onClick={() =>
                  onOpen({
                    component,
                    group,
                    mode: "initial",
                    predecessor: null,
                  })
                }
              >
                Submit opening balance
              </Button>
            ) : null}
            {group.rosterState === "ready" &&
            component.authority.state === "known" &&
            component.currentAuthorityEntryId &&
            currentRequest?.status !== "submitted" &&
            currentRequest?.status !== "rejected" &&
            canSubmitCorrection ? (
              <Button
                onClick={() =>
                  onOpen({
                    component,
                    group,
                    mode: "correction",
                    predecessor: null,
                  })
                }
                variant="outline"
              >
                Request correction
              </Button>
            ) : null}
            {canResubmit && currentRejected ? (
              <Button
                onClick={() =>
                  onOpen({
                    component,
                    group,
                    mode: currentRejected.requestKind,
                    predecessor: currentRejected,
                  })
                }
                variant="outline"
              >
                Resubmit rejected opening
              </Button>
            ) : null}
            {currentSubmitted ? (
              currentSubmitted.submittedBy === actorUserId ? (
                <span className="self-center text-xs text-muted-foreground">
                  Independent review required
                </span>
              ) : canReview ? (
                <>
                  <Button
                    aria-label="Reject opening balance"
                    onClick={() =>
                      onReview({
                        decision: "reject",
                        request: currentSubmitted,
                      })
                    }
                    variant="outline"
                  >
                    Reject
                  </Button>
                  <Button
                    aria-label="Approve opening balance"
                    onClick={() =>
                      onReview({
                        decision: "approve",
                        request: currentSubmitted,
                      })
                    }
                  >
                    Approve
                  </Button>
                </>
              ) : (
                <span className="self-center text-xs text-muted-foreground">
                  Awaiting Super Admin review
                </span>
              )
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function OpeningFormModal({
  eligibleEvidence,
  intent,
  isSuperAdmin,
  onClose,
  onSuccess,
}: {
  eligibleEvidence: Array<OwnerOpeningEvidence & { propertyId: string }>;
  intent: OpeningIntent;
  isSuperAdmin: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const action =
    intent.mode === "initial"
      ? submitOwnerOpeningBalanceAction
      : submitOwnerOpeningBalanceCorrectionAction;
  const [state, formAction, pending] = useActionState(
    action,
    actionInitialState,
  );
  const [evidence, setEvidence] = useState<OwnerOpeningEvidence | null>(
    () => intent.predecessor?.evidence ?? eligibleEvidence[0] ?? null,
  );
  const [localHash, setLocalHash] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [amount, setAmount] = useState(
    intent.predecessor?.proposedAmount ??
      (intent.component.authority.state === "known"
        ? intent.component.authority.amount
        : ""),
  );
  const [reasonValue, setReasonValue] = useState(
    intent.predecessor?.reason ?? "",
  );
  const [sourceReference, setSourceReference] = useState(
    intent.predecessor?.sourceReference ?? "",
  );
  const idempotencyKey = useMemo(
    () => `owner-opening-${intent.mode}-${crypto.randomUUID()}`,
    [intent.mode],
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      onSuccess(state.message);
    }
  }, [onSuccess, router, state]);

  const evidenceHash = evidence?.contentSha256 ?? localHash;
  return (
    <Modal
      description={`${OWNER_BALANCE_COMPONENT_LABELS[intent.component.component]} · ${intent.group.effectiveDate}`}
      onClose={onClose}
      open
      title={
        intent.mode === "initial"
          ? "Submit opening balance"
          : "Request opening correction"
      }
    >
      <div className="space-y-5 p-4 sm:p-6">
        <form
          action={(formData) => {
            if (isSuperAdmin && evidenceFile)
              formData.set("evidenceFile", evidenceFile);
            formAction(formData);
          }}
          className="space-y-4"
        >
          {intent.mode === "initial" ? (
            <>
              <Hidden name="component" value={intent.component.component} />
              <Hidden name="currency" value={intent.group.currency} />
              <Hidden name="effectiveDate" value={intent.group.effectiveDate} />
              <Hidden name="ownerPersonId" value={intent.group.ownerPersonId} />
              <Hidden name="propertyId" value={intent.group.propertyId} />
            </>
          ) : (
            <>
              <Hidden
                name="entryId"
                value={
                  intent.component.currentAuthorityEntryId ??
                  intent.predecessor?.correctionOfEntryId ??
                  ""
                }
              />
              <Hidden name="propertyId" value={intent.group.propertyId} />
            </>
          )}
          <Hidden name="evidenceSha256" value={evidenceHash ?? ""} />
          <Hidden name="idempotencyKey" value={idempotencyKey} />
          <Hidden
            name="resubmissionOfRequestId"
            value={intent.predecessor?.id ?? ""}
          />
          <Hidden name="supportingDocumentId" value={evidence?.id ?? ""} />

          <Field
            label={
              intent.mode === "initial"
                ? "Opening amount"
                : "Replacement amount"
            }
          >
            <Input
              inputMode="decimal"
              name={intent.mode === "initial" ? "amount" : "replacementAmount"}
              onChange={(event) => setAmount(event.target.value)}
              required
              type="text"
              value={amount}
            />
          </Field>
          <Field label="Reason">
            <Input
              maxLength={500}
              minLength={3}
              name="reason"
              onChange={(event) => setReasonValue(event.target.value)}
              required
              value={reasonValue}
            />
          </Field>
          <Field label="Existing eligible evidence">
            <select
              aria-label="Existing eligible evidence"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => {
                setEvidence(
                  eligibleEvidence.find(
                    (item) => item.id === event.target.value,
                  ) ?? null,
                );
                setEvidenceFile(null);
                setLocalHash("");
              }}
              value={evidence?.id ?? ""}
            >
              <option value="">Use an evidence file or reference</option>
              {eligibleEvidence.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fileName}
                </option>
              ))}
            </select>
          </Field>
          {isSuperAdmin ? (
            <Field label="Evidence file">
              <Input
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={async (event) => {
                  const file = event.target.files?.[0] ?? null;
                  setEvidenceFile(file);
                  if (!file) return;
                  setEvidence(null);
                  setLocalHash(await sha256Hex(await file.arrayBuffer()));
                }}
                type="file"
              />
            </Field>
          ) : null}
          {evidenceFile ? (
            <p className="text-xs font-medium">
              {evidenceFile.name} ready for final submission
            </p>
          ) : null}
          {!evidence ? (
            <details>
              <summary className="w-fit cursor-pointer text-sm font-medium">
                Audit evidence
              </summary>
              <div className="mt-3">
                <Field label="Evidence file fingerprint">
                  <Input
                    maxLength={64}
                    minLength={64}
                    name="sourceSnapshotFingerprint"
                    onChange={(event) => setLocalHash(event.target.value)}
                    readOnly={Boolean(evidenceFile)}
                    value={localHash}
                  />
                </Field>
              </div>
            </details>
          ) : null}
          {evidenceHash ? (
            <AuditDetails
              entries={[{ label: "Evidence fingerprint", value: evidenceHash }]}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Choose registered evidence, upload a file, or add the audit
              fingerprint.
            </p>
          )}
          <Field label="Source reference">
            <Input
              maxLength={240}
              minLength={3}
              name="sourceReference"
              onChange={(event) => setSourceReference(event.target.value)}
              value={sourceReference}
            />
          </Field>

          {state.status === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              {state.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button onClick={onClose} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={pending || !evidenceHash} type="submit">
              {pending ? "Submitting…" : "Submit for review"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function ReviewFormModal({
  intent,
  onClose,
  onSuccess,
}: {
  intent: ReviewIntent;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    reviewOwnerOpeningBalanceAction,
    actionInitialState,
  );
  const idempotencyKey = useMemo(
    () => `owner-opening-review-${crypto.randomUUID()}`,
    [],
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      onSuccess(state.message);
    }
  }, [onSuccess, router, state]);

  return (
    <Modal
      description="Approval checks the evidence, ownership, month status, and independent review."
      onClose={onClose}
      open
      title={
        intent.decision === "approve"
          ? "Approve opening balance"
          : "Reject opening balance"
      }
    >
      <form action={action} className="space-y-4 p-4 sm:p-6">
        <Hidden name="decision" value={intent.decision} />
        <Hidden name="idempotencyKey" value={idempotencyKey} />
        <Hidden name="requestId" value={intent.request.id} />
        <p className="text-sm">
          {formatUsd(intent.request.proposedAmount)} ·{" "}
          {capitalize(intent.request.requestKind)} request
        </p>
        <Field label="Review reason">
          <Input
            maxLength={500}
            minLength={3}
            name="reviewReason"
            required={intent.decision === "reject"}
          />
        </Field>
        {state.status === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            {state.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending} type="submit">
            {pending
              ? "Saving…"
              : intent.decision === "approve"
                ? "Approve"
                : "Reject"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function groupsForScope(props: OpeningBalanceScreenProps) {
  return props.data.groups;
}

function collectEligibleEvidence(
  data: OpeningBalanceAuthorityData,
  selectedPropertyId?: string,
) {
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
  return [...byId.values()].sort(
    (a, b) => a.fileName.localeCompare(b.fileName) || a.id.localeCompare(b.id),
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Hidden({ name, value }: { name: string; value: string }) {
  return <input name={name} type="hidden" value={value} />;
}

function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "neutral" | "success";
}) {
  return <Badge tone={tone}>{children}</Badge>;
}

function formatUsd(value: string) {
  return value.startsWith("-") ? `-$${value.slice(1)}` : `$${value}`;
}

function shortDate(value: string) {
  return value.slice(0, 10);
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
