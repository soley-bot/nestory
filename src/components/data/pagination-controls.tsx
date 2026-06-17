"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationState = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};

type PaginationControlsProps = {
  pagination: PaginationState;
};

export function PaginationControls({ pagination }: PaginationControlsProps) {
  const previousDisabled = pagination.page <= 1;
  const nextDisabled = pagination.page >= pagination.totalPages;
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-surface px-3 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing{" "}
        <span className="font-medium text-foreground">
          {pagination.from}-{pagination.to}
        </span>{" "}
        of{" "}
        <span className="font-medium text-foreground">
          {pagination.totalCount}
        </span>
      </p>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <p className="text-xs">
          Page {pagination.page} of {pagination.totalPages}
        </p>
        <div className="flex items-center gap-1">
          <PaginationLink
            disabled={previousDisabled}
            page={pagination.page - 1}
            pathname={pathname}
            searchParams={searchParams}
          >
            <ChevronLeft size={15} />
            Previous
          </PaginationLink>
          <PaginationLink
            disabled={nextDisabled}
            page={pagination.page + 1}
            pathname={pathname}
            searchParams={searchParams}
          >
            Next
            <ChevronRight size={15} />
          </PaginationLink>
        </div>
      </div>
    </div>
  );
}

function PaginationLink({
  children,
  disabled,
  page,
  pathname,
  searchParams,
}: {
  children: ReactNode;
  disabled: boolean;
  page: number;
  pathname: string;
  searchParams: Pick<URLSearchParams, "toString">;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium opacity-50"
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors",
        "hover:bg-surface-muted",
      )}
      href={buildPageHref({ page, pathname, searchParams })}
      scroll={false}
    >
      {children}
    </Link>
  );
}

function buildPageHref({
  page,
  pathname,
  searchParams,
}: {
  page: number;
  pathname: string;
  searchParams: Pick<URLSearchParams, "toString">;
}) {
  const nextParams = new URLSearchParams(searchParams.toString());

  if (page <= 1) {
    nextParams.delete("page");
  } else {
    nextParams.set("page", String(page));
  }

  const query = nextParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}
