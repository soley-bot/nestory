"use client";

import { UploadFileInput } from "@/components/ui/upload-file-input";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import type { FinanceOperationsActionState } from "@/features/finance-operations/finance-operations.types";

export function useSuccess(
  state: FinanceOperationsActionState,
  onSuccess: (message: string) => void,
) {
  useEffect(() => {
    if (state.status === "success" && state.message) onSuccess(state.message);
  }, [onSuccess, state.message, state.status]);
}
export function useStableActionId(prefix: string) {
  const [id] = useState(() => stableId(prefix));
  return id;
}
export function stableId(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
export function ReceiptEvidenceField({ required = false }: { required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);
  return (
    <div className="space-y-2">
      <Field label={required ? "Replacement receipt" : "Receipt (optional)"}>
        <UploadFileInput
          accept="application/pdf,image/jpeg,image/png,image/webp"
          name="evidenceFile"
          onChange={(event) => setHasFile(Boolean(event.currentTarget.files?.length))}
          ref={inputRef}
          required={required}

        />
      </Field>
      {hasFile ? (
        <Button
          onClick={() => {
            const input = inputRef.current;
            if (!input) return;
            input.value = "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            setHasFile(false);
            input.focus();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Remove receipt
        </Button>
      ) : null}
    </div>
  );
}
export function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
export function FormFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
      {children}
    </div>
  );
}
export function SubmitButton({
  disabled,
  label,
}: {
  disabled?: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={disabled || pending} type="submit" variant="default">
      {pending ? "Saving…" : label}
    </Button>
  );
}
export function ActionMessage({ state }: { state: FinanceOperationsActionState }) {
  return state.status === "error" && state.message ? (
    <p
      className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {state.message}
    </p>
  ) : null;
}
export function DefinitionRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="overflow-hidden rounded-md border border-border">
      {rows.map(([label, value]) => (
        <div
          className="grid grid-cols-[minmax(120px,0.4fr)_1fr] gap-3 border-b border-border px-3 py-2 last:border-b-0"
          key={label}
        >
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
