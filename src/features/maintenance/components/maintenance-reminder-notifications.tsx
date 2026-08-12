"use client";

import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useState } from "react";
import type { MaintenanceReminderNotification } from "@/features/maintenance/maintenance.types";

type MaintenanceReminderNotificationsProps = {
  reminders: MaintenanceReminderNotification[];
};

export function MaintenanceReminderNotifications({
  reminders,
}: MaintenanceReminderNotificationsProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || reminders.length === 0) {
    return null;
  }

  const reminder = reminders[0];

  return (
    <aside
      aria-label="Maintenance notifications"
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-md border border-border bg-card p-3 shadow-lg print:hidden"
    >
      <div className="flex items-start gap-2">
        <Bell className="mt-0.5 shrink-0 text-warning" size={16} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            Delivered in app
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            {reminder.title}
          </p>
          {reminders.length > 1 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {reminders.length - 1} more delivered notification
              {reminders.length === 2 ? "" : "s"}
            </p>
          ) : null}
        </div>
        <button
          aria-label="Dismiss notifications"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => setDismissed(true)}
          title="Dismiss notifications"
          type="button"
        >
          <X size={14} />
        </button>
      </div>
      <Link
        className="mt-2 inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium transition-colors hover:bg-muted"
        href={reminder.href}
        prefetch={false}
      >
        Open reminder
      </Link>
    </aside>
  );
}
