import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  className?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  title: string;
};

export function ErrorState({
  className,
  message,
  onRetry,
  retryLabel = "Try again",
  title,
}: ErrorStateProps) {
  return (
    <section
      className={cn(
        "flex min-h-40 flex-col items-start justify-center px-5 py-6 text-sm",
        className,
      )}
      data-kind="error"
    >
      <div
        aria-hidden="true"
        className="mb-3 flex size-9 items-center justify-center rounded-md bg-danger-soft text-danger"
      >
        <CircleAlert className="size-4" />
      </div>
      <div aria-atomic="true" aria-live="assertive" role="alert">
        <h2 className="font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-xl leading-5 text-foreground-muted">{message}</p>
      </div>
      {onRetry ? (
        <Button className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </section>
  );
}
