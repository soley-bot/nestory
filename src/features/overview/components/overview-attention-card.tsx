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
}: {
  items: readonly OverviewAttentionItem[];
  metric: OverviewMetric;
}) {
  const value = typeof metric.value === "string" ? metric.value : metric.value.primary;
  const count = items.reduce((total, item) => total + item.count, 0);
  const ariaCount = count > 0 ? `${count} open checks` : "no open checks";

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
            Open operating checks for this workspace.
          </DialogDescription>
        </DialogHeader>
        {items.length > 0 ? (
          <div className="divide-y divide-border rounded-lg border border-border">
            {items.map((item) => (
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
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            No open checks need attention.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
