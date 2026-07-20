"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";

export function WorkspacePageContext({
  context,
  href,
  title,
}: {
  context?: ReactNode;
  href: string;
  title: string;
}) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const breadcrumb = (
    <PageBreadcrumb
      current={context ?? title}
      items={[{ href, label: title }]}
    />
  );
  const target = mounted ? document.getElementById("workspace-page-tools") : null;

  return (
    <>
      {target ? (
        createPortal(breadcrumb, target)
      ) : (
        <span className="sr-only">{context ?? title}</span>
      )}
      <h1 className="sr-only">{title}</h1>
    </>
  );
}
