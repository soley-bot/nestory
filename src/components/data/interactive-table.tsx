import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export const previewRowClassName =
  "cursor-pointer border-t border-border transition-colors hover:bg-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export const selectedPreviewRowClassName =
  "bg-muted shadow-[inset_3px_0_0_var(--accent)]";

type RecordLinkProps = Omit<
  ComponentProps<typeof Link>,
  "children" | "className" | "onClick"
> & {
  children: ReactNode;
  className?: string;
  onClick?: ComponentProps<typeof Link>["onClick"];
  stopPropagation?: boolean;
};

export function RecordLink({
  children,
  className,
  onClick,
  prefetch = false,
  stopPropagation = true,
  ...props
}: RecordLinkProps) {
  return (
    <Link
      {...props}
      className={cn(
        "-mx-1 inline-flex max-w-full items-center gap-1 rounded-sm px-1 py-0.5 font-medium text-accent outline-offset-1 transition-colors hover:bg-accent hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        className,
      )}
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
        onClick?.(event);
      }}
      prefetch={prefetch}
    >
      <span className="truncate">{children}</span>
      <ExternalLink
        aria-hidden="true"
        className="shrink-0 opacity-70"
        size={12}
        strokeWidth={2.25}
      />
    </Link>
  );
}
