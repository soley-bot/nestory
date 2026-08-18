"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  KeyRound,
  Landmark,
  Plus,
  UserRound,
  UsersRound,
} from "lucide-react";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SelectControl } from "@/components/ui/select-control";
import { PersonForm } from "@/features/people/components/person-form";
import { PersonSelect } from "@/features/people/components/person-select";
import { PropertyForm } from "@/features/properties/components/property-form";
import { UnitForm } from "@/features/units/components/unit-form";
import { LeaseForm } from "@/features/leases/components/lease-form";
import {
  activateSetupLeaseAction,
  initialActivateSetupLeaseState,
} from "@/features/property-setup/actions";
import {
  buildPropertySetupQuery,
  clearPropertySetupSelectionAfter,
  findOpenLeaseForUnit,
  getHighestPropertySetupStep,
  propertySetupRequiresUnit,
} from "@/features/property-setup/property-setup";
import type {
  PropertySetupData,
  PropertySetupSelection,
  PropertySetupStep,
} from "@/features/property-setup/property-setup.types";
import { formatMoney } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type CreateModal = "owner" | "property" | "unit" | "tenant" | "lease" | null;

const steps: Array<{
  icon: typeof UserRound;
  label: string;
  step: PropertySetupStep;
}> = [
  { icon: UserRound, label: "Owner", step: 1 },
  { icon: Building2, label: "Property and space", step: 2 },
  { icon: UsersRound, label: "Tenant and lease", step: 3 },
  { icon: Landmark, label: "Rent setup", step: 4 },
  { icon: Check, label: "Done", step: 5 },
];

export function PropertySetupScreen({
  data,
  step,
}: {
  data: PropertySetupData;
  step: PropertySetupStep;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createModal, setCreateModal] = useState<CreateModal>(null);
  const { selection } = data;
  const requiresUnit = propertySetupRequiresUnit(data.properties, selection);
  const setupReady = data.readiness?.ready !== false;
  const highestStep = getHighestPropertySetupStep(selection, {
    ready: setupReady,
    requiresUnit,
  });
  const owner = data.owners.find((option) => option.id === selection.ownerId);
  const property = data.properties.find(
    (option) => option.id === selection.propertyId,
  );
  const unit = data.units.find((option) => option.id === selection.unitId);
  const tenant = data.tenants.find(
    (option) => option.id === selection.tenantId,
  );
  const lease = data.leases.find((option) => option.id === selection.leaseId);
  const propertyOptions = data.properties.filter(
    (option) => option.ownerPersonId === selection.ownerId,
  );
  const unitOptions = data.units.filter(
    (option) => option.propertyId === selection.propertyId,
  );
  const matchingLeases = data.leases.filter(
    (option) =>
      option.propertyId === selection.propertyId &&
      option.unitId === selection.unitId &&
      option.tenantPersonId === selection.tenantId,
  );
  const openLeaseForUnit = findOpenLeaseForUnit(data.leases, selection);

  function navigate(nextSelection: PropertySetupSelection, nextStep = step) {
    const nextParams = buildPropertySetupQuery({
      selection: nextSelection,
      step: nextStep,
    });
    startTransition(() => {
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    });
  }

  function changeSelection(
    field: keyof PropertySetupSelection,
    value: string | null,
  ) {
    navigate(clearPropertySetupSelectionAfter(selection, field, value));
  }

  function completeCreation(
    field: keyof PropertySetupSelection,
    id: string | undefined,
    nextStep: PropertySetupStep,
  ) {
    if (!id) return;
    setCreateModal(null);
    navigate(clearPropertySetupSelectionAfter(selection, field, id), nextStep);
  }

  return (
    <WorkspacePage
      actions={
        <Link
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/properties"
        >
          <ArrowLeft size={14} />
          Properties
        </Link>
      }
      breadcrumbItems={[{ href: "/properties", label: "Properties" }]}
      context={`Step ${step} of 5`}
      contextHref="/properties/setup"
      title="Set up property"
    >
      <div className="workspace-gutter-x py-4">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <SetupRail
            currentStep={step}
            highestStep={highestStep}
            onStepChange={(nextStep) => navigate(selection, nextStep)}
          />

          <main className="min-w-0 rounded-lg border border-border bg-card shadow-sm">
            <header className="border-b border-border px-4 py-4 sm:px-5">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {steps[step - 1]?.label}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">
                {stepTitle(step, requiresUnit)}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                {stepDescription(step, requiresUnit)}
              </p>
            </header>

            <div aria-busy={pending} className="space-y-5 p-4 sm:p-5">
              {step === 1 ? (
                <OwnerStep
                  onCreate={() => setCreateModal("owner")}
                  onSelect={(id) => changeSelection("ownerId", id || null)}
                  options={data.owners}
                  value={selection.ownerId ?? ""}
                />
              ) : null}
              {step === 2 ? (
                <div className="space-y-5">
                  <SelectRecordStep
                    createLabel="Create new property"
                    emptyCopy="No active properties are linked to this owner yet."
                    label="Property"
                    onCreate={() => setCreateModal("property")}
                    onSelect={(id) => changeSelection("propertyId", id || null)}
                    options={propertyOptions.map((option) => ({
                      label: option.label,
                      value: option.id,
                    }))}
                    placeholder="Choose property"
                    value={selection.propertyId ?? ""}
                  />
                  {property ? (
                    requiresUnit ? (
                      <SelectRecordStep
                        createLabel="Create new rental space"
                        emptyCopy="This property has no rental spaces yet."
                        label="Rental space"
                        onCreate={() => setCreateModal("unit")}
                        onSelect={(id) => changeSelection("unitId", id || null)}
                        options={unitOptions.map((option) => ({
                          label: `${option.label} · ${option.statusLabel}`,
                          value: option.id,
                        }))}
                        placeholder="Choose rental space"
                        value={selection.unitId ?? ""}
                      />
                    ) : (
                      <WholePropertyStep propertyLabel={property.label} />
                    )
                  ) : null}
                </div>
              ) : null}
              {step === 3 ? (
                <TenantLeaseStep
                  data={data}
                  matchingLeases={matchingLeases}
                  onCreateLease={() => setCreateModal("lease")}
                  onCreateTenant={() => setCreateModal("tenant")}
                  onLeaseSelect={(id) => changeSelection("leaseId", id || null)}
                  onTenantSelect={(id) =>
                    changeSelection("tenantId", id || null)
                  }
                  onUseExistingLease={() => {
                    if (!openLeaseForUnit) return;
                    navigate(
                      {
                        ...selection,
                        leaseId: openLeaseForUnit.id,
                        tenantId: openLeaseForUnit.tenantPersonId,
                      },
                      4,
                    );
                  }}
                  openLeaseForUnit={openLeaseForUnit}
                  selection={selection}
                />
              ) : null}
              {step === 4 && owner && property && tenant && lease ? (
                <RentSetupStep
                  lease={lease}
                  owner={owner}
                  property={property}
                  readiness={data.readiness ?? null}
                  tenant={tenant}
                  unit={unit}
                />
              ) : null}
              {step === 5 && owner && property && tenant && lease ? (
                <DoneStep
                  lease={lease}
                  owner={owner}
                  property={property}
                  tenant={tenant}
                  unit={unit}
                />
              ) : null}
            </div>

            {step < 5 ? (
              <footer className="flex items-center justify-between gap-3 border-t border-border bg-muted/45 px-4 py-3 sm:px-5">
                <Button
                  disabled={step === 1}
                  onClick={() =>
                    navigate(selection, (step - 1) as PropertySetupStep)
                  }
                  variant="ghost"
                >
                  <ArrowLeft size={14} />
                  Back
                </Button>
                <Button
                  disabled={pending || highestStep <= step}
                  onClick={() =>
                    navigate(selection, (step + 1) as PropertySetupStep)
                  }
                  variant="default"
                >
                  Continue
                  <ArrowRight size={14} />
                </Button>
              </footer>
            ) : null}
          </main>
        </div>
      </div>

      <CreateRecordModal
        data={data}
        modal={createModal}
        onClose={() => setCreateModal(null)}
        onLeaseCreated={(id) => completeCreation("leaseId", id, 4)}
        onOwnerCreated={(id) => completeCreation("ownerId", id, 2)}
        onPropertyCreated={(id) => completeCreation("propertyId", id, 2)}
        onTenantCreated={(id) => completeCreation("tenantId", id, 3)}
        onUnitCreated={(id) => completeCreation("unitId", id, 3)}
        selection={selection}
      />
    </WorkspacePage>
  );
}

function SetupRail({
  currentStep,
  highestStep,
  onStepChange,
}: {
  currentStep: PropertySetupStep;
  highestStep: PropertySetupStep;
  onStepChange: (step: PropertySetupStep) => void;
}) {
  return (
    <nav
      aria-label="Property setup steps"
      className="rounded-lg border border-border bg-card p-2 shadow-sm lg:self-start"
    >
      <ol className="grid gap-1 sm:grid-cols-5 lg:grid-cols-1">
        {steps.map((item) => {
          const Icon = item.icon;
          const completed = item.step < highestStep;
          const available = item.step <= highestStep;
          return (
            <li key={item.step}>
              <button
                aria-current={item.step === currentStep ? "step" : undefined}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  item.step === currentStep
                    ? "bg-accent text-foreground"
                    : available
                      ? "text-muted-foreground hover:bg-muted"
                      : "cursor-not-allowed text-muted-foreground/60",
                )}
                disabled={!available}
                onClick={() => onStepChange(item.step)}
                type="button"
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                    completed
                      ? "border-success/40 bg-success-soft text-success"
                      : "border-border bg-card",
                  )}
                >
                  {completed ? <Check size={13} /> : item.step}
                </span>
                <Icon
                  className="hidden shrink-0 sm:block lg:hidden"
                  size={14}
                />
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function OwnerStep({
  onCreate,
  onSelect,
  options,
  value,
}: {
  onCreate: () => void;
  onSelect: (value: string) => void;
  options: PropertySetupData["owners"];
  value: string;
}) {
  return (
    <section className="space-y-3">
      <label className="block text-sm font-medium">
        Existing owner
        <PersonSelect
          className="mt-2"
          context="Property setup owner"
          onValueChange={onSelect}
          name="ownerId"
          options={options}
          placeholder="Search owners"
          roles={["owner"]}
          value={value}
        />
      </label>
      <OrCreateButton label="Create new owner" onClick={onCreate} />
    </section>
  );
}

function SelectRecordStep({
  createLabel,
  emptyCopy,
  label,
  onCreate,
  onSelect,
  options,
  placeholder,
  value,
}: {
  createLabel: string;
  emptyCopy: string;
  label: string;
  onCreate: () => void;
  onSelect: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  value: string;
}) {
  return (
    <section className="space-y-3">
      <label className="block text-sm font-medium">
        Existing {label.toLowerCase()}
        <SelectControl
          className="mt-2"
          onValueChange={onSelect}
          options={[{ label: placeholder, value: "" }, ...options]}
          value={value}
        />
      </label>
      {options.length === 0 ? (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {emptyCopy}
        </p>
      ) : null}
      <OrCreateButton label={createLabel} onClick={onCreate} />
    </section>
  );
}

function WholePropertyStep({ propertyLabel }: { propertyLabel: string }) {
  return (
    <section className="space-y-3">
      <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        {propertyLabel} is set up for whole-property leasing, so its lease is
        held against the property with no unit. Change the rental structure on
        the property record if it should be leased as separate units instead.
      </p>
    </section>
  );
}

function TenantLeaseStep({
  data,
  matchingLeases,
  onCreateLease,
  onCreateTenant,
  onLeaseSelect,
  onTenantSelect,
  onUseExistingLease,
  openLeaseForUnit,
  selection,
}: {
  data: PropertySetupData;
  matchingLeases: PropertySetupData["leases"];
  onCreateLease: () => void;
  onCreateTenant: () => void;
  onLeaseSelect: (value: string) => void;
  onTenantSelect: (value: string) => void;
  onUseExistingLease: () => void;
  openLeaseForUnit?: PropertySetupData["leases"][number];
  selection: PropertySetupSelection;
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-md border border-border p-3 sm:p-4">
        <h2 className="text-sm font-semibold">Tenant</h2>
        <PersonSelect
          context="Property setup tenant"
          name="tenantId"
          onValueChange={onTenantSelect}
          options={data.tenants}
          placeholder="Search tenants"
          roles={["tenant"]}
          value={selection.tenantId ?? ""}
        />
        <OrCreateButton label="Create new tenant" onClick={onCreateTenant} />
      </section>

      <section className="space-y-3 rounded-md border border-border p-3 sm:p-4">
        <h2 className="text-sm font-semibold">Lease or occupancy</h2>
        {selection.tenantId ? (
          <SelectControl
            onValueChange={onLeaseSelect}
            options={[
              { label: "Choose matching lease", value: "" },
              ...matchingLeases.map((lease) => ({
                label: lease.label,
                value: lease.id,
              })),
            ]}
            value={selection.leaseId ?? ""}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Choose or create the tenant first.
          </p>
        )}
        {openLeaseForUnit ? (
          <div className="rounded-md border border-warning/30 bg-warning-soft/30 p-3 text-sm">
            <p className="font-medium text-foreground">
              This unit already has an open lease for {openLeaseForUnit.label}.
            </p>
            <Button
              className="mt-2"
              onClick={onUseExistingLease}
              variant="secondary"
            >
              Use existing lease
            </Button>
          </div>
        ) : null}
        <OrCreateButton
          disabled={!selection.tenantId || Boolean(openLeaseForUnit)}
          label="Create new lease"
          onClick={onCreateLease}
        />
      </section>
    </div>
  );
}

function RentSetupStep({
  lease,
  owner,
  property,
  readiness,
  tenant,
  unit,
}: {
  lease: PropertySetupData["leases"][number];
  owner: PropertySetupData["owners"][number];
  property: PropertySetupData["properties"][number];
  readiness: PropertySetupData["readiness"];
  tenant: PropertySetupData["tenants"][number];
  unit?: PropertySetupData["units"][number];
}) {
  const [activationState, activationAction, activationPending] = useActionState(
    activateSetupLeaseAction,
    initialActivateSetupLeaseState,
  );
  const blockers = readiness?.items.filter((item) => !item.ready) ?? [];
  const needsActivation =
    ["draft", "active"].includes(lease.status) &&
    blockers.some((item) => item.code === "lease" || item.code === "occupancy");
  const visibleBlockers = needsActivation
    ? blockers.filter(
        (item) =>
          !["lease", "occupancy", "billing", "rent_policy"].includes(item.code),
      )
    : blockers;
  const actionCount = visibleBlockers.length + (needsActivation ? 1 : 0);
  const ready = readiness?.ready === true;
  const canOpenRent = readiness === null || ready;

  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {canOpenRent
            ? "Rent setup is ready"
            : `${actionCount} required next ${actionCount === 1 ? "step" : "steps"}`}
        </h3>
        <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted-foreground">
          <span>{property.label}</span>
          <span aria-hidden="true">·</span>
          <span>{unit?.label ?? "Whole property"}</span>
          <span aria-hidden="true">·</span>
          <span>{owner.label}</span>
          <span aria-hidden="true">·</span>
          <span>{tenant.label}</span>
          <span aria-hidden="true">·</span>
          <span>{formatMoney(lease.monthlyRentAmount, "USD")}/month</span>
        </p>
      </div>
      {needsActivation ? (
        <form
          action={activationAction}
          className="rounded-md border border-border p-4"
        >
          <input name="leaseId" type="hidden" value={lease.id} />
          <h4 className="text-sm font-semibold text-foreground">
            {lease.status === "draft"
              ? "Start the lease"
              : "Finish move-in setup"}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            {lease.status === "draft"
              ? "Activate the lease and confirm that the tenant has moved in today."
              : "The lease is active. Refresh its completed move-in status and continue."}
          </p>
          {activationState.status === "error" ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {activationState.message}
            </p>
          ) : null}
          <Button className="mt-3" disabled={activationPending} type="submit">
            {activationPending
              ? "Updating…"
              : lease.status === "draft"
                ? "Activate lease and confirm move-in"
                : "Refresh move-in status"}
          </Button>
        </form>
      ) : null}
      {visibleBlockers.length > 0 ? (
        <section
          aria-label="Required next steps"
          className="border-y border-border"
        >
          <ul className="divide-y divide-border">
            {visibleBlockers.map((item) => (
              <li
                className="flex items-center justify-between gap-3 py-3"
                key={item.code}
              >
                <span className="text-sm font-medium text-foreground">
                  {item.label}
                </span>
                <Link
                  className="shrink-0 text-sm font-medium text-foreground underline underline-offset-4"
                  href={item.repairHref}
                >
                  Complete {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function DoneStep({
  lease,
  owner,
  property,
  tenant,
  unit,
}: {
  lease: PropertySetupData["leases"][number];
  owner: PropertySetupData["owners"][number];
  property: PropertySetupData["properties"][number];
  tenant: PropertySetupData["tenants"][number];
  unit?: PropertySetupData["units"][number];
}) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Ready to charge rent
        </h3>
        <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted-foreground">
          <span>{property.label}</span>
          <span aria-hidden="true">·</span>
          <span>{unit?.label ?? "Whole property"}</span>
          <span aria-hidden="true">·</span>
          <span>{owner.label}</span>
          <span aria-hidden="true">·</span>
          <span>{tenant.label}</span>
          <span aria-hidden="true">·</span>
          <span>{formatMoney(lease.monthlyRentAmount, "USD")}/month</span>
        </p>
      </div>
      <Link
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-foreground px-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={`/rent-income?leaseId=${lease.id}`}
      >
        <KeyRound size={15} />
        Review first rent charge
      </Link>
    </section>
  );
}

function OrCreateButton({
  disabled = false,
  label,
  onClick,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button disabled={disabled} onClick={onClick} variant="secondary">
      <Plus size={14} />
      {label}
    </Button>
  );
}

function CreateRecordModal({
  data,
  modal,
  onClose,
  onLeaseCreated,
  onOwnerCreated,
  onPropertyCreated,
  onTenantCreated,
  onUnitCreated,
  selection,
}: {
  data: PropertySetupData;
  modal: CreateModal;
  onClose: () => void;
  onLeaseCreated: (id?: string) => void;
  onOwnerCreated: (id?: string) => void;
  onPropertyCreated: (id?: string) => void;
  onTenantCreated: (id?: string) => void;
  onUnitCreated: (id?: string) => void;
  selection: PropertySetupSelection;
}) {
  if (!modal) return null;
  const contextProperty = data.properties.find(
    (option) => option.id === selection.propertyId,
  );
  const contextUnit = data.units.find(
    (option) => option.id === selection.unitId,
  );
  const title = `Create ${modal}`;
  const description =
    modal === "owner"
      ? "The new owner will be selected so you can continue to the property or unit."
      : "Save this record and continue setup.";
  return (
    <Modal description={description} onClose={onClose} open title={title}>
      {modal === "owner" ? (
        <PersonForm
          createSaveLabel="Create and continue"
          initialRoles={["owner"]}
          onClose={onClose}
          onSuccess={(_message, id) => onOwnerCreated(id)}
          roleContext="owner"
        />
      ) : null}
      {modal === "property" ? (
        <PropertyForm
          closeOnCreateSuccess
          collectOwnership
          initialValues={{ ownerPersonId: selection.ownerId }}
          onClose={onClose}
          onSuccess={(_message, id) => onPropertyCreated(id)}
          ownerOptions={data.owners}
        />
      ) : null}
      {modal === "unit" ? (
        <UnitForm
          closeOnCreateSuccess
          initialValues={{ propertyId: selection.propertyId ?? "" }}
          onClose={onClose}
          onSuccess={(_message, id) => onUnitCreated(id)}
          properties={data.properties}
        />
      ) : null}
      {modal === "tenant" ? (
        <PersonForm
          createSaveLabel="Create and continue"
          initialRoles={["tenant"]}
          onClose={onClose}
          onSuccess={(_message, id) => onTenantCreated(id)}
          roleContext="tenant"
        />
      ) : null}
      {modal === "lease" ? (
        <LeaseForm
          createContext={
            contextProperty
              ? {
                  propertyId: contextProperty.id,
                  propertyLabel: contextProperty.label,
                  unitId: contextUnit?.id ?? null,
                  unitLabel: contextUnit?.label ?? null,
                }
              : undefined
          }
          initialValues={{
            propertyId: selection.propertyId ?? "",
            tenantPersonId: selection.tenantId ?? "",
            unitId: selection.unitId ?? "",
          }}
          onClose={onClose}
          onSuccess={(_message, id) => onLeaseCreated(id)}
          properties={data.properties}
          setupMode
          tenants={data.tenants}
          units={data.units}
        />
      ) : null}
    </Modal>
  );
}

function stepTitle(step: PropertySetupStep, requiresUnit = true) {
  return [
    "Choose the responsible owner",
    requiresUnit
      ? "Choose the property and rental space"
      : "Choose the property",
    "Connect the tenant through a lease",
    "Finish rent setup",
    "Rental setup complete",
  ][step - 1];
}

function stepDescription(step: PropertySetupStep, requiresUnit = true) {
  return [
    "Select an active Owner record or create one here.",
    requiresUnit
      ? "Choose the property, then the exact space that will be rented."
      : "This property is rented as one whole space, so no separate unit is required.",
    "Choose or create the tenant, then save the lease, rent, move-in, and deposit details together.",
    "Complete only the operational details still needed before the first rent charge.",
    "The records are connected and rent operations can begin.",
  ][step - 1];
}
