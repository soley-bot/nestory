"use client";
import { createContext, useContext } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getSavedViewResource } from "./saved-views";
import { SavedViewsControl } from "./saved-views-control";

export const SavedViewScope = createContext<string | null>(null);
export function RegisterSavedViews() {
  const scope = useContext(SavedViewScope);
  return scope ? <RegisterViews scope={scope} /> : null;
}
function RegisterViews({ scope }: { scope: string }) {
  const pathname = usePathname();
  const query = useSearchParams();
  if (pathname.startsWith("/reports/") || !getSavedViewResource(pathname)) return null;
  return <SavedViewsControl scope={scope} resource={pathname} query={query.toString()} />;
}
