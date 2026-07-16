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
  validate: (values: TValues) => DraftErrors<TValues>;
};

export function useSettingsDraft<TValues extends DraftValues>({
  action,
  errorMessage,
  initialValues,
  savedMessage,
  savingMessage,
  validate,
}: UseSettingsDraftOptions<TValues>) {
  const [errors, setErrors] = useState<DraftErrors<TValues>>({});
  const [resultMessage, setResultMessage] = useState<string>();
  const [status, setStatus] = useState<DraftStatus>("clean");
  const [statusMessage, setStatusMessage] = useState<string>();
  const [values, setValues] = useState<TValues>(() => ({ ...initialValues }));
  const activeSubmission = useRef(0);
  const alive = useRef(true);
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
    setValues({ ...initialValues });
  }

  function setField<TKey extends keyof TValues>(key: TKey, value: string) {
    revision.current += 1;
    const next = { ...values, [key]: value };
    const isClean = Object.keys(initialValues).every(
      (field) => next[field] === initialValues[field],
    );
    setValues(next);
    setStatus(isClean ? "clean" : "dirty");
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

  async function submit(onInvalid: (field: keyof TValues) => void) {
    const nextErrors = validate(values);
    const firstInvalid = Object.keys(initialValues).find(
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

    if (submitting.current) {
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
      Object.entries(values).forEach(([key, value]) => formData.set(key, value));
      const result = await action({}, formData);

      if (
        !alive.current ||
        activeSubmission.current !== submission ||
        revision.current !== submittedRevision
      ) {
        return;
      }

      setResultMessage(result.message);
      if (result.status === "success") {
        revision.current += 1;
        setValues({ ...initialValues });
        setStatus("saved");
        setStatusMessage(savedMessage);
      } else {
        setStatus("error");
        setStatusMessage(errorMessage);
      }
    } catch {
      if (
        !alive.current ||
        activeSubmission.current !== submission ||
        revision.current !== submittedRevision
      ) {
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

  return {
    discard,
    errors,
    resultMessage,
    setField,
    status,
    statusMessage,
    submit,
    values,
  };
}
