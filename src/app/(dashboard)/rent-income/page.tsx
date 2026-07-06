import { RentIncomeScreen } from "@/features/rent-income/components/rent-income-screen";
import { getRentIncomeScreenData } from "@/features/rent-income/data/rent-income";
import { parseRentIncomeSearchParams } from "@/features/rent-income/rent-income.filters";
import { requireAdminContext } from "@/lib/auth/context";

type RentIncomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RentIncomePage({
  searchParams,
}: RentIncomePageProps) {
  const context = await requireAdminContext();
  const params = (await searchParams) ?? {};
  const viewQuery = parseRentIncomeSearchParams(params);
  const data = await getRentIncomeScreenData(context.organizationId, viewQuery);

  return <RentIncomeScreen {...data} />;
}
