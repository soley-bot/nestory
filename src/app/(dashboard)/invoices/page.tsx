import { redirect } from "next/navigation";
import {
  buildLegacyRedirect,
  type LegacyRedirectSearchParams,
} from "@/lib/navigation/legacy-redirect";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: LegacyRedirectSearchParams;
}) {
  redirect(await buildLegacyRedirect("/bills-expenses", searchParams));
}
