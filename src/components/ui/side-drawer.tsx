"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SideDrawerProps = {
  children: React.ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  size?: "default" | "preview";
  title: string;
};

export function SideDrawer({
  children,
  description,
  onClose,
  open,
  size = "default",
  title,
}: SideDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    requestAnimationFrame(() => {
      drawerRef.current?.focus();
    });

    return () => {
      const previouslyFocusedElement = previouslyFocusedElementRef.current;

      if (previouslyFocusedElement?.isConnected) {
        previouslyFocusedElement.focus();
      }

      previouslyFocusedElementRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const getFocusableElements = () => {
      if (!drawerRef.current) {
        return [];
      }

      return Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          [
            "a[href]",
            "button:not([disabled])",
            "textarea:not([disabled])",
            "input:not([disabled])",
            "select:not([disabled])",
            "[tabindex]:not([tabindex='-1'])",
          ].join(","),
        ),
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          !element.getAttribute("aria-hidden") &&
          element.offsetParent !== null,
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();

      if (focusableElements.length === 0) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }

      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusStartedOnDrawer = activeElement === drawerRef.current;
      const focusStartedOutsideDrawer =
        activeElement !== null && !drawerRef.current?.contains(activeElement);

      if (
        event.shiftKey &&
        (focusStartedOnDrawer ||
          focusStartedOutsideDrawer ||
          activeElement === firstFocusableElement)
      ) {
        event.preventDefault();
        lastFocusableElement.focus();
      } else if (
        !event.shiftKey &&
        (focusStartedOnDrawer ||
          focusStartedOutsideDrawer ||
          activeElement === lastFocusableElement)
      ) {
        event.preventDefault();
        firstFocusableElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed bottom-0 left-0 top-0 z-50 flex justify-end bg-foreground/20"
      role="dialog"
      style={{ right: "var(--removed-body-scroll-bar-size, 0px)" }}
      {...(description ? { "aria-describedby": descriptionId } : {})}
    >
      <button
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        className={cn(
          "relative flex h-full w-full flex-col border-l border-border bg-surface shadow-xl",
          size === "preview"
            ? "max-w-[min(100vw,520px)]"
            : "max-w-[min(100vw,600px)]",
        )}
        ref={drawerRef}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p
                className="mt-1 text-[13px] leading-5 text-foreground-muted"
                id={descriptionId}
              >
                {description}
              </p>
            ) : null}
          </div>
          <Button
            aria-label="Close drawer"
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            <X size={16} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
