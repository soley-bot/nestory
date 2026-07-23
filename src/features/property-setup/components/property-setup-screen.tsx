"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Home,
  KeyRound,
  Plus,
  UserRound,
  UsersRound,
} from "lucide-react";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { Modal } from "@/components/ui/modal";
import { SelectControl } from "@/components/ui/select-control";
import { PersonForm } from "@/features/people/components/person-form";
import { PersonSelect } from "@/features/people/components/person-select";
import { PropertyForm } from "@/features/properties/components/property-form";
import { UnitForm } from "@/features/units/components/unit-form";
import { LeaseForm } from "@/features/leases/components/lease-form";
import {
  buildPropertySetupQuery,
  clearPropertySetupSelectionAfter,
  findOpenLeaseForUnit,
  getHighestPropertySetupStep,
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
  { icon: Building2, label: "Property", step: 2 },
  { icon: Home, label: "Unit", step: 3 },
  { icon: UsersRound, label: "Tenant and lease", step: 4 },
  { icon: Check, label: "Review", step: 5 },
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
  const highestStep = getHighestPropertySetupStep(selection);
  const owner = data.owners.find((option) => option.id === selection.ownerId);
  const property = data.properties.find(
    (option) => option.id === selection.propertyId,
  );
  const unit = data.units.find((option) => option.id === selection.unitId);
  const tenant = data.tenants.find((option) => option.id === selection.tenantId);
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
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          href="/properties"
        >
          <ArrowLeft size={14} />
          Properties
        </Link>
      }
      context={`Step ${step} of 5`}
      contextHref="/properties/setup"
      title="Set up property"
    >
      <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <SetupRail
            currentStep={step}
            highestStep={highestStep}
            onStepChange={(nextStep) => navigate(selection, nextStep)}
          />

          <main className="min-w-0 rounded-lg border border-border bg-surface shadow-sm">
            <header className="border-b border-border px-4 py-4 sm:px-5">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                {steps[step - 1]?.label}
              </p>
              <h1 className="mt-1 text-lg font-semibold text-foreground">
                {stepTitle(step)}
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-foreground-muted">
                {stepDescription(step)}
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
              ) : null}
              {step === 3 ? (
                <SelectRecordStep
                  createLabel="Create new unit"
                  emptyCopy="This property has no eligible active units yet."
                  label="Unit"
                  onCreate={() => setCreateModal("unit")}
                  onSelect={(id) => changeSelection("unitId", id || null)}
                  options={unitOptions.map((option) => ({
                    label: `${option.label} · ${option.statusLabel}`,
                    value: option.id,
                  }))}
                  placeholder="Choose unit"
                  value={selection.unitId ?? ""}
                />
              ) : null}
              {step === 4 ? (
                <TenantLeaseStep
                  data={data}
                  matchingLeases={matchingLeases}
                  onCreateLease={() => setCreateModal("lease")}
                  onCreateTenant={() => setCreateModal("tenant")}
                  onLeaseSelect={(id) => changeSelection("leaseId", id || null)}
                  onTenantSelect={(id) => changeSelection("tenantId", id || null)}
                  onUseExistingLease={() => {
                    if (!openLeaseForUnit) return;
                    navigate(
                      {
                        ...selection,
                        leaseId: openLeaseForUnit.id,
                        tenantId: openLeaseForUnit.tenantPersonId,
                      },
                      5,
                    );
                  }}
                  openLeaseForUnit={openLeaseForUnit}
                  selection={selection}
                />
              ) : null}
              {step === 5 && owner && property && unit && tenant && lease ? (
                <ReviewStep
                  lease={lease}
                  owner={owner}
                  property={property}
                  tenant={tenant}
                  unit={unit}
                />
              ) : null}
            </div>

            {step < 5 ? (
              <footer className="flex items-center justify-between gap-3 border-t border-border bg-surface-muted/45 px-4 py-3 sm:px-5">
                <Button
                  disabled={step === 1}
                  onClick={() => navigate(selection, (step - 1) as PropertySetupStep)}
                  variant="ghost"
                >
                  <ArrowLeft size={14} />
                  Back
                </Button>
                <Button
                  disabled={pending || highestStep <= step}
                  onClick={() => navigate(selection, (step + 1) as PropertySetupStep)}
                  variant="primary"
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
        onLeaseCreated={(id) => completeCreation("leaseId", id, 5)}
        onOwnerCreated={(id) => completeCreation("ownerId", id, 2)}
        onPropertyCreated={(id) => completeCreation("propertyId", id, 3)}
        onTenantCreated={(id) => completeCreation("tenantId", id, 4)}
        onUnitCreated={(id) => completeCreation("unitId", id, 4)}
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
      className="rounded-lg border border-border bg-surface p-2 shadow-sm lg:self-start"
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
                  "flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring",
                  item.step === currentStep
                    ? "bg-accent-soft text-foreground"
                    : available
                      ? "text-foreground-muted hover:bg-surface-muted"
                      : "cursor-not-allowed text-muted/60",
                )}
                disabled={!available}
                onClick={() => onStepChange(item.step)}
                type="button"
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
                    completed
                      ? "border-success/40 bg-success-soft text-success"
                      : "border-border bg-surface",
                  )}
                >
                  {completed ? <Check size={13} /> : item.step}
                </span>
                <Icon className="hidden shrink-0 sm:block lg:hidden" size={14} />
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
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          {emptyCopy}
        </p>
      ) : null}
      <OrCreateButton label={createLabel} onClick={onCreate} />
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
          <p className="text-sm text-muted">Choose or create the tenant first.</p>
        )}
        {openLeaseForUnit ? (
          <div className="rounded-md border border-warning/30 bg-warning-soft/30 p-3 text-sm">
            <p className="font-medium text-foreground">
              This unit already has an open lease for {openLeaseForUnit.label}.
            </p>
            <Button className="mt-2" onClick={onUseExistingLease} variant="secondary">
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

function ReviewStep({
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
  unit: PropertySetupData["units"][number];
}) {
  const rentParams = new URLSearchParams({
    action: "create",
    incomeType: "rent",
    leaseId: lease.id,
    payerPersonId: tenant.id,
    propertyId: property.id,
    unitId: unit.id,
  });

  return (
    <section className="space-y-4">
      <ConsequencePanel
        rows={[
          { label: "Owner", value: owner.label },
          { label: "Property", value: property.label },
          { label: "Unit", value: unit.label },
          { label: "Tenant", value: tenant.label },
          {
            label: "Lease rent",
            value: formatMoney(lease.monthlyRentAmount, "USD"),
          },
        ]}
        summary="The owner, property, unit, tenant, and lease are persisted and linked. The next action creates the first rent obligation; it does not record cash."
        title="Setup complete"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <SummaryLink href={`/people/${owner.id}`} label="Owner" value={owner.label} />
        <SummaryLink href={`/properties/${property.id}`} label="Property" value={property.label} />
        <SummaryLink href={`/units/${unit.id}`} label="Unit" value={unit.label} />
        <SummaryLink href={`/people/${tenant.id}`} label="Tenant" value={tenant.label} />
        <SummaryLink href={`/leases?leaseId=${lease.id}`} label="Lease" value={lease.label} />
      </div>
      <Link
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-foreground px-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        href={`/rent-income?${rentParams.toString()}`}
      >
        <KeyRound size={15} />
        Create first rent charge
      </Link>
    </section>
  );
}

function SummaryLink({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      className="rounded-md border border-border bg-surface-muted/45 px-3 py-2.5 transition-colors hover:bg-surface-muted"
      href={href}
    >
      <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <span className="mt-1 block truncate text-sm font-semibold text-foreground">
        {value}
      </span>
    </Link>
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
  const title = `Create ${modal}`;
  return (
    <Modal
      description="Save this source record to carry its authoritative ID into setup."
      onClose={onClose}
      open
      title={title}
    >
      {modal === "owner" ? (
        <PersonForm
          initialRoles={["owner"]}
          onClose={onClose}
          onSuccess={(_message, id) => onOwnerCreated(id)}
          roleContext="owner"
        />
      ) : null}
      {modal === "property" ? (
        <PropertyForm
          closeOnCreateSuccess
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
          initialRoles={["tenant"]}
          onClose={onClose}
          onSuccess={(_message, id) => onTenantCreated(id)}
          roleContext="tenant"
        />
      ) : null}
      {modal === "lease" ? (
        <LeaseForm
          initialValues={{
            propertyId: selection.propertyId ?? "",
            tenantPersonId: selection.tenantId ?? "",
            unitId: selection.unitId ?? "",
          }}
          onClose={onClose}
          onSuccess={(_message, id) => onLeaseCreated(id)}
          properties={data.properties}
          tenants={data.tenants}
          units={data.units}
        />
      ) : null}
    </Modal>
  );
}

function stepTitle(step: PropertySetupStep) {
  return [
    "Choose the responsible owner",
    "Choose the property record",
    "Choose the operating unit",
    "Connect the tenant through a lease",
    "Review the linked setup",
  ][step - 1];
}

function stepDescription(step: PropertySetupStep) {
  return [
    "Select an active Owner record or create one here.",
    "Only active properties currently linked to the selected owner are eligible.",
    "Select an existing unit under this property or add the first unit.",
    "A Tenant record alone is not occupancy. Finish by selecting or creating the lease that links this tenant and unit.",
    "Open any source record or continue directly to the first rent charge.",
  ][step - 1];
}
