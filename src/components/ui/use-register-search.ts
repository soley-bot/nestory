"use client";

import { useEffect, useEffectEvent, useState, type FormEvent } from "react";

/** Keep typing responsive while URL-backed register requests finish out of order. */
export function useRegisterSearch(
  appliedQuery: string,
  onApply: (query: string) => void,
) {
  const [state, setState] = useState({
    source: appliedQuery,
    value: appliedQuery,
    submitted: [] as string[],
  });
  const [composing, setComposing] = useState(false);
  const [paused, setPaused] = useState(false);
  let current = state;
  if (state.source !== appliedQuery) {
    const acknowledgement = state.submitted.indexOf(appliedQuery);
    current = {
      source: appliedQuery,
      value: acknowledgement >= 0 ? state.value : appliedQuery,
      submitted:
        acknowledgement >= 0 ? state.submitted.slice(acknowledgement + 1) : [],
    };
    setState(current);
  }
  const query = current.value;

  function submit() {
    const next = query.trim();
    if (composing || next === appliedQuery || current.submitted.at(-1) === next)
      return;
    setState((previous) => ({
      ...previous,
      submitted: [...previous.submitted, next],
    }));
    onApply(next);
  }
  const applyLatest = useEffectEvent(submit);
  useEffect(() => {
    if (composing || paused || query.trim() === appliedQuery) return;
    const timer = window.setTimeout(applyLatest, 500);
    return () => window.clearTimeout(timer);
  }, [query, appliedQuery, composing, paused]);

  return {
    query,
    onQueryChange(value: string) {
      setPaused(false);
      setState((previous) => ({ ...previous, value }));
    },
    cancelPending() { setPaused(true); },
    onCompositionChange: setComposing,
    onSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      submit();
    },
  };
}
