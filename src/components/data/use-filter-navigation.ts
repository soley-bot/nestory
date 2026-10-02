"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRegisterSearch } from "@/components/ui/use-register-search";

export type FilterNavigation = ReturnType<typeof useFilterNavigation>;

export function useFilterNavigation(appliedQuery: string, queryParam: string, resetPage = false) {
  const pathname = usePathname();
  const router = useRouter();
  const committed = useSearchParams().toString();
  const source = `${pathname}?${committed}`;
  const pending = useRef({ source, query: committed, requests: [] as string[] });
  const [isPending, startTransition] = useTransition();
  const [navigation, setNavigation] = useState({ source, target: null as string | null, requests: [] as string[], version: 0 });
  let currentNavigation = navigation;
  if (navigation.source !== source) {
    const acknowledgement = navigation.requests.lastIndexOf(source);
    currentNavigation = {
      source,
      target: acknowledgement >= 0 ? navigation.target : null,
      requests: acknowledgement >= 0 ? navigation.requests.filter((_, index) => index !== acknowledgement) : [],
      version: navigation.version + (acknowledgement >= 0 ? 0 : 1),
    };
    setNavigation(currentNavigation);
  }
  const search = useRegisterSearch(appliedQuery, value => update(params => {
    if (value) params.set(queryParam, value); else params.delete(queryParam);
  }), `${pathname}:${currentNavigation.version}`);

  function synchronize() {
    const current = pending.current;
    if (current.source !== source) {
      const acknowledgement = current.requests.lastIndexOf(source);
      pending.current = {
        source,
        query: acknowledgement >= 0 ? current.query : committed,
        requests: acknowledgement >= 0 ? current.requests.filter((_, index) => index !== acknowledgement) : [],
      };
    }
    return pending.current;
  }

  const synchronizeCommitted = useEffectEvent(() => {
    synchronize();
    if (currentNavigation.target && currentNavigation.target !== source) {
      const params = new URLSearchParams(currentNavigation.target.slice(currentNavigation.target.indexOf("?") + 1));
      search.expectResponse(params.get(queryParam) ?? "");
      navigate(params);
    }
  });
  useEffect(() => { synchronizeCommitted(); }, [source]);

  function navigate(params: URLSearchParams, method: "push" | "replace" = "replace") {
    const current = synchronize();
    if (resetPage) params.delete("page");
    const query = params.toString();
    const requests = [...current.requests, `${pathname}?${query}`];
    pending.current = { source, query, requests };
    setNavigation(previous => ({ ...previous, source, target: `${pathname}?${query}`, requests }));
    startTransition(() => { router[method](query ? `${pathname}?${query}` : pathname, { scroll: false }); });
  }

  function update(change: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(synchronize().query);
    change(params);
    navigate(params);
  }

  function reset(params: URLSearchParams, method: "push" | "replace" = "replace") {
    search.reset(params.get(queryParam) ?? "");
    navigate(params, method);
  }

  function cancelPending() {
    pending.current = { source, query: committed, requests: [] };
    search.cancelPending();
    setNavigation(previous => ({ source, target: null, requests: [], version: previous.version + 1 }));
  }

  const onHistoryNavigation = useEffectEvent(cancelPending);
  useEffect(() => {
    const onPopState = () => onHistoryNavigation();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const requested = currentNavigation.target;
  const params = requested === null ? null : new URLSearchParams(requested.slice(requested.indexOf("?") + 1));
  return { cancelPending, isPending, params, reset, search, update };
}
