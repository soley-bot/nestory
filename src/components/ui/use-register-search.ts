"use client";

import { useEffect, useEffectEvent, useState, type FormEvent } from "react";

/** Keep typing responsive while URL-backed register requests finish out of order. */
export function useRegisterSearch(
  appliedQuery: string,
  onApply: (query: string) => void,
  navigationKey = "",
) {
  const [state, setState] = useState({
    navigationKey,
    source: appliedQuery,
    value: appliedQuery,
    submitted: [] as string[],
  });
  const [composing, setComposing] = useState(false);
  const [paused, setPaused] = useState(false);
  let current = state;
  if (state.source !== appliedQuery || state.navigationKey !== navigationKey) {
    const acknowledgement = state.navigationKey === navigationKey
      ? state.submitted.indexOf(appliedQuery)
      : -1;
    current = {
      navigationKey,
      source: appliedQuery,
      value: acknowledgement >= 0 ? state.value : appliedQuery,
      submitted:
        // A newer response does not acknowledge older requests. Keep those
        // pending so a late response cannot masquerade as external navigation.
        acknowledgement >= 0 ? state.submitted.filter((_, index) => index !== acknowledgement) : [],
    };
    setState(current);
  }
  const query = current.value;

  function expectResponse(value: string) {
    setState(previous => ({ ...previous, submitted: [...previous.submitted, value] }));
  }

  function submit() {
    const next = query.trim();
    if (composing || next === appliedQuery || current.submitted.at(-1) === next)
      return;
    expectResponse(next);
    onApply(next);
  }
  const applyLatest = useEffectEvent(submit);
  useEffect(() => {
    if (composing || paused || query.trim() === appliedQuery) return;
    const timer = window.setTimeout(applyLatest, 500);
    return () => window.clearTimeout(timer);
  }, [query, appliedQuery, composing, paused]);

  return {
    expectResponse,
    query,
    onQueryChange(value: string) {
      setPaused(false);
      setState((previous) => ({ ...previous, value }));
    },
    cancelPending() { setPaused(true); },
    reset(value: string) {
      setPaused(true);
      setState(previous => ({ ...previous, value, submitted: [...previous.submitted, value.trim()] }));
    },
    onCompositionChange: setComposing,
    onSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      submit();
    },
  };
}
