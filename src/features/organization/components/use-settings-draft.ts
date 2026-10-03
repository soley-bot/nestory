"use client";

import { useEffect, useRef, useState } from "react";
import type { DraftStatus } from "@/components/ui/draft-action-bar";
import type { OrganizationActionState } from "@/features/organization/actions";

type DraftValues = Record<string, string>;
type DraftErrors<TValues extends DraftValues> = Partial<
  Record<keyof TValues, string>
>;
type DraftAction = (
  state: OrganizationActionState,
  formData: FormData,
) => Promise<OrganizationActionState>;

type UseSettingsDraftOptions<TValues extends DraftValues> = {
  action: DraftAction;
  initialValues: TValues;
  savingMessage: string;
  savedMessage: string;
  errorMessage: string;
  retainValuesAfterSuccess?: boolean;
  validate: (values: TValues) => DraftErrors<TValues>;
};

export function useSettingsDraft<TValues extends DraftValues>({
  action,
  errorMessage,
  initialValues,
  retainValuesAfterSuccess = false,
  savedMessage,
  savingMessage,
  validate,
}: UseSettingsDraftOptions<TValues>) {
  const [errors, setErrors] = useState<DraftErrors<TValues>>({});
  const [resultMessage, setResultMessage] = useState<string>();
  const [status, setStatus] = useState<DraftStatus>("clean");
  const [statusMessage, setStatusMessage] = useState<string>();
  const [values, setValues] = useState<TValues>(() => ({ ...initialValues }));
  const latestValues = useRef<TValues>({ ...initialValues });
  const activeSubmission = useRef(0);
  const alive = useRef(true);
  const baseline = useRef<TValues>({ ...initialValues });
  const revision = useRef(0);
  const submitting = useRef(false);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      activeSubmission.current += 1;
      submitting.current = false;
    };
  }, []);

  function discard() {
    activeSubmission.current += 1;
    revision.current += 1;
    submitting.current = false;
    setErrors({});
    setResultMessage(undefined);
    setStatus("clean");
    setStatusMessage(undefined);
    latestValues.current = { ...baseline.current };
    setValues({ ...baseline.current });
  }

  function setField<TKey extends keyof TValues>(key: TKey, value: string) {
    revision.current += 1;
    const next = { ...latestValues.current, [key]: value };
    const isClean = Object.keys(baseline.current).every(
      (field) => next[field] === baseline.current[field],
    );
    latestValues.current = next;
    setValues(next);
    setStatus(submitting.current ? "saving" : isClean ? "clean" : "dirty");
    setStatusMessage(undefined);
    setResultMessage(undefined);
    setErrors((current) => {
      if (!(key in current)) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function replaceValues(next: TValues) {
    revision.current += 1;
    latestValues.current = { ...next };
    setValues({ ...next });
    setErrors({});
    setResultMessage(undefined);
    setStatus(
      submitting.current ? "saving" : Object.keys(baseline.current).every(
        (field) => next[field] === baseline.current[field],
      )
        ? "clean"
        : "dirty",
    );
    setStatusMessage(undefined);
  }

  function acceptValues(next: TValues) {
    activeSubmission.current += 1;
    revision.current += 1;
    baseline.current = { ...next };
    submitting.current = false;
    latestValues.current = { ...next };
    setValues({ ...next });
    setErrors({});
    setResultMessage(undefined);
    setStatus("clean");
    setStatusMessage(undefined);
  }

  async function submit(onInvalid: (field: keyof TValues) => void) {
    if (submitting.current) return;
    const submittedValues = { ...latestValues.current };
    const nextErrors = validate(submittedValues);
    const firstInvalid = Object.keys(baseline.current).find(
      (key) => nextErrors[key] !== undefined,
    ) as keyof TValues | undefined;

    if (firstInvalid) {
      setErrors(nextErrors);
      setResultMessage(undefined);
      setStatus("error");
      setStatusMessage(errorMessage);
      requestAnimationFrame(() => onInvalid(firstInvalid));
      return;
    }

    submitting.current = true;

    const submission = activeSubmission.current + 1;
    const submittedRevision = revision.current;
    activeSubmission.current = submission;
    setErrors({});
    setResultMessage(undefined);
    setStatus("saving");
    setStatusMessage(savingMessage);

    try {
      const formData = new FormData();
      Object.entries(submittedValues).forEach(([key, value]) => formData.set(key, value));
      const result = await action({}, formData);

      if (
        !alive.current ||
        activeSubmission.current !== submission
      ) {
        return;
      }

      // A successful response still establishes the server baseline when the
      // user has typed again. Keep their newer draft and don't show stale feedback.
      if (result.status === "success" && retainValuesAfterSuccess) {
        baseline.current = { ...submittedValues };
      }
      if (revision.current !== submittedRevision) {
        reconcileEditedStatus();
        return;
      }

      setResultMessage(result.message);
      if (result.status === "success") {
        revision.current += 1;
        baseline.current = retainValuesAfterSuccess
          ? { ...submittedValues }
          : { ...initialValues };
        latestValues.current = { ...baseline.current };
        setValues({ ...baseline.current });
        setStatus("saved");
        setStatusMessage(savedMessage);
      } else {
        setStatus("error");
        setStatusMessage(errorMessage);
      }
    } catch {
      if (
        !alive.current ||
        activeSubmission.current !== submission
      ) {
        return;
      }
      if (revision.current !== submittedRevision) {
        reconcileEditedStatus();
        return;
      }

      setResultMessage("The setting could not be saved.");
      setStatus("error");
      setStatusMessage(errorMessage);
    } finally {
      if (activeSubmission.current === submission) {
        submitting.current = false;
      }
    }
  }

  function reconcileEditedStatus() {
    const isClean = Object.keys(baseline.current).every(
      (field) => latestValues.current[field] === baseline.current[field],
    );
    setStatus((current) => isClean ? "clean" : current === "error" ? "error" : "dirty");
    setStatusMessage(undefined);
  }

  return {
    acceptValues,
    discard,
    errors,
    resultMessage,
    replaceValues,
    setField,
    status,
    statusMessage,
    submit,
    values,
  };
}
