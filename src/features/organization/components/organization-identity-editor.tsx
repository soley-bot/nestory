"use client";

import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Building2, Check, Copy, LockKeyhole, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DraftStatus } from "@/components/ui/draft-action-bar";
import { Input } from "@/components/ui/input";
import { updateOrganizationIdentityAction } from "@/features/organization/actions";
import type { SettingsEditorHandle } from "@/features/organization/components/branch-editor";
import { useSettingsDraft } from "@/features/organization/components/use-settings-draft";
import { SettingsSaveBar } from "@/features/organization/components/settings-save-bar";
import { cn } from "@/lib/utils";

type OrganizationIdentityDraft = { name: string };

export const OrganizationIdentityEditor = forwardRef<
  SettingsEditorHandle,
  {
    branchCount: number;
    onDraftStatusChange: (status: DraftStatus) => void;
    organizationName: string;
    organizationSlug?: string;
    teamCount: number;
    workspaceUrl?: string;
  }
>(function OrganizationIdentityEditor(
  {
    branchCount,
    onDraftStatusChange,
    organizationName,
    organizationSlug,
    teamCount,
    workspaceUrl,
  },
  controllerRef,
) {
  const formRef = useRef<HTMLFormElement>(null);
  const [copyState, setCopyState] = useState<"copied" | "error" | "idle">("idle");
  const draft = useSettingsDraft<OrganizationIdentityDraft>({
    action: updateOrganizationIdentityAction,
    errorMessage: "Workspace name not saved",
    initialValues: { name: organizationName },
    retainValuesAfterSuccess: true,
    savedMessage: "Changes saved",
    savingMessage: "Saving changes",
    validate: ({ name }) => {
      const length = name.trim().length;
      return length >= 2 && length <= 120
        ? {}
        : { name: "Enter a workspace name between 2 and 120 characters." };
    },
  });

  useImperativeHandle(controllerRef, () => ({ discard: draft.discard }), [draft.discard]);
  useEffect(() => onDraftStatusChange(draft.status), [draft.status, onDraftStatusChange]);
  useEffect(() => () => onDraftStatusChange("clean"), [onDraftStatusChange]);

  const copyableWorkspaceUrl = workspaceUrl?.startsWith("https://")
    ? workspaceUrl
    : undefined;
  const address = copyableWorkspaceUrl
    ? copyableWorkspaceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : organizationSlug?.trim() || "Address unavailable";

  async function copyAddress() {
    if (!copyableWorkspaceUrl) return;
    try {
      await navigator.clipboard.writeText(copyableWorkspaceUrl);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <Card className="min-w-0 overflow-hidden" data-testid="settings-editor" size="sm">
      <CardContent className="p-0">
        <div className="border-b px-5 py-5 sm:px-6">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Workspace profile
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">Organization</h2>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
            Control the name people see across this workspace. Its address remains fixed.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void draft.submit(() => formRef.current?.elements.namedItem("name") instanceof HTMLElement
              ? (formRef.current.elements.namedItem("name") as HTMLElement).focus()
              : undefined);
          }}
          ref={formRef}
        >
          <div className="max-w-3xl space-y-6 px-5 py-6 sm:px-6">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="organization-name">
                Workspace name
              </label>
              <Input
                aria-describedby={draft.errors.name ? "organization-name-error" : "organization-name-help"}
                aria-invalid={Boolean(draft.errors.name)}
                id="organization-name"
                name="name"
                onChange={(event) => draft.setField("name", event.target.value)}
                value={draft.values.name}
              />
              {draft.errors.name ? (
                <p className="text-sm text-danger" id="organization-name-error">
                  {draft.errors.name}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground" id="organization-name-help">
                  Used in navigation, invitations, and workspace emails.
                </p>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border bg-muted/35">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
                  <LockKeyhole aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Workspace address</p>
                  <p className="mt-0.5 break-all font-mono text-sm text-foreground">{address}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Locked after provisioning to keep tenant links and sign-in routing stable.
                  </p>
                </div>
                <Button
                  disabled={!copyableWorkspaceUrl}
                  onClick={() => void copyAddress()}
                  type="button"
                  variant="outline"
                >
                  {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  <span className="sr-only">Copy workspace address</span>
                  <span aria-hidden="true">{copyState === "copied" ? "Copied" : "Copy"}</span>
                </Button>
              </div>
              <p
                aria-live="polite"
                className={cn(
                  "min-h-0 px-4 text-xs",
                  copyState !== "idle" && "border-t py-2",
                  copyState === "error" ? "text-danger" : "text-success",
                )}
                role="status"
              >
                {copyState === "copied"
                  ? "Workspace address copied."
                  : copyState === "error"
                    ? "Workspace address could not be copied. Select it and copy manually."
                    : null}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ContextLink
                href="/settings/branches"
                icon={Building2}
                label="Branches"
                value={branchCount}
              />
              <ContextLink
                href="/settings/teams"
                icon={UsersRound}
                label="Teams"
                value={teamCount}
              />
            </div>
          </div>

          {draft.resultMessage ? (
            <p className={cn("px-5 pb-3 text-sm sm:px-6", draft.status === "error" ? "text-danger" : "text-success")}>
              {draft.resultMessage}
            </p>
          ) : null}
          <SettingsSaveBar
            confirmDiscard={false}
            onDiscard={draft.discard}
            onSave={() => formRef.current?.requestSubmit()}
            status={draft.status}
            statusMessage={draft.statusMessage}
          />
        </form>
      </CardContent>
    </Card>
  );
});

function ContextLink({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: typeof Building2;
  label: string;
  value: number;
}) {
  return (
    <Link
      className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
      href={href}
    >
      <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className="font-mono text-sm text-muted-foreground">{value}</span>
    </Link>
  );
}
