"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  DraftActionBar,
  type DraftStatus,
} from "@/components/ui/draft-action-bar";
import {
  useDrawerCloseRequest,
  useDrawerDraftGuard,
} from "@/components/ui/side-drawer";
import { cn } from "@/lib/utils";

export type RecordFormActionState = {
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
  status?: "error" | "success";
};

type RecordFormProps = {
  action: FormHTMLAttributes<HTMLFormElement>["action"];
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  hideSaveOnSuccess?: boolean;
  onCancel: () => void;
  pending: boolean;
  saveLabel: string;
  savingLabel?: string;
  state: RecordFormActionState;
};

function serializeForm(form: HTMLFormElement) {
  return JSON.stringify(
    Array.from(new FormData(form).entries()).map(([name, value]) => [
      name,
      value instanceof File
        ? [value.name, value.size, value.type, value.lastModified]
        : value,
    ]),
  );
}

export function RecordForm({
  action,
  ariaLabel,
  children,
  className,
  contentClassName,
  hideSaveOnSuccess = false,
  onCancel,
  pending,
  saveLabel,
  savingLabel = "Saving changes",
  state,
}: RecordFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const baselineRef = useRef<string | null>(null);
  const responseSnapshotRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [responseEdited, setResponseEdited] = useState(false);
  const responseKey = JSON.stringify([
    state.status ?? null,
    state.message ?? null,
    state.fieldErrors ?? null,
  ]);
  const [responseTracker, setResponseTracker] = useState({
    pending,
    responseKey,
  });
  const completed = hideSaveOnSuccess && state.status === "success";
  const responseFresh =
    !pending &&
    (responseTracker.pending || responseTracker.responseKey !== responseKey);

  if (
    responseTracker.pending !== pending ||
    responseTracker.responseKey !== responseKey
  ) {
    setResponseTracker({ pending, responseKey });

    if (responseFresh) {
      setResponseEdited(false);
    }
  }

  const status: DraftStatus = pending
    ? "saving"
    : completed
      ? "saved"
      : state.status === "error" && (responseFresh || !responseEdited)
        ? "error"
        : dirty
          ? "dirty"
          : state.status === "success"
            ? "saved"
            : "clean";
  const guard = useMemo(
    () => ({ onDiscard: onCancel, status }),
    [onCancel, status],
  );
  useDrawerDraftGuard(guard);
  const requestClose = useDrawerCloseRequest(onCancel);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const form = formRef.current;

      if (!form) {
        return;
      }

      baselineRef.current = serializeForm(form);
      responseSnapshotRef.current = baselineRef.current;
      setDirty(false);
      setResponseEdited(false);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const form = formRef.current;

    if (!form || responseTracker.pending) {
      return;
    }

    responseSnapshotRef.current = serializeForm(form);
  }, [responseTracker]);

  useEffect(() => {
    if (state.status !== "error") {
      return;
    }

    requestAnimationFrame(() => {
      const form = formRef.current;
      const field = Array.from(
        form?.querySelectorAll<HTMLElement>("[data-record-field]") ?? [],
      ).find((element) =>
        Boolean(state.fieldErrors?.[element.dataset.recordField ?? ""]?.[0]),
      );
      const control = field?.querySelector<HTMLElement>(
        "input:not([type='hidden']), textarea, select, button, [tabindex]:not([tabindex='-1'])",
      );

      (control ?? feedbackRef.current)?.focus();
    });
  }, [state.fieldErrors, state.message, state.status]);

  function updateDirty() {
    queueMicrotask(() => {
      const form = formRef.current;

      if (!form || baselineRef.current === null) {
        return;
      }

      const snapshot = serializeForm(form);

      setDirty(snapshot !== baselineRef.current);
      setResponseEdited(
        responseSnapshotRef.current !== null &&
          snapshot !== responseSnapshotRef.current,
      );
    });
  }

  return (
    <form
      action={action}
      aria-busy={pending ? "true" : "false"}
      aria-label={ariaLabel}
      className={cn("flex h-full flex-col", className)}
      onChangeCapture={updateDirty}
      onClickCapture={updateDirty}
      onInputCapture={updateDirty}
      ref={formRef}
    >
      <fieldset
        className="min-h-0 flex-1 overflow-y-auto border-0 p-0"
        disabled={pending || completed}
      >
        <div className={cn("space-y-5 px-4 py-5 sm:px-5", contentClassName)}>
          {state.message ? (
            <p
              className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm outline-none"
              ref={feedbackRef}
              role={state.status === "error" ? "alert" : "status"}
              tabIndex={-1}
            >
              {state.message}
            </p>
          ) : null}
          {children}
        </div>
      </fieldset>

      <DraftActionBar
        allowDiscardWhenClean
        allowSaveWhenClean
        confirmDiscard={false}
        discardLabel={hideSaveOnSuccess && status === "saved" ? "Close" : "Cancel"}
        onDiscard={requestClose}
        onSave={() => formRef.current?.requestSubmit()}
        saveLabel={saveLabel}
        showSave={!(hideSaveOnSuccess && status === "saved")}
        status={status}
        statusMessage={pending ? savingLabel : undefined}
      />
    </form>
  );
}

type RecordFieldProps = {
  children: ReactNode;
  className?: string;
  error?: string;
  label: string;
  name: string;
  required?: boolean;
};

export function RecordField({
  children,
  className,
  error,
  label,
  name,
  required = false,
}: RecordFieldProps) {
  const errorId = useId();
  const labelId = useId();
  const childArray = Children.toArray(children);
  const controlIndex = childArray.findIndex((child) => isValidElement(child));
  const decoratedChildren = childArray.map((child, index) => {
    if (index !== controlIndex || !isValidElement(child)) {
      return child;
    }

    const control = child as ReactElement<Record<string, unknown>>;
    const describedBy = [control.props["aria-describedby"], error ? errorId : null]
      .filter(Boolean)
      .join(" ");

    return cloneElement(control, {
      "aria-describedby": describedBy || undefined,
      "aria-invalid": error ? "true" : undefined,
      "aria-labelledby": [control.props["aria-labelledby"], labelId]
        .filter(Boolean)
        .join(" "),
      "aria-required": required ? "true" : undefined,
    });
  });

  return (
    <div
      aria-describedby={error ? errorId : undefined}
      aria-labelledby={labelId}
      className={cn("block min-w-0 text-sm font-medium", className)}
      data-record-field={name}
      role="group"
    >
      <span id={labelId}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-1 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </span>
      <div className="mt-2">{decoratedChildren}</div>
      {error ? (
        <p className="mt-1 text-xs text-danger" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
