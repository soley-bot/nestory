import React, { type ComponentProps } from "react";
export function usePathname() { return "/synthetic-register"; }
export function useSearchParams() { return new URLSearchParams("status=open&page=2"); }
export default function Link({ href, children, prefetch: _prefetch, scroll: _scroll, ...props }: ComponentProps<"a"> & { prefetch?: boolean; scroll?: boolean }) {
  void _prefetch;
  void _scroll;
  return <a href={String(href)} {...props}>{children}</a>;
}
