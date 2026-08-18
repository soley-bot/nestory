import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type FormSectionProps = {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  step?: string;
  title: ReactNode;
};

export function FormSection({
  children,
  className,
  description,
  step,
  title,
}: FormSectionProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <section
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={cn(
        "space-y-4 border-b border-border/70 pb-6 last:border-b-0 last:pb-0",
        className,
      )}
      data-slot="form-section"
      role="group"
    >
      <div className="flex items-start gap-3">
        {step ? (
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background"
          >
            {step}
          </span>
        ) : null}
        <div className="min-w-0 pt-0.5">
          <h3 className="text-sm font-semibold tracking-tight text-foreground" id={titleId}>
            {title}
          </h3>
        {description ? (
          <div
            className="mt-1 text-sm leading-5 text-muted-foreground"
            id={descriptionId}
          >
            {description}
          </div>
          ) : null}
        </div>
      </div>
      <div className={cn("space-y-3", step && "sm:pl-10")}>{children}</div>
    </section>
  );
}
