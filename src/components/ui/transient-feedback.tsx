"use client";

import Link from "next/link";
import { CheckCircle2, X } from "lucide-react";
import { useEffect, useEffectEvent } from "react";

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

  useEffect(() => {
    if (action) {
      return;
    }

    const timeoutId = window.setTimeout(dismiss, 4_500);
    return () => window.clearTimeout(timeoutId);
  }, [action, message]);

  return (
    <div
      className="fixed bottom-4 right-4 z-[70] flex w-[min(420px,calc(100vw-2rem))] items-start gap-3 rounded-md border border-success/30 bg-surface-raised p-3 text-sm shadow-xl print:hidden"
      data-slot="transient-feedback"
      role="status"
    >
      <CheckCircle2
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-success"
        size={17}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{message}</p>
        {action ? (
          <Link
            className="mt-2 inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
            href={action.href}
            prefetch={false}
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      <button
        aria-label="Dismiss notification"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" size={15} />
      </button>
    </div>
  );
}
