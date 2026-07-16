import { redirect } from "next/navigation";
import {
  buildLegacyRedirect,
  type LegacyRedirectSearchParams,
} from "@/lib/navigation/legacy-redirect";

export default async function FinanceDashboardPage({
  searchParams,
}: {
  searchParams: LegacyRedirectSearchParams;
}) {
  redirect(await buildLegacyRedirect("/overview?lens=finance", searchParams));
}
