"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { unstable_rethrow } from "next/navigation";
import type { ReactNode, RefObject } from "react";
import { Archive, Expand, ImageIcon, LoaderCircle, Star, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  FileDropzoneField,
  PHOTO_FILE_ACCEPT,
} from "@/components/ui/file-dropzone-field";
import { Input } from "@/components/ui/input";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  archiveAssetPhotoAction,
  createAssetPhotoAction,
  setAssetPhotoCoverAction,
  type PhotoActionState,
} from "@/features/photos/actions";
import type { AssetPhoto } from "@/features/photos/photo.types";
import { PhotoViewer } from "@/features/photos/components/photo-viewer";
import { formatDate } from "@/lib/dates/format";

const initialState: PhotoActionState = {};

type PhotoPreview = {
  name: string;
  url: string;
};

type PhotoIntent = "cover" | "archive";
type PendingPhotoAction = { photoId: string; intent: PhotoIntent };
type PhotoActionFeedback = PhotoActionState & { photoId?: string };

export function PhotoGallery({
  canArchive = true,
  canWrite = true,
  emptyLabel,
  photos,
  propertyId,
  title,
  unitId,
  uploadLabel = "Add photo",
}: {
  canArchive?: boolean;
  canWrite?: boolean;
  emptyLabel: string;
  photos: AssetPhoto[];
  propertyId: string;
  title: string;
  unitId?: string;
  uploadLabel?: string;
}) {
  const [preview, setPreview] = useState<PhotoPreview | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dropzoneKey, setDropzoneKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const galleryTitleRef = useRef<HTMLHeadingElement>(null);
  const openPhotoPickerRef = useRef<(() => void) | null>(null);
  const photoActionInFlightRef = useRef(false);
  const photoActionFocusRef = useRef<HTMLButtonElement | null>(null);
  const [pendingPhotoAction, setPendingPhotoAction] =
    useState<PendingPhotoAction | null>(null);
  const [photoActionState, setPhotoActionState] = useState<PhotoActionFeedback>({});

  const handlePhotoAction = (photoId: string, intent: PhotoIntent, button: HTMLButtonElement) => {
    if (photoActionInFlightRef.current) return;
    photoActionInFlightRef.current = true;
    photoActionFocusRef.current = document.activeElement === button ? button : null;
    setPendingPhotoAction({ photoId, intent });
    setPhotoActionState({});

    startTransition(async () => {
      const formData = new FormData();
      formData.set("photoId", photoId);
      try {
        const action = intent === "cover"
          ? setAssetPhotoCoverAction
          : archiveAssetPhotoAction;
        setPhotoActionState({ ...await action(formData), photoId });
      } catch (error) {
        unstable_rethrow(error);
        setPhotoActionState({
          photoId,
          message: intent === "cover"
            ? "Could not set the cover. Try again."
            : "Could not archive the photo. Try again.",
          status: "error",
        });
      } finally {
        photoActionInFlightRef.current = false;
        setPendingPhotoAction(null);
      }
    });
  };

  useEffect(() => {
    const focusedAction = photoActionFocusRef.current;
    if (focusedAction && !focusedAction.isConnected) {
      photoActionFocusRef.current = null;
      if (document.activeElement === document.body) galleryTitleRef.current?.focus();
    }
  }, [photos]);

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  const clearSelectedPhoto = () => {
    if (preview) {
      URL.revokeObjectURL(preview.url);
    }

    setPreview(null);
    setDropzoneKey((key) => key + 1);
  };
  const uploadPhotoAction = async (
    currentState: PhotoActionState,
    formData: FormData,
  ) => {
    const nextState = await createAssetPhotoAction(currentState, formData);

    if (nextState.status === "success") {
      clearSelectedPhoto();
      formRef.current?.reset();
      setUploadOpen(false);
    }

    return nextState;
  };
  const [state, formAction, pending] = useActionState(
    uploadPhotoAction,
    initialState,
  );
  const handlePhotoFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }

    if (preview) {
      URL.revokeObjectURL(preview.url);
    }

    setPreview({
      name: file.name,
      url: URL.createObjectURL(file),
    });
  };
  const handleChangePreview = () => {
    openPhotoPickerRef.current?.();
  };

  return (
    <section onFocusCapture={(event) => {
      if (event.target !== photoActionFocusRef.current) photoActionFocusRef.current = null;
    }}>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="text-muted-foreground" size={16} />
          <h2
            className="text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
            ref={galleryTitleRef}
            tabIndex={-1}
          >{title}</h2>
        </div>
        {canWrite ? (
          <Button onClick={() => setUploadOpen(true)} type="button" variant="outline">
            <ImageIcon size={14} />
            {uploadLabel}
          </Button>
        ) : null}
      </div>

      {pendingPhotoAction ? (
        <p className="sr-only" role="status">
          {pendingPhotoAction.intent === "cover" ? "Setting cover..." : "Archiving..."}
        </p>
      ) : null}
      {photoActionState.message && (
        photoActionState.status !== "error" ||
        !photos.some((photo) => photo.id === photoActionState.photoId)
      ) ? (
        <p
          className={`mt-3 text-sm ${photoActionState.status === "error" ? "text-danger" : "text-success"}`}
          role={photoActionState.status === "error" ? "alert" : "status"}
        >
          {photoActionState.message}
        </p>
      ) : null}

      {photos.length === 0 ? (
        <p className="py-5 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-5 pt-4">
          {groupPhotosByScope(photos).map((group) => (
            <div key={group.label}>
              {group.showLabel ? (
                <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                  {group.label}
                </h3>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {group.photos.map((photo) => (
                  <PhotoCard
                    canArchive={canArchive}
                    canWrite={canWrite}
                    errorMessage={photoActionState.status === "error" && photoActionState.photoId === photo.id
                      ? photoActionState.message
                      : undefined}
                    fallbackFocusRef={galleryTitleRef}
                    key={photo.id}
                    onAction={handlePhotoAction}
                    pendingAction={pendingPhotoAction}
                    photo={photo}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {canWrite && uploadOpen ? (
        <SideDrawer
          description="Upload a photo to this property."
          onClose={() => setUploadOpen(false)}
          open
          title={uploadLabel}
        >
        <form
          action={formAction}
          className="space-y-4 p-5"
          ref={formRef}
        >
          <input name="propertyId" type="hidden" value={propertyId} />
          <input name="unitId" type="hidden" value={unitId ?? ""} />
          <input name="isCover" type="hidden" value={photos.length === 0 ? "true" : "false"} />

          <Field label="Photo">
            <FileDropzoneField
              accept={PHOTO_FILE_ACCEPT}
              description="JPG, PNG, or WebP up to 10 MB."
              displayFileName={preview?.name}
              key={dropzoneKey}
              name="photo"
              onFile={handlePhotoFile}
              openRef={openPhotoPickerRef}
            />
          </Field>
          {state.fieldErrors?.photo ? (
            <FieldError>{state.fieldErrors.photo[0]}</FieldError>
          ) : null}
          {preview ? (
            <SelectedPhotoPreview
              onChange={handleChangePreview}
              onClear={clearSelectedPhoto}
              preview={preview}
            />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Field label="Caption">
              <Input
                aria-label="Caption"
                name="caption"
                placeholder="Exterior, kitchen, lobby..."
                type="text"
              />
            </Field>
            <Field label="Taken date">
              <DatePickerField ariaLabel="Taken date" name="takenAt" />
            </Field>
          </div>

          {state.fieldErrors?.caption ? (
            <FieldError>{state.fieldErrors.caption[0]}</FieldError>
          ) : null}
          {state.fieldErrors?.takenAt ? (
            <FieldError>{state.fieldErrors.takenAt[0]}</FieldError>
          ) : null}
          {state.message ? (
            <p
              className={`rounded-md border px-3 py-2 text-sm ${
                state.status === "error"
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-success/40 bg-success/10 text-success"
              }`}
              role="status"
            >
              {state.message}
            </p>
          ) : null}

          <Button disabled={pending} type="submit" variant="default">
            <ImageIcon size={14} />
            {pending ? "Uploading..." : "Upload photo"}
          </Button>
        </form>
        </SideDrawer>
      ) : null}
    </section>
  );
}

function SelectedPhotoPreview({
  onChange,
  onClear,
  preview,
}: {
  onChange: () => void;
  onClear: () => void;
  preview: PhotoPreview;
}) {
  return (
    <article className="overflow-hidden rounded-md border border-accent/50 bg-card">
      <div className="relative h-40 bg-muted sm:h-44">
        <Image
          alt=""
          className="size-full object-cover"
          fill
          sizes="320px"
          src={preview.url}
          unoptimized
        />
        <div className="absolute left-2 top-2">
          <Badge tone="accent">Ready to upload</Badge>
        </div>
        <button
          aria-label="Clear selected photo"
          className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-md border border-border bg-card/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          onClick={onClear}
          type="button"
        >
          <X size={15} />
        </button>
      </div>
      <div className="space-y-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={preview.name}>
            {preview.name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Preview only. Save it with Upload photo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onChange} type="button" variant="secondary">
            <ImageIcon size={14} />
            Change photo
          </Button>
          <Button onClick={onClear} type="button" variant="ghost">
            Cancel
          </Button>
        </div>
      </div>
    </article>
  );
}

function PhotoCard({
  canArchive,
  canWrite,
  errorMessage,
  fallbackFocusRef,
  onAction,
  pendingAction,
  photo,
}: {
  canArchive: boolean;
  canWrite: boolean;
  errorMessage?: string;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  onAction: (photoId: string, intent: PhotoIntent, button: HTMLButtonElement) => void;
  pendingAction: PendingPhotoAction | null;
  photo: AssetPhoto;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = !photo.url || failedUrl === photo.url;
  const settingCover = pendingAction?.photoId === photo.id && pendingAction.intent === "cover";
  const archiving = pendingAction?.photoId === photo.id && pendingAction.intent === "archive";

  return (
    <article className="overflow-hidden rounded-md border border-border bg-muted/40">
      <PhotoViewer fallbackFocusRef={fallbackFocusRef} photo={photo}>
        <button
          aria-label={`View photo: ${photo.caption || photo.fileName}`}
          className="group relative block aspect-[4/3] w-full bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px] disabled:cursor-default"
          disabled={!photo.url}
          type="button"
        >
          {!failed && photo.url ? (
            <Image
              alt=""
              className="size-full object-cover"
              fill
              onError={() => setFailedUrl(photo.url ?? null)}
              sizes="(min-width: 1536px) 300px, (min-width: 640px) 50vw, 100vw"
              src={photo.url}
              unoptimized
            />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageIcon aria-hidden="true" size={22} />
              <span className="text-sm">Photo unavailable</span>
            </span>
          )}
          {photo.isCover ? (
            <span className="absolute left-2 top-2">
              <Badge tone="accent">Cover</Badge>
            </span>
          ) : null}
          {photo.url ? (
            <span className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-md bg-card/95 text-foreground shadow-sm transition-colors group-hover:bg-card">
              <Expand aria-hidden="true" size={16} />
            </span>
          ) : null}
        </button>
      </PhotoViewer>

      <div className="space-y-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={photo.caption || photo.fileName}>
            {photo.caption || photo.fileName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {photo.takenAt ? `Taken ${formatDate(photo.takenAt)}` : `Uploaded ${formatDate(photo.uploadedAt)}`}
          </p>
        </div>

        {errorMessage ? (
          <p className="text-sm text-danger" role="alert">{errorMessage}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canWrite && !photo.isCover ? (
            <Button
              aria-disabled={settingCover || undefined}
              className="h-11 aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:h-8"
              disabled={Boolean(pendingAction) && !settingCover}
              onClick={(event) => onAction(photo.id, "cover", event.currentTarget)}
              type="button"
              variant="secondary"
            >
              {settingCover ? (
                <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" size={14} />
              ) : <Star aria-hidden="true" size={14} />}
              {settingCover ? "Setting cover..." : "Set cover"}
            </Button>
          ) : null}
          {canArchive ? (
            <Button
              aria-disabled={archiving || undefined}
              className="h-11 aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:h-8"
              disabled={Boolean(pendingAction) && !archiving}
              onClick={(event) => onAction(photo.id, "archive", event.currentTarget)}
              type="button"
              variant="ghost"
            >
              {archiving ? (
                <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" size={14} />
              ) : <Archive aria-hidden="true" size={14} />}
              {archiving ? "Archiving..." : "Archive"}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="block text-sm">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function groupPhotosByScope(photos: AssetPhoto[]) {
  const showLabel = photos.some((photo) => Boolean(photo.scopeLabel));
  const groups = new Map<string, AssetPhoto[]>();

  for (const photo of photos) {
    const label = photo.scopeLabel ?? "Photos";
    const group = groups.get(label) ?? [];
    group.push(photo);
    groups.set(label, group);
  }

  return [...groups].map(([label, groupedPhotos]) => ({
    label,
    photos: groupedPhotos,
    showLabel,
  }));
}

function FieldError({ children }: { children: ReactNode }) {
  return <p className="text-sm text-danger">{children}</p>;
}
