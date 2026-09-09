"use client";

import Link from "next/link";
import { CheckCircle2, X } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";

export type TransientFeedbackAction = {
  href: string;
  label: string;
};

export function TransientFeedback({
  action,
  message,
  onDismiss,
}: {
  action?: TransientFeedbackAction;
  message: string;
  onDismiss: () => void;
}) {
  const dismiss = useEffectEvent(onDismiss);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (action || hovered || focused) {
      return;
    }

    const timeoutId = window.setTimeout(dismiss, 4_500);
    return () => window.clearTimeout(timeoutId);
  }, [action, message, hovered, focused]);

  return (
    <div
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[70] flex w-[min(420px,calc(100vw-2rem))] items-start gap-3 rounded-lg border border-border bg-popover p-3 text-sm shadow-lg print:hidden"
      data-slot="transient-feedback"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      aria-atomic="true"
      role="status"
    >
      <CheckCircle2
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-success"
        size={17}
      />
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium leading-5 text-foreground">{message}</p>
        {action ? (
          <Link
            className="mt-2 inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            href={action.href}
            prefetch={false}
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      <button
        aria-label="Dismiss notification"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" size={15} />
      </button>
    </div>
  );
}
