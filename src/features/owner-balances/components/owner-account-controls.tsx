"use client";

import { useMemo, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SelectControl } from "@/components/ui/select-control";
import type { OwnerBalanceOption } from "@/features/owner-balances/owner-balance.types";

export function OwnerAccountScopeForm({
  ownerOptions,
  propertyOptions,
  selectedMonth,
  selectedOwnerPersonId,
  selectedPropertyId,
}: {
  ownerOptions: OwnerBalanceOption[];
  propertyOptions: OwnerBalanceOption[];
  selectedMonth: string;
  selectedOwnerPersonId?: string;
  selectedPropertyId?: string;
}) {
  const [propertyId, setPropertyId] = useState(selectedPropertyId ?? "");
  const [ownerPersonId, setOwnerPersonId] = useState(
    selectedOwnerPersonId ?? "",
  );
  const matchingOwners = useMemo(
    () =>
      propertyId
        ? ownerOptions.filter(
            (option) =>
              !option.propertyIds || option.propertyIds.includes(propertyId),
          )
        : ownerOptions,
    [ownerOptions, propertyId],
  );
  const selectedOwnerIsAvailable = matchingOwners.some(
    (option) => option.id === ownerPersonId,
  );
  const effectiveOwnerPersonId = selectedOwnerIsAvailable
    ? ownerPersonId
    : "";

  return (
    <form
      className="grid gap-3 border-b border-border pb-4 md:grid-cols-[1.25fr_1.25fr_11rem_auto]"
      method="get"
    >
      <label className="grid gap-1 text-sm font-medium">
        Property
        <SelectControl
          ariaLabel="Property"
          className="h-10"
          name="propertyId"
          onValueChange={(value) => {
            setPropertyId(value);
            setOwnerPersonId("");
          }}
          options={[
            { label: "All properties", value: "" },
            ...propertyOptions.map((option) => ({
              label: option.label,
              value: option.id,
            })),
          ]}
          value={propertyId}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Owner
        <SelectControl
          ariaLabel="Owner"
          className="h-10"
          name="ownerPersonId"
          onValueChange={setOwnerPersonId}
          options={[
            {
              label: "All owners",
              value: "",
            },
            ...matchingOwners.map((option) => ({
              label: option.label,
              value: option.id,
            })),
          ]}
          value={effectiveOwnerPersonId}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Month
        <Input
          className="h-10"
          defaultValue={selectedMonth}
          name="month"
          type="month"
        />
      </label>
      <Button
        className="h-10 self-end px-4"
        type="submit"
      >
        {propertyId && effectiveOwnerPersonId ? "View account" : "Apply filters"}
      </Button>
    </form>
  );
}

export function OwnerAccountOperations({
  closingAuthority,
  generationAuthority,
  openingAuthority,
}: {
  closingAuthority?: ReactNode;
  generationAuthority?: ReactNode;
  openingAuthority?: ReactNode;
}) {
  const [activeOperation, setActiveOperation] = useState<
    "closing" | "generation" | "opening" | null
  >(null);

  if (!closingAuthority && !generationAuthority && !openingAuthority) {
    return null;
  }

  const title =
    activeOperation === "opening"
      ? "Opening balance"
      : activeOperation === "generation"
        ? "Calculate month"
        : "Close month";

  return (
    <>
      <section
        aria-label="Account operations"
        className="flex justify-end border-b border-border pb-3"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <MoreHorizontal size={15} />
              Account actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {openingAuthority ? (
              <DropdownMenuItem onSelect={() => setActiveOperation("opening")}>
                Opening balance
              </DropdownMenuItem>
            ) : null}
            {generationAuthority ? (
              <DropdownMenuItem
                onSelect={() => setActiveOperation("generation")}
              >
                Calculate month
              </DropdownMenuItem>
            ) : null}
            {closingAuthority ? (
              <DropdownMenuItem onSelect={() => setActiveOperation("closing")}>
                Close month
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </section>
      <Modal
        description={
          activeOperation === "opening"
            ? "Set the starting balance for this owner account."
            : activeOperation === "generation"
              ? "Calculate this owner account month from its recorded sources."
              : "Review readiness and close this owner account month."
        }
        onClose={() => setActiveOperation(null)}
        open={activeOperation !== null}
        title={title}
      >
        <div className="p-4">
          {activeOperation === "opening"
            ? openingAuthority
            : activeOperation === "generation"
              ? generationAuthority
              : closingAuthority}
        </div>
      </Modal>
    </>
  );
}
