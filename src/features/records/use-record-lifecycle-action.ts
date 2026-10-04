"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  type FormEvent,
} from "react";
import {
  useOverlayCloseRequest,
  useOverlayDraftGuard,
} from "@/components/ui/overlay-dismissal-context";

type LifecycleState = { status?: "error" | "success"; message?: string };

export function useRecordLifecycleAction({
  action,
  initialState,
  onClose,
  onSuccess,
  successMessage,
  blocked = false,
}: {
  action: (state: LifecycleState, data: FormData) => Promise<LifecycleState>;
  initialState: LifecycleState;
  onClose: () => void;
  onSuccess: (message: string) => void;
  successMessage: string;
  blocked?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const locked = useRef(false);
  const completed = useRef(false);
  const guard = useMemo(
    () => ({ status: pending ? "saving" as const : "clean" as const }),
    [pending],
  );
  useOverlayDraftGuard(guard);
  const requestClose = useOverlayCloseRequest(onClose);

  useEffect(() => {
    if (!pending) {
      locked.current = false;
    }
    if (state.status === "success" && !completed.current) {
      completed.current = true;
      onSuccess(state.message ?? successMessage);
      onClose();
    }
  }, [onClose, onSuccess, pending, state.message, state.status, successMessage]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || pending || locked.current || completed.current) {
      return;
    }
    locked.current = true;
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }

  return { state, pending, onSubmit, requestClose };
}
