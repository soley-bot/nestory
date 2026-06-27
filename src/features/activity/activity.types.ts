export type RecentChangeTone = "neutral" | "success" | "warning" | "accent";

export type ActivityChangeDetail = {
  after: string;
  before: string;
  field: string;
};

export type RecentChange = {
  action: string;
  actionLabel: string;
  createdAt: string;
  details: ActivityChangeDetail[];
  entityLabel: string;
  href: string;
  id: string;
  recordLabel: string;
  tone: RecentChangeTone;
};
