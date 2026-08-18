import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type FormSectionProps = {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
};

export function FormSection({
  children,
  className,
  description,
  title,
}: FormSectionProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <section
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={cn(
        "space-y-3 border-b border-border/70 pb-5 last:border-b-0 last:pb-0",
        className,
      )}
      role="group"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground" id={titleId}>
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
      <div className="space-y-3">{children}</div>
    </section>
  );
}
