import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export type BreadcrumbItem = {
  href: string;
  label: string;
};

export function PageBreadcrumb({
  current,
  items,
}: {
  current: ReactNode;
  items: BreadcrumbItem[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {items.map((item) => (
        <span className="inline-flex min-w-0 max-w-full items-center gap-2" key={`${item.href}:${item.label}`}>
          <Link
            className="inline-flex min-h-6 min-w-0 items-center whitespace-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [overflow-wrap:anywhere]"
            href={item.href}
          >
            {item.label}
          </Link>
          <ChevronRight aria-hidden="true" className="shrink-0 text-muted-foreground" size={13} />
        </span>
      ))}
      <span aria-current="page" className="min-w-0 flex-1 basis-[8rem] whitespace-normal font-medium text-foreground [overflow-wrap:anywhere]">
        {current}
      </span>
    </nav>
  );
}
