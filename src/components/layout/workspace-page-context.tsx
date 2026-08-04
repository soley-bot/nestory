import type { ReactNode } from "react";

import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";

export function WorkspacePageContext({
  context,
  href,
  title,
}: {
  context?: ReactNode;
  href: string;
  title: string;
}) {
  const breadcrumb = (
    <PageBreadcrumb
      current={context ?? title}
      items={[{ href, label: title }]}
    />
  );

  return (
    <PageHeader breadcrumb={breadcrumb} context={context} title={title} />
  );
}
