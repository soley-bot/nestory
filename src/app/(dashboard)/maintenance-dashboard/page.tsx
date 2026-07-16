import { redirect } from "next/navigation";
import {
  buildLegacyRedirect,
  type LegacyRedirectSearchParams,
} from "@/lib/navigation/legacy-redirect";

export default async function MaintenanceDashboardPage({
  searchParams,
}: {
  searchParams: LegacyRedirectSearchParams;
}) {
  redirect(await buildLegacyRedirect("/overview?lens=maintenance", searchParams));
}
