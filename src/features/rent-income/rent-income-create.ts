import type { PersonSelectOption } from "@/features/people/person-select";
import type {
  RentIncomeCreateDefaults,
  RentIncomeLeaseOption,
  RentIncomeOption,
  RentIncomeType,
  RentIncomeUnitOption,
} from "@/features/rent-income/rent-income.types";

export type RentIncomeCreateRequest = {
  incomeType: RentIncomeType;
  leaseId: string | null;
  payerPersonId: string | null;
  propertyId: string | null;
  unitId: string | null;
};

export function validateRentIncomeCreateDefaults({
  leaseOptions,
  payerOptions,
  propertyOptions,
  request,
  unitOptions,
}: {
  leaseOptions: RentIncomeLeaseOption[];
  payerOptions: PersonSelectOption[];
  propertyOptions: RentIncomeOption[];
  request?: RentIncomeCreateRequest;
  unitOptions: RentIncomeUnitOption[];
}): RentIncomeCreateDefaults | undefined {
  if (!request) return undefined;

  const lease = leaseOptions.find((option) => option.id === request.leaseId);
  if (lease) {
    return {
      amountDue: String(lease.monthlyRentAmount),
      incomeType: request.incomeType,
      leaseId: lease.id,
      payerPersonId: payerOptions.some(
        (option) => option.id === lease.tenantPersonId,
      )
        ? lease.tenantPersonId
        : "",
      propertyId: lease.propertyId,
      unitId: lease.unitId ?? "",
    };
  }

  const propertyId = propertyOptions.some(
    (option) => option.id === request.propertyId,
  )
    ? request.propertyId ?? ""
    : "";
  const unitId = unitOptions.some(
    (option) =>
      option.id === request.unitId && option.propertyId === propertyId,
  )
    ? request.unitId ?? ""
    : "";
  const payerPersonId = payerOptions.some(
    (option) => option.id === request.payerPersonId,
  )
    ? request.payerPersonId ?? ""
    : "";

  return {
    amountDue: "",
    incomeType: request.incomeType,
    leaseId: "",
    payerPersonId,
    propertyId,
    unitId,
  };
}
