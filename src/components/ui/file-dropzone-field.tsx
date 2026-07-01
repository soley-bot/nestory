"use client";

import { UploadCloud } from "lucide-react";
import { useState } from "react";
import { useDropzone, type Accept } from "react-dropzone";
import { cn } from "@/lib/utils";

export const DOCUMENT_FILE_ACCEPT: Accept = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export const CSV_FILE_ACCEPT: Accept = {
  "text/csv": [".csv"],
};

type FileDropzoneFieldProps = {
  accept: Accept;
  className?: string;
  description?: string;
  name?: string;
  onFile?: (file: File) => void;
  required?: boolean;
};

export function FileDropzoneField({
  accept,
  className,
  description,
  name,
  onFile,
  required = false,
}: FileDropzoneFieldProps) {
  const [fileName, setFileName] = useState("");
  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    accept,
    maxFiles: 1,
    multiple: false,
    onDropAccepted(files) {
      const file = files[0];

      if (!file) {
        return;
      }

      setFileName(file.name);
      onFile?.(file);
    },
  });

  return (
    <div
      {...getRootProps({
        className: cn(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface px-3 py-4 text-center text-sm transition-colors hover:border-accent hover:bg-surface-muted/60",
          isDragActive && "border-accent bg-accent-soft/40",
          className,
        ),
      })}
    >
      <input {...getInputProps({ name })} aria-required={required} />
      <UploadCloud className="text-muted" size={18} />
      <span className="mt-2 font-medium text-foreground">
        {fileName || (isDragActive ? "Drop file here" : "Drop file here or browse")}
      </span>
      {description ? (
        <span className="mt-1 text-xs leading-5 text-muted">{description}</span>
      ) : null}
    </div>
  );
}
