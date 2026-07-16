import type { ReactNode } from "react";
import { CheckCircle2, Info, LockKeyhole, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusNoticeTone = "blocked" | "error" | "info" | "success";

type StatusNoticeProps = {
  action?: ReactNode;
  className?: string;
  message: ReactNode;
  title: ReactNode;
  tone?: StatusNoticeTone;
};

const presentations = {
  blocked: {
    Icon: LockKeyhole,
    className: "border-warning/25 bg-warning-soft text-warning",
  },
  error: {
    Icon: TriangleAlert,
    className: "border-danger/25 bg-danger-soft text-danger",
  },
  info: {
    Icon: Info,
    className: "border-border bg-surface-muted text-foreground-muted",
  },
  success: {
    Icon: CheckCircle2,
    className: "border-success/25 bg-success-soft text-success",
  },
} satisfies Record<StatusNoticeTone, { Icon: typeof Info; className: string }>;

export function StatusNotice({
  action,
  className,
  message,
  title,
  tone = "info",
}: StatusNoticeProps) {
  const { Icon, className: toneClassName } = presentations[tone];
  const isError = tone === "error";

  return (
    <section
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-md border px-3 py-2.5 text-sm",
        toneClassName,
        className,
      )}
      data-tone={tone}
    >
      <div
        aria-atomic="true"
        aria-live={isError ? "assertive" : "polite"}
        className="flex min-w-0 flex-1 items-start gap-2.5"
        role={isError ? "alert" : "status"}
      >
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{title}</p>
          <div className="mt-0.5 leading-5 text-foreground-muted">{message}</div>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}
