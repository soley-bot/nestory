"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type {
  OverviewAttentionItem,
  OverviewMetric,
} from "@/features/overview/overview.types";

export function OverviewAttentionCard({
  items,
  metric,
  month,
  propertyId = "all",
}: {
  items: readonly OverviewAttentionItem[];
  metric: OverviewMetric;
  month: string;
  propertyId?: string;
}) {
  const value = typeof metric.value === "string" ? metric.value : metric.value.primary;
  const count = items.reduce((total, item) => total + item.count, 0);
  const ariaCount = count > 0 ? `${count} open checks` : "no open checks";
  const recordChecks = items.filter(item => item.kind === "data-quality");
  const operatingWork = items.filter(item => item.kind !== "data-quality");
  const recordCount = recordChecks.reduce((sum, item) => sum + item.count, 0);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          aria-label={`Needs attention, ${ariaCount}`}
          className="rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          type="button"
        >
          <Card className="h-full transition-colors hover:bg-muted/50" size="sm">
            <CardHeader>
              <CardTitle><h2>Needs attention</h2></CardTitle>
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground">{operatingWork.reduce((sum, item) => sum + item.count, 0)} operating · {recordCount} record {recordCount === 1 ? "check" : "checks"}</p>
              <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
                <Badge tone={count > 0 ? "warning" : "neutral"}>
                  <CircleAlert aria-hidden="true" className="size-3" />
                  {count > 0 ? "Review" : "Clear"}
                </Badge>
              </div>
            </CardHeader>
          </Card>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Needs attention</DialogTitle>
          <DialogDescription>
            Operating work and record checks for this scope. A record may appear in more than one check.
          </DialogDescription>
        </DialogHeader>
        {items.length > 0 ? (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {[{ title: "Operating work", items: operatingWork }, { title: "Record checks", items: recordChecks }].filter(group => group.items.length).map(group => <section key={group.title}>
            <h3 className="mb-2 text-sm font-semibold">{group.title}</h3>
            <div className="divide-y divide-border rounded-lg border border-border">
            {group.items.map((item) => (
              <div className="grid grid-cols-[1fr_auto] gap-3 p-3" key={item.id}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{item.label}</p>
                    <Badge tone={item.tone}>{item.count}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.helper}</p>
                </div>
                <Link
                  className="inline-flex items-center gap-1 self-center text-sm font-medium text-foreground hover:underline"
                  href={item.href}
                >
                  {item.actionLabel} <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
            ))}
            </div></section>)}
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            No open checks need attention.
          </p>
        )}
        <div className="flex justify-end border-t border-border pt-3">
          <Link
            className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
            href={`/overview/attention?month=${month}${propertyId === "all" ? "" : `&propertyId=${encodeURIComponent(propertyId)}`}`}
          >
            View all checks <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
