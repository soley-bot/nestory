import Link from "next/link";
import { reportReturnHref } from "../report-return";

export function ReportReturnNavigation({ returnTo }: { returnTo?: string }) {
  const href = reportReturnHref(returnTo);
  return href ? <nav aria-label="Report correction" className="workspace-gutter-x border-b border-border py-3 text-sm">
    <Link href={href} className="font-medium underline underline-offset-4">Return to report and recheck</Link>
  </nav> : null;
}
