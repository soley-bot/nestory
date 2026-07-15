"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CornerUpLeft, Pause, Play, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  executeAssignedMaintenanceTaskAction,
  executeCoordinatedMaintenanceTaskAction,
  reviewMaintenanceCompletionAction,
  type MaintenanceActionState,
} from "@/features/maintenance/actions";
import type { MaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import type { MaintenanceActor, MaintenanceCase } from "@/features/maintenance/maintenance.types";
import {
  getCompletionReviewWarnings,
  getCoordinatedMaintenanceActions,
  getMaintenanceWorkflowState,
} from "@/features/maintenance/maintenance.workflow";

const initialState: MaintenanceActionState = {};

export function MaintenanceWorkflowPanel({
  actor,
  capabilities,
  maintenanceCase,
  onStatusMessage,
}: {
  actor: MaintenanceActor;
  capabilities: MaintenanceCapabilities;
  maintenanceCase: MaintenanceCase;
  onStatusMessage: (message: string) => void;
}) {
  const workflow = getMaintenanceWorkflowState(maintenanceCase, actor);

  return (
    <section className="space-y-3 rounded-md border border-border bg-surface-muted/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">Workflow</p>
          <p className="mt-1 font-semibold">{workflow.stageLabel}</p>
        </div>
        <Badge tone={workflow.isWaitingOnCurrentActor ? "warning" : "neutral"}>
          {workflow.currentOwnerLabel}
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <WorkflowFact label="Next action" value={workflow.nextActionLabel} />
        <WorkflowFact label="Next handoff" value={workflow.nextHandoffLabel} />
      </div>
      {workflow.blockerLabel ? (
        <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={15} />
          <span>{workflow.blockerLabel}</span>
        </p>
      ) : null}
      {workflow.latestReviewInstruction ? (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <p className="font-medium">Latest review instruction</p>
          <p className="mt-1 leading-5 text-muted">{workflow.latestReviewInstruction}</p>
        </div>
      ) : null}
      {capabilities.canExecuteAssignedCase && maintenanceCase.executionMode === "member_assigned" ? (
        <MemberExecutionPanel maintenanceCase={maintenanceCase} onStatusMessage={onStatusMessage} />
      ) : null}
      {capabilities.canManageCaseState && maintenanceCase.executionMode === "manager_coordinated" ? (
        <CoordinatedExecutionPanel maintenanceCase={maintenanceCase} onStatusMessage={onStatusMessage} />
      ) : null}
      {capabilities.canReviewCompletion && maintenanceCase.executionMode === "member_assigned" && maintenanceCase.status === "ready_for_review" ? (
        <CompletionReviewPanel maintenanceCase={maintenanceCase} onStatusMessage={onStatusMessage} />
      ) : null}
    </section>
  );
}

function CoordinatedExecutionPanel({
  maintenanceCase,
  onStatusMessage,
}: {
  maintenanceCase: MaintenanceCase;
  onStatusMessage: (message: string) => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    executeCoordinatedMaintenanceTaskAction,
    initialState,
  );
  const availableActions = getCoordinatedMaintenanceActions(maintenanceCase, {
    role: "manager",
  });

  useEffect(() => {
    if (state.status === "success") {
      onStatusMessage(state.message ?? "Coordinated work updated.");
      router.refresh();
    }
  }, [onStatusMessage, router, state.message, state.status]);

  if (maintenanceCase.status === "completed" || maintenanceCase.status === "cancelled") {
    return <p className="text-sm text-muted">This coordinated case is closed.</p>;
  }

  return (
    <div className="space-y-3 border-t border-border pt-3" data-coordinated-work-controls>
      <div>
        <p className="text-sm font-semibold">Manager-coordinated work</p>
        <p className="mt-1 text-xs text-muted">
          Vendor, unassigned, or historical offline work stays with manager coordination.
        </p>
      </div>
      {availableActions.includes("start") ? (
        <ActionConsequence text="Starting marks the case in progress. Manager coordination remains responsible.">
          <CoordinatedButton action={action} actionName="start" disabled={pending} taskId={maintenanceCase.id}>
            <Play size={14} /> Start coordinated work
          </CoordinatedButton>
        </ActionConsequence>
      ) : null}
      {availableActions.includes("resume") ? (
        <ActionConsequence text="Resuming clears the blocker and returns the case to in-progress manager coordination.">
          <CoordinatedButton action={action} actionName="resume" disabled={pending} taskId={maintenanceCase.id}>
            <Play size={14} /> Resume coordinated work
          </CoordinatedButton>
        </ActionConsequence>
      ) : null}
      {availableActions.includes("block") && availableActions.includes("complete") ? (
        <>
          <form action={action} className="space-y-2 rounded-md border border-border bg-surface p-3">
            <input name="taskId" type="hidden" value={maintenanceCase.id} />
            <input name="coordinatedAction" type="hidden" value="block" />
            <label className="block text-sm font-medium" htmlFor={`coordinated-block-${maintenanceCase.id}`}>
              Blocker
            </label>
            <Textarea
              id={`coordinated-block-${maintenanceCase.id}`}
              maxLength={500}
              minLength={3}
              name="coordinatedNote"
              placeholder="What prevents coordinated work from continuing?"
              required
            />
            <p className="text-xs text-foreground-muted">
              Blocking pauses coordinated execution and keeps the case open.
            </p>
            <Button disabled={pending} type="submit">
              <Pause size={14} /> Mark coordinated work blocked
            </Button>
          </form>
          <form action={action} className="space-y-2 rounded-md border border-border bg-surface p-3">
            <input name="taskId" type="hidden" value={maintenanceCase.id} />
            <input name="coordinatedAction" type="hidden" value="complete" />
            <label className="block text-sm font-medium" htmlFor={`coordinated-complete-${maintenanceCase.id}`}>
              Completion note
            </label>
            <Textarea
              id={`coordinated-complete-${maintenanceCase.id}`}
              maxLength={500}
              minLength={3}
              name="coordinatedNote"
              placeholder="What was completed and by whom?"
              required
            />
            <p className="text-xs text-foreground-muted">
              Completion closes the task and its request without posting a ledger effect.
            </p>
            <Button disabled={pending} type="submit" variant="primary">
              <CheckCircle2 size={14} /> Complete coordinated work
            </Button>
          </form>
        </>
      ) : null}
      {state.fieldErrors?.coordinatedNote?.[0] ? (
        <p className="text-xs text-danger">{state.fieldErrors.coordinatedNote[0]}</p>
      ) : null}
      {state.status === "error" && state.message ? (
        <p className="text-sm text-danger" role="alert">{state.message}</p>
      ) : null}
    </div>
  );
}

function MemberExecutionPanel({
  maintenanceCase,
  onStatusMessage,
}: {
  maintenanceCase: MaintenanceCase;
  onStatusMessage: (message: string) => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    executeAssignedMaintenanceTaskAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onStatusMessage(state.message ?? "Maintenance work updated.");
      router.refresh();
    }
  }, [onStatusMessage, router, state.message, state.status]);

  if (maintenanceCase.status === "ready_for_review") {
    return <p className="text-sm text-muted">Your work is submitted. No execution action is required while the manager reviews it.</p>;
  }

  if (maintenanceCase.status === "completed" || maintenanceCase.status === "cancelled") {
    return <p className="text-sm text-muted">Your responsibility for this case has ended.</p>;
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-sm font-semibold">Your work</p>
      {maintenanceCase.status === "pending" || maintenanceCase.status === "scheduled" ? (
        <ActionConsequence text="Starting moves the task to in progress and keeps you responsible for execution.">
          <ExecutionButton action={action} actionName="start" disabled={pending} taskId={maintenanceCase.id}>
            <Play size={14} /> Start work
          </ExecutionButton>
        </ActionConsequence>
      ) : null}
      {maintenanceCase.status === "blocked" ? (
        <ActionConsequence text="Resuming clears the recorded blocker and returns the task to in progress.">
          <ExecutionButton action={action} actionName="resume" disabled={pending} taskId={maintenanceCase.id}>
            <Play size={14} /> Resume work
          </ExecutionButton>
        </ActionConsequence>
      ) : null}
      {maintenanceCase.status === "in_progress" || maintenanceCase.status === "blocked" ? (
        <div className="space-y-1.5">
          {maintenanceCase.checklist.length === 0 ? (
            <p className="text-sm text-muted">No checklist items were assigned.</p>
          ) : maintenanceCase.checklist.map((item) => (
            <form action={action} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-2" key={item.id}>
              <input name="taskId" type="hidden" value={maintenanceCase.id} />
              <input name="executionAction" type="hidden" value="set_checklist_item" />
              <input name="checklistItemId" type="hidden" value={item.id} />
              <input name="checklistCompleted" type="hidden" value={String(!item.completed)} />
              <span className={item.completed ? "text-sm text-muted line-through" : "text-sm"}>{item.label}</span>
              <Button disabled={pending || maintenanceCase.status === "blocked"} type="submit">
                {item.completed ? "Reopen" : "Mark done"}
              </Button>
            </form>
          ))}
        </div>
      ) : null}
      {maintenanceCase.status === "in_progress" ? (
        <>
          <form action={action} className="space-y-2 rounded-md border border-border bg-surface p-3">
            <input name="taskId" type="hidden" value={maintenanceCase.id} />
            <input name="executionAction" type="hidden" value="block" />
            <label className="block text-sm font-medium" htmlFor={`blocked-${maintenanceCase.id}`}>Blocker</label>
            <Textarea id={`blocked-${maintenanceCase.id}`} maxLength={500} minLength={3} name="blockedReason" placeholder="What prevents the work from continuing?" required />
            {state.fieldErrors?.blockedReason?.[0] ? <p className="text-xs text-danger">{state.fieldErrors.blockedReason[0]}</p> : null}
            <p className="text-xs text-foreground-muted">
              Blocking pauses execution and hands resolution to a manager.
            </p>
            <Button disabled={pending} type="submit"><AlertTriangle size={14} /> Mark blocked</Button>
          </form>
          <ActionConsequence text="Submission keeps the case open and hands completion review to a manager.">
            <ExecutionButton action={action} actionName="submit_for_review" disabled={pending} taskId={maintenanceCase.id} primary>
              <Send size={14} /> Submit for review
            </ExecutionButton>
          </ActionConsequence>
        </>
      ) : null}
      {state.status === "error" && state.message ? <p className="text-sm text-danger" role="alert">{state.message}</p> : null}
    </div>
  );
}

function CompletionReviewPanel({
  maintenanceCase,
  onStatusMessage,
}: {
  maintenanceCase: MaintenanceCase;
  onStatusMessage: (message: string) => void;
}) {
  const router = useRouter();
  const warnings = getCompletionReviewWarnings(maintenanceCase);
  const [state, action, pending] = useActionState(
    reviewMaintenanceCompletionAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onStatusMessage(state.message ?? "Completion review saved.");
      router.refresh();
    }
  }, [onStatusMessage, router, state.message, state.status]);

  return (
    <form action={action} className="space-y-3 border-t border-border pt-3">
      <input name="taskId" type="hidden" value={maintenanceCase.id} />
      <div>
        <p className="text-sm font-semibold">Completion review</p>
        <p className="mt-1 text-xs text-muted">
          Approval completes the task and closes its request. Returning work reopens execution and records the review note.
        </p>
      </div>
      {warnings.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          {warnings.map((warning) => <li key={warning.code}>• {warning.label}</li>)}
        </ul>
      ) : null}
      <label className="block text-sm font-medium" htmlFor={`review-${maintenanceCase.id}`}>Review note</label>
      <Textarea id={`review-${maintenanceCase.id}`} maxLength={500} minLength={3} name="reviewNote" placeholder="Optional for approval; required to return work." />
      {state.fieldErrors?.reviewNote?.[0] ? <p className="text-xs text-danger">{state.fieldErrors.reviewNote[0]}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} name="reviewAction" type="submit" value="approve" variant="primary"><CheckCircle2 size={14} /> Approve completion</Button>
        <Button disabled={pending} name="reviewAction" type="submit" value="reopen"><CornerUpLeft size={14} /> Return to assignee</Button>
      </div>
      {state.status === "error" && state.message ? <p className="text-sm text-danger" role="alert">{state.message}</p> : null}
    </form>
  );
}

function ExecutionButton({ action, actionName, children, disabled, primary, taskId }: {
  action: (payload: FormData) => void;
  actionName: string;
  children: React.ReactNode;
  disabled: boolean;
  primary?: boolean;
  taskId: string;
}) {
  return (
    <form action={action}>
      <input name="taskId" type="hidden" value={taskId} />
      <input name="executionAction" type="hidden" value={actionName} />
      <Button disabled={disabled} type="submit" variant={primary ? "primary" : "secondary"}>{children}</Button>
    </form>
  );
}

function CoordinatedButton({ action, actionName, children, disabled, taskId }: {
  action: (payload: FormData) => void;
  actionName: string;
  children: React.ReactNode;
  disabled: boolean;
  taskId: string;
}) {
  return (
    <form action={action}>
      <input name="taskId" type="hidden" value={taskId} />
      <input name="coordinatedAction" type="hidden" value={actionName} />
      <Button disabled={disabled} type="submit" variant="secondary">{children}</Button>
    </form>
  );
}

function WorkflowFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-border bg-surface px-2.5 py-2"><p className="text-xs text-muted">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div>;
}

function ActionConsequence({
  children,
  text,
}: {
  children: React.ReactNode;
  text: string;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-surface p-3">
      <p className="text-xs leading-5 text-foreground-muted">{text}</p>
      {children}
    </div>
  );
}
