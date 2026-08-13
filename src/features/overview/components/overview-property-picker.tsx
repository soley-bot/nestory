"use client";

import Link from "next/link";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildOverviewHref } from "@/features/overview/overview.filters";
import type {
  OverviewPropertyOption,
  OverviewViewQuery,
} from "@/features/overview/overview.types";

export function OverviewPropertyPicker({
  options,
  query,
}: {
  options: readonly OverviewPropertyOption[];
  query: OverviewViewQuery;
}) {
  const current = options.find((option) => option.value === query.propertyId);
  const currentLabel = current?.label ?? "All properties";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Change property, currently ${currentLabel}`}
          className="w-64 justify-between"
          size="sm"
          variant="outline"
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronsUpDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <PropertyOption
          active={query.propertyId === "all"}
          href={buildOverviewHref(query, { propertyId: "all" })}
          label="All properties"
        />
        {options.map((option) => (
          <PropertyOption
            active={query.propertyId === option.value}
            href={buildOverviewHref(query, { propertyId: option.value })}
            key={option.value}
            label={option.label}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PropertyOption({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <DropdownMenuItem asChild>
      <Link className="justify-between" href={href} prefetch={false}>
        <span className="truncate">{label}</span>
        {active ? <Check aria-hidden="true" /> : null}
      </Link>
    </DropdownMenuItem>
  );
}
