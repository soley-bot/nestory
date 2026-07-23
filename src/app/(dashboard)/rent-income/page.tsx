import { RentIncomeScreen } from "@/features/rent-income/components/rent-income-screen";
import { getRentIncomeScreenData } from "@/features/rent-income/data/rent-income";
import { parseRentIncomeSearchParams } from "@/features/rent-income/rent-income.filters";
import type { RentIncomeCreateRequest } from "@/features/rent-income/rent-income-create";
import {
  incomeTypeOptions,
  type RentIncomeType,
} from "@/features/rent-income/rent-income.types";
import { requireAdminContext } from "@/lib/auth/context";
import {
  getFirstSearchParam,
  getUuidSearchParam,
} from "@/lib/validation/search-params";

type RentIncomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RentIncomePage({
  searchParams,
}: RentIncomePageProps) {
  const context = await requireAdminContext();
  const params = (await searchParams) ?? {};
  const viewQuery = parseRentIncomeSearchParams(params);
  const incomeTypeCandidate = getFirstSearchParam(params.incomeType);
  const incomeType = incomeTypeOptions.some(
    (option) => option.value === incomeTypeCandidate,
  )
    ? (incomeTypeCandidate as RentIncomeType)
    : "rent";
  const createRequest: RentIncomeCreateRequest | undefined =
    getFirstSearchParam(params.action) === "create"
      ? {
          incomeType,
          leaseId: getUuidSearchParam(params.leaseId) ?? null,
          payerPersonId: getUuidSearchParam(params.payerPersonId) ?? null,
          propertyId: getUuidSearchParam(params.propertyId) ?? null,
          unitId: getUuidSearchParam(params.unitId) ?? null,
        }
      : undefined;
  const data = await getRentIncomeScreenData(
    context.organizationId,
    viewQuery,
    createRequest,
  );

  return <RentIncomeScreen {...data} />;
}
