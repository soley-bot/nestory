"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Modal({
  children,
  description,
  onClose,
  open,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => dialogRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) {
          event.preventDefault();
          dialogRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [onClose, open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-[90] grid place-items-center bg-background/75 p-3 backdrop-blur-[2px]"
      role="dialog"
    >
      <button aria-hidden="true" className="absolute inset-0 cursor-default" onClick={onClose} tabIndex={-1} type="button" />
      <section
        className="relative flex max-h-[min(82vh,680px)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl outline-none"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground" id={titleId}>{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-foreground-muted" id={descriptionId}>{description}</p> : null}
          </div>
          <Button aria-label="Close modal" className="h-8 w-8 shrink-0 px-0" onClick={onClose} type="button" variant="ghost">
            <X size={15} />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
