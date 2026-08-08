import Link from "next/link";
import type { ReactNode } from "react";

export type OverviewSummaryItem = {
  href?: string;
  label: string;
  value: ReactNode;
};

export function OverviewSummary({
  items,
  label,
}: {
  items: OverviewSummaryItem[];
  label: string;
}) {
  return (
    <section aria-label={`${label} summary`} className="px-1 py-1.5">
      <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-sm">
        {items.map((item) => (
          <div className="flex items-baseline gap-1.5 whitespace-nowrap" key={item.label}>
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              {item.href ? (
                <Link className="underline-offset-2 hover:underline" href={item.href}>
                  {item.value}
                </Link>
              ) : (
                item.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
