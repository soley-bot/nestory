"use client";

import { UploadCloud } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDropzone, type Accept } from "react-dropzone";
import { cn } from "@/lib/utils";
import { MAX_SERVER_UPLOAD_BYTES, SERVER_UPLOAD_SIZE_MESSAGE } from "@/lib/uploads/upload-limits";

export const DOCUMENT_FILE_ACCEPT: Accept = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export const PHOTO_FILE_ACCEPT: Accept = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export const CSV_FILE_ACCEPT: Accept = {
  "text/csv": [".csv"],
};

type FileDropzoneFieldProps = {
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  "aria-labelledby"?: string;
  "aria-required"?: boolean | "false" | "true";
  accept: Accept;
  className?: string;
  description?: string;
  disabled?: boolean;
  displayFileName?: string;
  name?: string;
  maxSize?: number;
  onFile?: (file: File) => void;
  onClear?: () => void;
  onReject?: () => void;
  openRef?: { current: (() => void) | null };
  required?: boolean;
};

export function FileDropzoneField(props: FileDropzoneFieldProps) {
  const {
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
  "aria-required": ariaRequired,
  accept,
  className,
  description,
  disabled = false,
  displayFileName,
  name,
  maxSize = MAX_SERVER_UPLOAD_BYTES,
  onFile,
  onClear,
  onReject,
  openRef,
  required = false,
  } = props;
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const syncedDropFileRef = useRef<File | null>(null);
  const errorId = useId();
  const { getInputProps, getRootProps, inputRef, isDragActive } = useDropzone({
    accept,
    disabled,
    maxSize,
    maxFiles: 1,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDropAccepted(files, event) {
      if (disabled || inputRef.current?.matches(":disabled")) return;
      const eventType = event && "type" in event ? event.type : "";
      const file = files[0];

      if (!file) {
        return;
      }
      if (eventType === "change" && syncedDropFileRef.current === file) {
        syncedDropFileRef.current = null;
        return;
      }

      const input = inputRef.current;
      if (eventType === "drop" && input && input.files?.[0] !== file) {
        try {
          const transfer = new DataTransfer();
          transfer.items.add(file);
          input.files = transfer.files;
        } catch {
          const message = "This browser could not attach the dropped file. Please browse for it instead.";
          clearFileInput(input);
          input.setCustomValidity(message);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          setFileName("");
          setError(message);
          onReject?.();
          return;
        }
        syncedDropFileRef.current = file;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        window.setTimeout(() => {
          if (syncedDropFileRef.current === file) syncedDropFileRef.current = null;
        }, 0);
      }

      setFileName(file.name);
      setError("");
      inputRef.current?.setCustomValidity("");
      onFile?.(file);
    },
    onDropRejected(rejections) {
      if (disabled || inputRef.current?.matches(":disabled")) return;
      const message = rejections.some((item) => item.errors.some((error) => error.code === "file-too-large"))
        ? SERVER_UPLOAD_SIZE_MESSAGE : "Choose one file in an accepted format.";
      setError(message);
      setFileName("");
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.setCustomValidity(message);
        inputRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      }
      onReject?.();
    },
  });
  const handleOpen = useCallback(() => {
    if (disabled || inputRef.current?.matches(":disabled")) return;
    // react-dropzone's open() clears input.files before showing the picker.
    // Native click preserves the current attachment if the user cancels.
    inputRef.current?.click();
  }, [disabled, inputRef]);
  useEffect(() => {
    if (!openRef) {
      return;
    }

    openRef.current = handleOpen;

    return () => {
      openRef.current = null;
    };
  }, [handleOpen, openRef]);
  const displayLabel =
    displayFileName ??
    (fileName || (isDragActive ? "Drop file here" : "Drop file here or browse"));
  return (
    <div>
      <input
        {...getInputProps({ name })}
        aria-label={ariaLabel}
        aria-describedby={[ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : ariaInvalid}
        aria-labelledby={ariaLabelledBy}
        aria-required={ariaRequired ?? required}
        required={required}
        disabled={disabled}
      />
      <button
        {...getRootProps({
          "aria-describedby": ariaDescribedBy,
          "aria-labelledby": ariaLabelledBy,
          onClick(event) {
            event.preventDefault();
            handleOpen();
          },
          role: "button",
          className: cn(
            "flex min-h-24 w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-input bg-card px-3 py-4 text-center text-sm transition-colors hover:border-accent hover:bg-muted/60",
            isDragActive && "border-primary/40 bg-accent/40",
            className,
          ),
        })}
        disabled={disabled}
        type="button"
      >
        <UploadCloud className="text-muted-foreground" size={18} />
        <span className="mt-2 max-w-full break-all font-medium text-foreground">
          {displayLabel}
        </span>
        {description ? (
          <span className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </button>
      {error ? <div className="mt-2 text-sm">
        <p className="text-danger" id={errorId} role="alert">{error}</p>
        <button type="button" disabled={disabled} className="mt-1 underline" onClick={() => {
          clearFileInput(inputRef.current);
          inputRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
          setError("");
          setFileName("");
          onClear?.();
        }}>Clear file selection</button>
      </div> : null}
    </div>
  );
}

function clearFileInput(input: HTMLInputElement | null) {
  if (!input) return;
  input.value = "";
  input.setCustomValidity("");
}
