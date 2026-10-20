"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type SubmitEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import type { AuthActionState } from "@/features/auth/actions";

type AuthFormAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
const initialState: AuthActionState = {};

export function useAuthForm(serverAction: AuthFormAction) {
  // Keep the registered server reference so native forms work before hydration.
  const [serverState, action, serverPending] = useActionState(serverAction, initialState);
  const [clientState, setClientState] = useState<AuthActionState | null>(null);
  const [clientPending, startClientTransition] = useTransition();
  const state = clientState ?? serverState;
  const pending = serverPending || clientPending;
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
    startClientTransition(async () => {
      try {
        const nextState = await serverAction(state, formData);
        startClientTransition(() => setClientState(nextState));
      } catch (error) {
        unstable_rethrow(error);
        // A rejected transport may have completed the server mutation. Keep the
        // result unknown and ask for a fresh read instead of retrying the write.
        startClientTransition(() => setClientState({
          message: "We could not confirm the request. Refresh this page before trying again.",
          status: "error",
        }));
      }
    });
  }

  return { state, action, pending, formRef, onSubmit };
}
