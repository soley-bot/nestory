import { redirect } from "next/navigation";
import {
  buildLegacyRedirect,
  type LegacyRedirectSearchParams,
} from "@/lib/navigation/legacy-redirect";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: LegacyRedirectSearchParams;
}) {
  redirect(await buildLegacyRedirect("/rent-income", searchParams));
}
