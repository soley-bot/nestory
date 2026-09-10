
import { WorkspacePage } from "@/components/layout/workspace-page";
import { ReportsDirectory } from "@/features/reports/components/reports-directory";
import { requireFinanceReportContext } from "@/lib/auth/context";

export default async function ReportsPage() {
  const context = await requireFinanceReportContext();

  return (
    <WorkspacePage title="Reports">
      <ReportsDirectory canReadFinance={context.capabilities.canReadFinance} />
    </WorkspacePage>
  );
}
