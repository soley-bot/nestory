import { redirect } from "next/navigation";
import {
  buildLegacyRedirect,
  type LegacyRedirectSearchParams,
} from "@/lib/navigation/legacy-redirect";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: LegacyRedirectSearchParams;
}) {
  redirect(await buildLegacyRedirect("/maintenance?view=calendar", searchParams));
}
