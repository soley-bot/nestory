export function getMaintenanceReminderDelayMs({
  maxDelayMs = MAX_MAINTENANCE_REMINDER_DELAY_MS,
  nowMs = Date.now(),
  reminderAt,
}: {
  maxDelayMs?: number;
  nowMs?: number;
  reminderAt: string;
}) {
  const reminderMs = Date.parse(reminderAt);

  if (!Number.isFinite(reminderMs)) {
    return null;
  }

  const delayMs = reminderMs - nowMs;

  if (delayMs <= 0) {
    return 0;
  }

  return delayMs <= maxDelayMs ? delayMs : null;
}

export const MAX_MAINTENANCE_REMINDER_DELAY_MS = 7 * 24 * 60 * 60 * 1_000;

export function isMaintenanceReminderRelevant({
  maxDelayMs = MAX_MAINTENANCE_REMINDER_DELAY_MS,
  nowMs = Date.now(),
  reminderAt,
}: {
  maxDelayMs?: number;
  nowMs?: number;
  reminderAt: string;
}) {
  return getMaintenanceReminderDelayMs({
    maxDelayMs,
    nowMs,
    reminderAt,
  }) !== null;
}
