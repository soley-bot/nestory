"use client";

import { startTransition, useActionState, useEffect, useRef, type SubmitEvent } from "react";
import type { AuthActionState } from "@/features/auth/actions";

type AuthFormAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
const initialState: AuthActionState = {};

export function useAuthForm(serverAction: AuthFormAction) {
  const [state, action, pending] = useActionState(serverAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const submitLocked = useRef(false);

  useEffect(() => {
    if (!pending) submitLocked.current = false;
  }, [pending]);

  useEffect(() => {
    const form = formRef.current;
    const feedback = form?.querySelector<HTMLElement>("[aria-invalid='true']")
      ?? form?.querySelector<HTMLElement>("[role='alert'], [role='status']");
    feedback?.focus();
  }, [state]);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || submitLocked.current) return;
    submitLocked.current = true;
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return { state, action, pending, formRef, onSubmit };
}
