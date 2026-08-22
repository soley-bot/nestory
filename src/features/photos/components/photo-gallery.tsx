"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { ReactNode } from "react";
import { Archive, ImageIcon, Star, X } from "lucide-react";
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
import { formatDate } from "@/lib/dates/format";

const initialState: PhotoActionState = {};

type PhotoPreview = {
  name: string;
  url: string;
};

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
  const openPhotoPickerRef = useRef<(() => void) | null>(null);

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
    <section>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="text-muted-foreground" size={16} />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {canWrite ? (
          <Button onClick={() => setUploadOpen(true)} type="button" variant="outline">
            <ImageIcon size={14} />
            {uploadLabel}
          </Button>
        ) : null}
      </div>

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
                    key={photo.id}
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
  photo,
}: {
  canArchive: boolean;
  canWrite: boolean;
  photo: AssetPhoto;
}) {
  return (
    <article className="overflow-hidden rounded-md border border-border bg-muted/40">
      <div className="relative aspect-[4/3] bg-muted">
        {photo.url ? (
          <Image
            alt={photo.caption || photo.fileName}
            className="size-full object-cover"
            fill
            sizes="(min-width: 1536px) 300px, (min-width: 640px) 50vw, 100vw"
            src={photo.url}
            unoptimized
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon size={22} />
          </div>
        )}
        {photo.isCover ? (
          <div className="absolute left-2 top-2">
            <Badge tone="accent">Cover</Badge>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={photo.caption || photo.fileName}>
            {photo.caption || photo.fileName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {photo.takenAt ? `Taken ${formatDate(photo.takenAt)}` : `Uploaded ${formatDate(photo.uploadedAt)}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canWrite && !photo.isCover ? (
            <PhotoActionForm action={setAssetPhotoCoverAction} photoId={photo.id}>
              <Button type="submit" variant="secondary">
                <Star size={14} />
                Set cover
              </Button>
            </PhotoActionForm>
          ) : null}
          {canArchive ? (
            <PhotoActionForm action={archiveAssetPhotoAction} photoId={photo.id}>
              <Button type="submit" variant="ghost">
                <Archive size={14} />
                Archive
              </Button>
            </PhotoActionForm>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function PhotoActionForm({
  action,
  children,
  photoId,
}: {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
  photoId: string;
}) {
  return (
    <form action={action}>
      <input name="photoId" type="hidden" value={photoId} />
      {children}
    </form>
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
