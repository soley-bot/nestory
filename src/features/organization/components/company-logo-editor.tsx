"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { ImageUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  removeOrganizationLogoAction,
  type OrganizationActionState,
  uploadOrganizationLogoAction,
} from "@/features/organization/actions";
import { SettingsSectionHeader } from "@/features/organization/components/settings-section-header";
import { cn } from "@/lib/utils";

const initialState: OrganizationActionState = {};

export function CompanyLogoEditor({
  logoStoragePath,
  logoUrl,
  organizationName,
}: {
  logoStoragePath: string | null;
  logoUrl: string | null;
  organizationName: string;
}) {
  const router = useRouter();
  const [selectedFileName, setSelectedFileName] = useState("");
  const [state, setState] = useState(initialState);
  const actionPendingRef = useRef(false);
  const [, uploadAction, uploading] = useActionState(
    async (previousState: OrganizationActionState, formData: FormData) => {
      try {
        const result = await uploadOrganizationLogoAction(
          previousState,
          formData,
        );
        setState(result);
        if (result.status === "success") router.refresh();
        return result;
      } finally {
        actionPendingRef.current = false;
      }
    },
    initialState,
  );
  const [, removeAction, removing] = useActionState(
    async (previousState: OrganizationActionState, formData: FormData) => {
      try {
        const result = await removeOrganizationLogoAction(
          previousState,
          formData,
        );
        setState(result);
        if (result.status === "success") router.refresh();
        return result;
      } finally {
        actionPendingRef.current = false;
      }
    },
    initialState,
  );
  const hasLogo = Boolean(logoStoragePath);
  const pending = uploading || removing;

  return (
    <Card className="min-w-0" size="sm">
      <CardHeader className="border-b">
        <SettingsSectionHeader
          description="Reports and company documents."
          title="Company logo"
        />
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 p-3 sm:w-56">
            {logoUrl ? (
              <Image
                alt={`${organizationName} company logo`}
                className="max-h-full w-auto max-w-full object-contain"
                height={96}
                src={logoUrl}
                unoptimized
                width={224}
              />
            ) : (
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ImageUp aria-hidden="true" className="size-4" />
                {hasLogo ? "Preview unavailable" : "No logo"}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <form
              action={uploadAction}
              onSubmit={(event) => {
                if (pending || actionPendingRef.current) {
                  event.preventDefault();
                  return;
                }
                actionPendingRef.current = true;
                setState(initialState);
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className={cn(
                    "inline-flex h-8 items-center rounded-lg border border-input bg-background px-2.5 text-sm font-medium",
                    pending
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer hover:bg-muted",
                  )}
                  htmlFor="company-logo-file"
                >
                  Choose file
                </label>
                <input
                  accept="image/png,image/jpeg"
                  aria-label="Company logo file"
                  className="sr-only"
                  disabled={pending}
                  id="company-logo-file"
                  name="logo"
                  onChange={(event) => {
                    if (pending || actionPendingRef.current) return;
                    setSelectedFileName(event.target.files?.[0]?.name ?? "");
                    setState(initialState);
                  }}
                  required
                  type="file"
                />
                <Button disabled={pending} type="submit">
                  {uploading
                    ? "Uploading…"
                    : hasLogo
                      ? "Replace logo"
                      : "Upload logo"}
                </Button>
                {selectedFileName ? (
                  <span className="max-w-52 truncate text-xs text-muted-foreground">
                    {selectedFileName}
                  </span>
                ) : null}
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                PNG or JPEG, up to 2 MB.
              </p>
              {hasLogo ? (
                <form
                  action={removeAction}
                  onSubmit={(event) => {
                    if (
                      pending ||
                      actionPendingRef.current ||
                      !window.confirm("Remove this company logo?")
                    ) {
                      event.preventDefault();
                      return;
                    }
                    actionPendingRef.current = true;
                    setState(initialState);
                  }}
                >
                  <Button disabled={pending} type="submit" variant="ghost">
                    {removing ? "Removing…" : "Remove logo"}
                  </Button>
                </form>
              ) : null}
            </div>

            {state.message ? (
              <p
                className={cn(
                  "text-sm",
                  state.status === "error" ? "text-danger" : "text-success",
                )}
                role={state.status === "error" ? "alert" : "status"}
              >
                {state.message}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
