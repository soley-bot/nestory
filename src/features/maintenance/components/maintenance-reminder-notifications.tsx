"use client";

import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { MaintenanceReminderNotification } from "@/features/maintenance/maintenance.types";
import {
  getMaintenanceReminderDelayMs,
  isMaintenanceReminderRelevant,
} from "@/features/maintenance/maintenance.notifications";

type MaintenanceReminderNotificationsProps = {
  reminders: MaintenanceReminderNotification[];
};

export function MaintenanceReminderNotifications({
  reminders,
}: MaintenanceReminderNotificationsProps) {
  const [permission, setPermission] =
    useState<NotificationPermission | "unsupported">("unsupported");
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      setPermission(
        "Notification" in window ? Notification.permission : "unsupported",
      );
      setNowMs(Date.now());
    }, 0);

    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (permission !== "granted" || reminders.length === 0) {
      return;
    }

    const timers = reminders.flatMap((reminder) => {
      const delayMs = getMaintenanceReminderDelayMs({
        reminderAt: reminder.reminderAt,
      });

      if (delayMs === null) {
        return [];
      }

      const timer = window.setTimeout(() => {
        notifyOnce(reminder);
      }, delayMs);

      return [timer];
    });

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [permission, reminders]);

  const activeReminders =
    nowMs === null
      ? []
      : reminders.filter((reminder) =>
          isMaintenanceReminderRelevant({
            nowMs,
            reminderAt: reminder.reminderAt,
          }),
        );
  const dueCount =
    nowMs === null
      ? 0
      : activeReminders.filter(
          (reminder) =>
            getMaintenanceReminderDelayMs({
              nowMs,
              reminderAt: reminder.reminderAt,
            }) === 0,
        ).length;

  if (activeReminders.length === 0) {
    return null;
  }

  const activeReminderKey = activeReminders
    .map((reminder) => `${reminder.id}:${reminder.reminderAt}`)
    .sort()
    .join("|");

  if (dismissedKey === activeReminderKey) {
    return null;
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    setPermission(await Notification.requestPermission());
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-md border border-border bg-surface p-2 shadow-lg print:hidden">
      <div className="flex items-start gap-2 px-2 py-1.5">
        <Bell
          className={dueCount > 0 ? "text-danger" : "text-warning"}
          size={16}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            {dueCount > 0
              ? `${dueCount} reminder${dueCount === 1 ? "" : "s"} due now`
              : `${activeReminders.length} reminder${
                  activeReminders.length === 1 ? "" : "s"
                } scheduled`}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-muted">
            {activeReminders[0]?.title}
          </p>
        </div>
        <button
          aria-label="Dismiss reminders"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          onClick={() => setDismissedKey(activeReminderKey)}
          title="Dismiss reminders"
          type="button"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {permission === "default" ? (
          <button
            className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium transition-colors hover:bg-surface-muted"
            onClick={enableNotifications}
            type="button"
          >
            Enable browser alerts
          </button>
        ) : null}
        {permission === "granted" ? (
          <span className="inline-flex h-8 items-center rounded-md border border-success/20 bg-success-soft px-2.5 text-[12px] font-medium text-success">
            Browser alerts on
          </span>
        ) : null}
        {permission === "denied" || permission === "unsupported" ? (
          <span className="inline-flex h-8 items-center rounded-md border border-border bg-surface-muted px-2.5 text-[12px] font-medium text-muted">
            Browser alerts off
          </span>
        ) : null}
        <Link
          className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium transition-colors hover:bg-surface-muted"
          href="/maintenance?review=reminders"
          prefetch={false}
        >
          Open reminders
        </Link>
      </div>
    </div>
  );
}

function notifyOnce(reminder: MaintenanceReminderNotification) {
  const key = `nestory-maintenance-reminder:${reminder.id}:${reminder.reminderAt}`;

  if (window.localStorage.getItem(key)) {
    return;
  }

  window.localStorage.setItem(key, "sent");

  const notification = new Notification(reminder.title, {
    body: `${reminder.propertyLabel} / ${reminder.unitLabel} / ${reminder.dueLabel}`,
    tag: key,
  });

  notification.onclick = () => {
    window.focus();
    window.location.href = reminder.href;
  };
}
