"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
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
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [selectedDimensions, setSelectedDimensions] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
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
        if (result.status === "success") {
          if (fileRef.current) fileRef.current.value = "";
          setSelectedFileName("");
          setSelectedPreview(null);
          setSelectedDimensions("");
          router.refresh();
        }
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
  useEffect(() => {
    return () => {
      if (selectedPreview) URL.revokeObjectURL(selectedPreview);
    };
  }, [selectedPreview]);

  return (
    <Card className="min-w-0" size="sm">
      <CardHeader className="border-b">
        <SettingsSectionHeader
          description="Upload and removal save immediately, separately from appearance changes."
          title="Company logo"
        />
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <p className="mb-4 text-sm text-muted-foreground" id="company-logo-requirements">
          PNG or JPEG, up to 2 MB. Each dimension must be 128–4096 pixels.
          The logo keeps its original proportions and is fitted without cropping.
        </p>
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
              <div className="group flex flex-wrap items-center gap-2">
                <label
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-lg border border-input bg-background px-3 text-sm font-medium group-has-[:focus-visible]:ring-2 group-has-[:focus-visible]:ring-ring",
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
                  aria-describedby="company-logo-requirements company-logo-selection"
                  className="sr-only"
                  disabled={pending}
                  id="company-logo-file"
                  name="logo"
                  ref={fileRef}
                  onChange={(event) => {
                    if (pending || actionPendingRef.current) return;
                    const file = event.target.files?.[0];
                    setSelectedFileName(file?.name ?? "");
                    setSelectedDimensions("");
                    setSelectedPreview(
                      file && ["image/png", "image/jpeg"].includes(file.type)
                        && file.size <= 2 * 1024 * 1024
                        && typeof URL.createObjectURL === "function"
                        ? URL.createObjectURL(file) : null,
                    );
                    setState(initialState);
                  }}
                  required
                  type="file"
                />
                <Button className="min-h-11" disabled={pending || !selectedFileName} type="submit">
                  {uploading
                    ? "Uploading…"
                    : hasLogo
                      ? "Replace logo"
                      : "Upload logo"}
                </Button>
                {selectedFileName ? (
                  <span className="min-w-0 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {selectedFileName}
                  </span>
                ) : null}
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground" id="company-logo-selection" aria-live="polite">
                {selectedFileName ? "Selected file is not saved. Upload to apply it." : "Choose a file to preview before uploading."}
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
                  <Button className="min-h-11" disabled={pending} type="submit" variant="ghost">
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
        {selectedPreview ? (
          <figure className="mt-4 space-y-2">
            <figcaption className="text-sm font-medium">Selected logo preview (not saved)</figcaption>
            <div className="flex h-32 items-center justify-center rounded-lg border bg-muted/40 p-3">
              <Image
                alt="Selected company logo"
                className="max-h-full w-auto max-w-full object-contain"
                height={128}
                width={256}
                src={selectedPreview}
                unoptimized
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  setSelectedDimensions(`${naturalWidth} × ${naturalHeight} pixels`);
                }}
                onError={() => setSelectedDimensions("Preview unavailable. The file will be validated when uploaded.")}
              />
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">{selectedDimensions}</p>
          </figure>
        ) : null}
        <div className="mt-5 space-y-2" aria-label="Report header preview">
          <p className="text-sm font-medium">Report header preview</p>
          <div className="rounded-lg border bg-white p-4 text-slate-900">
            <p className="mb-3 text-xs font-semibold">Nestory · Property report</p>
            <p className="break-words text-center text-lg font-semibold [overflow-wrap:anywhere]">Occupancy report - {organizationName}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Company name sample for PDF reports, not an exact export layout. Workspace colors do not apply to exports.
            Logo placement varies by supported export; this sample does not preview a statement.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
