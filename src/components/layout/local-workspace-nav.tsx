"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type LocalWorkspaceNavItem = {
  active?: boolean;
  href: string;
  icon?: ReactNode;
  label: string;
};

type LocalWorkspaceNavProps = {
  items: readonly LocalWorkspaceNavItem[];
  label: string;
};

export function LocalWorkspaceNav({ items, label }: LocalWorkspaceNavProps) {
  const activeIndex = items.findIndex((item) => item.active);
  const activeItemRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const activeItem = activeItemRef.current;

    if (typeof activeItem?.scrollIntoView === "function") {
      activeItem.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeIndex]);

  return (
    <nav
      aria-label={label}
      className="min-w-0 overflow-x-auto px-4 py-1.5 sm:px-6"
    >
      <div className="flex min-w-max items-center gap-1">
        {items.map((item, index) => {
          const isActive = index === activeIndex;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-foreground-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring",
                isActive && "bg-accent-soft text-foreground",
              )}
              href={item.href}
              key={`${item.href}-${item.label}`}
              prefetch={false}
              ref={isActive ? activeItemRef : undefined}
            >
              {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
