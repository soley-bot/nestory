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
  className?: string;
  /** Lets a screen intercept navigation, e.g. the settings unsaved-changes guard. */
  onItemClick?: (
    event: React.MouseEvent<HTMLAnchorElement>,
    item: LocalWorkspaceNavItem,
  ) => void;
};

export function LocalWorkspaceNav({
  className,
  items,
  label,
  onItemClick,
}: LocalWorkspaceNavProps) {
  const activeIndex = items.findIndex((item) => item.active);
  const activeItemRef = useRef<HTMLAnchorElement | null>(null);
  const navigationRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const activeItem = activeItemRef.current;
    const navigation = navigationRef.current;

    if (typeof activeItem?.scrollIntoView === "function") {
      activeItem.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    }

    if (!activeItem || !navigation) return;

    const keepFullyVisible = () => {
      const activeBounds = activeItem.getBoundingClientRect();
      const navigationBounds = navigation.getBoundingClientRect();

      if (activeBounds.right > navigationBounds.right) {
        navigation.scrollLeft += Math.ceil(
          activeBounds.right - navigationBounds.right,
        );
      } else if (activeBounds.left < navigationBounds.left) {
        navigation.scrollLeft -= Math.ceil(
          navigationBounds.left - activeBounds.left,
        );
      }
    };

    keepFullyVisible();
    const frame = requestAnimationFrame(keepFullyVisible);

    return () => cancelAnimationFrame(frame);
  }, [activeIndex]);

  return (
    <nav
      aria-label={label}
      className={cn("min-w-0 overflow-x-auto px-4 py-1.5 sm:px-6", className)}
      ref={navigationRef}
    >
      {/* Matches the shadcn TabsList treatment: one muted track, the active
          item raised onto the page background. */}
      <div className="inline-flex min-w-max items-center rounded-lg bg-muted p-0.5 text-muted-foreground">
        {items.map((item, index) => {
          const isActive = index === activeIndex;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex h-7 shrink-0 scroll-mx-1 items-center gap-2 rounded-md border border-transparent px-2.5 text-sm font-medium outline-none transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                isActive &&
                  "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30",
              )}
              href={item.href}
              key={`${item.href}-${item.label}`}
              onClick={
                onItemClick ? (event) => onItemClick(event, item) : undefined
              }
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
