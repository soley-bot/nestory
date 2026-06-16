"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type SideDrawerProps = {
  children: React.ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function SideDrawer({
  children,
  description,
  onClose,
  open,
  title,
}: SideDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-foreground/20"
      role="dialog"
    >
      <button
        aria-label="Close drawer"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <aside className="relative flex h-full w-full max-w-[560px] flex-col border-l border-border bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
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
