import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

type BreadcrumbItem = {
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
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-xs">
      {items.map((item) => (
        <span className="contents" key={`${item.href}:${item.label}`}>
          <Link
            className="truncate text-foreground-muted underline-offset-2 hover:text-foreground hover:underline"
            href={item.href}
          >
            {item.label}
          </Link>
          <ChevronRight aria-hidden="true" className="shrink-0 text-foreground-subtle" size={13} />
        </span>
      ))}
      <span aria-current="page" className="truncate font-medium text-foreground">
        {current}
      </span>
    </nav>
  );
}
