"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRegisterSearch } from "@/components/ui/use-register-search";

export type RegisterNavigation = ReturnType<typeof useRegisterNavigation>;

export function useRegisterNavigation(appliedQuery: string) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const committed = searchParams.toString();
  const pending = useRef({ source: committed, query: committed, requests: [] as string[] });
  const [isPending, startTransition] = useTransition();
  const [navigation, setNavigation] = useState({
    source: committed,
    requests: [] as string[],
    version: 0,
  });
  let currentNavigation = navigation;
  if (navigation.source !== committed) {
    const acknowledgement = navigation.requests.lastIndexOf(committed);
    currentNavigation = {
      source: committed,
      requests: acknowledgement >= 0 ? navigation.requests.slice(acknowledgement + 1) : [],
      version: navigation.version + (acknowledgement >= 0 ? 0 : 1),
    };
    setNavigation(currentNavigation);
  }
  const search = useRegisterSearch(
    appliedQuery,
    (value) => replaceParam("query", value, ""),
    `${pathname}:${currentNavigation.version}`,
  );

  function synchronize() {
    const current = pending.current;
    if (current.source !== committed) {
      const acknowledgement = current.requests.lastIndexOf(committed);
      pending.current = {
        source: committed,
        query: acknowledgement >= 0 ? current.query : committed,
        requests: acknowledgement >= 0 ? current.requests.slice(acknowledgement + 1) : [],
      };
    }
    return pending.current;
  }

  const synchronizeCommitted = useEffectEvent(synchronize);
  useEffect(() => {
    synchronizeCommitted();
  }, [committed]);

  function replaceParam(name: string, value: string, defaultValue: string) {
    const current = synchronize();
    const nextParams = new URLSearchParams(current.query);
    if (value === defaultValue || value.trim() === "") {
      nextParams.delete(name);
    } else {
      nextParams.set(name, value);
    }
    if (name !== "view") {
      nextParams.delete("page");
    }
    const query = nextParams.toString();
    pending.current = { ...current, query, requests: [...current.requests, query] };
    setNavigation((previous) => ({
      ...previous,
      source: committed,
      requests: [...current.requests, query],
    }));
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function cancelPending() {
    pending.current = { source: committed, query: committed, requests: [] };
    search.cancelPending();
    setNavigation((previous) => ({
      source: committed,
      requests: [],
      version: previous.version + 1,
    }));
  }

  const onHistoryNavigation = useEffectEvent(() => {
    cancelPending();
  });
  useEffect(() => {
    const onPopState = () => onHistoryNavigation();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const pendingQuery = currentNavigation.requests.at(-1);
  const pendingParams = pendingQuery === undefined ? null : new URLSearchParams(pendingQuery);
  return { cancelPending, isPending, pendingParams, replaceParam, search };
}
