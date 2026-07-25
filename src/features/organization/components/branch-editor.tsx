"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Building2 } from "lucide-react";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { DraftActionBar } from "@/components/ui/draft-action-bar";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { createBranchAction } from "@/features/organization/actions";
import type { OrganizationBranch } from "@/features/organization/data";
import { useSettingsDraft } from "@/features/organization/components/use-settings-draft";
import type { DraftStatus } from "@/components/ui/draft-action-bar";

type BranchDraft = {
  address: string;
  code: string;
  name: string;
};

const initialBranchDraft: BranchDraft = {
  name: "",
  code: "",
  address: "",
};

type BranchEditorProps = {
  branches: OrganizationBranch[];
  canManageStructure: boolean;
  focusServerError: boolean;
  onDraftStatusChange: (status: DraftStatus) => void;
  organizationName: string;
};

export type SettingsEditorHandle = {
  discard: () => void;
};

export const BranchEditor = forwardRef<SettingsEditorHandle, BranchEditorProps>(
  function BranchEditor(
    {
      branches,
      canManageStructure,
      focusServerError,
      onDraftStatusChange,
      organizationName,
    },
    controllerRef,
  ) {
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useSettingsDraft({
    action: createBranchAction,
    errorMessage: "Branch not saved",
    initialValues: initialBranchDraft,
    savedMessage: "Branch saved",
    savingMessage: "Adding branch",
    validate: validateBranch,
  });
  const permissionReason = canManageStructure
    ? undefined
    : "Only administrators can add organization structure.";
  const draftName = draft.values.name.trim();
  const draftCode = draft.values.code.trim();
  const branchLabel =
    draftName && draftCode
      ? `${draftName} (${draftCode.toUpperCase()})`
      : draftName || draftCode.toUpperCase() || "New branch";
  const serverError =
    draft.status === "error" && draft.resultMessage
      ? `Branch not saved: ${draft.resultMessage}`
      : undefined;

  useImperativeHandle(
    controllerRef,
    () => ({ discard: draft.discard }),
    [draft.discard],
  );
  useEffect(() => {
    onDraftStatusChange(draft.status);
  }, [draft.status, onDraftStatusChange]);
  useEffect(
    () => () => {
      onDraftStatusChange("clean");
    },
    [onDraftStatusChange],
  );

  return (
    <>
      <section
        className="min-w-0 overflow-hidden rounded-md border border-border bg-surface"
        data-testid="settings-editor"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Building2 aria-hidden="true" size={15} />
              Branches
            </h2>
            <p className="mt-0.5 text-sm text-foreground-muted">
              {branches.length} {branches.length === 1 ? "branch" : "branches"}
            </p>
          </div>
        </div>

        {branches.length > 0 ? (
          <div className="divide-y divide-border border-b border-border">
            {branches.map((branch) => (
              <div
                className="grid min-w-0 gap-1 px-4 py-2.5 text-sm sm:grid-cols-[80px_minmax(0,1fr)_90px] sm:items-center"
                key={branch.id}
              >
                <span className="font-medium">{branch.code}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{branch.name}</span>
                  <span className="block truncate text-foreground-muted">
                    {branch.address ?? "No address"}
                  </span>
                </span>
                <span className="text-xs font-medium uppercase text-foreground-muted">
                  {branch.status}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <form
          className="min-w-0 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void draft.submit((field) => {
              const control = formRef.current?.elements.namedItem(String(field));
              if (control instanceof HTMLElement) {
                control.focus();
              }
            });
          }}
          ref={formRef}
        >
          <FormSection title="Add branch">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                disabled={!canManageStructure || draft.status === "saving"}
                error={draft.errors.name}
                label="Name"
                name="name"
                onChange={(value) => draft.setField("name", value)}
                value={draft.values.name}
              />
              <Field
                disabled={!canManageStructure || draft.status === "saving"}
                error={draft.errors.code}
                label="Code"
                name="code"
                onChange={(value) => draft.setField("code", value)}
                value={draft.values.code}
              />
            </div>
            <Field
              disabled={!canManageStructure || draft.status === "saving"}
              error={draft.errors.address}
              label="Address"
              name="address"
              onChange={(value) => draft.setField("address", value)}
              value={draft.values.address}
            />
            {draft.status === "saved" && draft.resultMessage ? (
              <p className="text-sm text-success">
                {draft.resultMessage}
              </p>
            ) : null}
          </FormSection>
        </form>

        <div className="sticky bottom-0 z-10">
          <DraftActionBar
            describedBy="branch-impact"
            disabledReason={permissionReason}
            focusOnError={focusServerError && Boolean(serverError)}
            onDiscard={draft.discard}
            onSave={() => formRef.current?.requestSubmit()}
            saveLabel="Save"
            status={draft.status}
            statusMessage={serverError ?? draft.statusMessage}
          />
        </div>
      </section>

      <aside
        className="min-w-0 lg:col-start-2 xl:col-start-3 xl:row-start-1"
        data-testid="settings-summary"
      >
        <ConsequencePanel
          id="branch-impact"
          rows={[
            { label: "Scope", value: organizationName },
            { label: "Branch", value: branchLabel },
            { label: "Affected records", value: "New branch only" },
            { label: "Draft", value: draftStatusLabel(draft.status) },
          ]}
          summary="Saving adds one branch record. Existing branches remain unchanged."
          title="Branch impact"
        />
      </aside>
    </>
  );
  },
);

function Field({
  disabled,
  error,
  label,
  name,
  onChange,
  value,
}: {
  disabled: boolean;
  error?: string;
  label: string;
  name: keyof BranchDraft;
  onChange: (value: string) => void;
  value: string;
}) {
  const errorId = `${name}-error`;

  return (
    <div className="block min-w-0 text-sm font-medium text-foreground">
      <label htmlFor={`branch-${name}`}>{label}</label>
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? "true" : undefined}
        className="mt-1"
        disabled={disabled}
        id={`branch-${name}`}
        maxLength={name === "code" ? 16 : name === "address" ? 240 : 120}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {error ? (
        <span className="mt-1 block text-sm font-normal text-danger" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function validateBranch(values: BranchDraft) {
  const errors: Partial<Record<keyof BranchDraft, string>> = {};
  if (values.name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters.";
  }
  if (values.code.trim().length < 2) {
    errors.code = "Code must be at least 2 characters.";
  }
  return errors;
}

function draftStatusLabel(status: string) {
  return {
    clean: "No changes",
    dirty: "Unsaved",
    error: "Needs attention",
    saved: "Saved",
    saving: "Saving",
  }[status] ?? status;
}
