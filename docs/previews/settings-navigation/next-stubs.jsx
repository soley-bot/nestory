import React from "react";
function navigate(href, replace = false) {
  history[replace ? "replaceState" : "pushState"]({}, "", href);
  window.dispatchEvent(new Event("preview-route"));
}
const router = { push: navigate, replace: (href) => navigate(href, true), refresh: () => {} };
export const useRouter = () => router;
export default function Link({ href, children, onClick, ...props }) {
  const anchorProps = { ...props };
  delete anchorProps.prefetch;
  return <a {...anchorProps} href={href} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); navigate(href); } }}>{children}</a>;
}
