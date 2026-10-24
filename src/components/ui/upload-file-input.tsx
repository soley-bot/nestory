"use client";

import { useId, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { MAX_SERVER_UPLOAD_BYTES, SERVER_UPLOAD_SIZE_MESSAGE } from "@/lib/uploads/upload-limits";

export function UploadFileInput({ onChange, ref, "aria-describedby": describedBy, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  return <>
    <Input {...props} type="file" ref={(node) => {
      inputRef.current = node;
      if (typeof ref === "function") return ref(node);
      if (ref) ref.current = node;
    }} aria-invalid={error ? true : props["aria-invalid"]}
      aria-describedby={[describedBy, error ? errorId : undefined].filter(Boolean).join(" ") || undefined}
      onChange={(event) => {
        const oversized = Array.from(event.currentTarget.files ?? []).some((file) => file.size > MAX_SERVER_UPLOAD_BYTES);
        const message = oversized ? SERVER_UPLOAD_SIZE_MESSAGE : "";
        if (oversized) event.currentTarget.value = "";
        event.currentTarget.setCustomValidity(message);
        setError(message);
        onChange?.(event);
      }} />
    {error ? <div className="mt-2 text-sm">
      <p className="text-danger" id={errorId} role="alert">{error}</p>
      <button type="button" className="mt-1 underline" onClick={() => {
        const input = inputRef.current;
        if (input) {
          input.value = "";
          input.setCustomValidity("");
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        setError("");
      }}>Clear file selection</button>
    </div> : null}
  </>;
}
