export type RecentChangeTone = "neutral" | "success" | "warning" | "accent";

export type RecentChange = {
  action: string;
  actionLabel: string;
  createdAt: string;
  entityLabel: string;
  id: string;
  recordLabel: string;
  tone: RecentChangeTone;
};
