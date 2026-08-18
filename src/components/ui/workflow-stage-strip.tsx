import { cn } from "@/lib/utils";

const stages = [
  { id: "property", label: "Property" },
  { id: "owner", label: "Owner" },
  { id: "unit", label: "Unit" },
  { id: "lease", label: "Lease" },
  { id: "finance", label: "Finance" },
] as const;

export type WorkflowStage = (typeof stages)[number]["id"];

export function WorkflowStageStrip({
  className,
  current,
}: {
  className?: string;
  current: WorkflowStage;
}) {
  const currentIndex = stages.findIndex((stage) => stage.id === current);

  return (
    <nav
      aria-label="Setup progress"
      className={cn("overflow-x-auto border-y border-border/70 py-3", className)}
    >
      <ol className="flex min-w-max items-center" role="list">
        {stages.map((stage, index) => {
          const active = stage.id === current;
          const complete = index < currentIndex;

          return (
            <li
              className="flex items-center text-xs font-medium"
              key={stage.id}
            >
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mx-2 h-px w-5 bg-border sm:w-8",
                    (complete || active) && "bg-foreground/35",
                  )}
                />
              ) : null}
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "rounded-full px-2.5 py-1 text-muted-foreground transition-colors",
                  complete && "text-foreground",
                  active && "bg-foreground text-background",
                )}
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
