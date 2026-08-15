import Link from "next/link";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { Button } from "@/components/ui/button";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";
import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import {
  FinanceManagerWorkspace,
  FinanceMemberWorkspace,
} from "@/features/workspace-operations/components/finance-workspace-screen";
import { buildFinanceWorkspaceData } from "@/features/workspace-operations/finance-workspace";
import type { FinanceWorkspaceData } from "@/features/workspace-operations/finance-workspace.types";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function FinancePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ view?: string }>;
} = {}) {
  const context = await requireFinanceContext();
  const data = await getFinanceOperationsData(context.organizationId);
  const query = await searchParams;

  if (
    (context.role === "finance_manager" && query.view !== "transactions") ||
    context.role === "finance_member"
  ) {
    const workspaceData = buildFinanceWorkspaceData({
      data,
      role: context.role,
      userId: context.userId,
    });

    return <FinanceRoleWorkspace data={workspaceData} />;
  }

  return (
    <FinanceOperationsScreen
      {...data}
      canConfigureRent={context.capabilities.canConfigureLeases}
      canCorrectFinance={context.capabilities.canCorrectFinance}
      canRecordOwnerCash={context.capabilities.canOperateFinance}
      canRecordPayments={context.capabilities.canOperateFinance}
      canReadFinanceReports={context.capabilities.canReadFinanceReports}
      canRecoverRent={context.capabilities.canConfigureLeases}
      canReviewExpense={context.capabilities.canReviewExpense}
      canReverseExpense={context.capabilities.canReverseExpense}
      canRetryCurrentRent={context.capabilities.canRetryCurrentRent}
      canSubmitExpense={context.capabilities.canSubmitExpense}
      organizationName={context.organizationName}
      view="work"
    />
  );
}

function FinanceRoleWorkspace({ data }: { data: FinanceWorkspaceData }) {
  const primaryAction =
    data.role === "finance_member"
      ? { href: data.primaryAction.href, label: data.primaryAction.label }
      : data.queue[0]
        ? { href: data.queue[0].href, label: data.queue[0].actionLabel }
        : null;

  return (
    <WorkspacePage
      actions={
        primaryAction || data.role === "finance_manager" ? (
          <div className="flex flex-wrap gap-2">
            {data.role === "finance_manager" ? (
              <Button asChild variant="outline">
                <Link href="/finance?view=transactions" prefetch={false}>
                  Transaction work
                </Link>
              </Button>
            ) : null}
            {primaryAction ? (
              <Button asChild variant="default">
                <Link href={primaryAction.href} prefetch={false}>
                  {primaryAction.label}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
      context={
        "Work queue"
      }
      contextHref="/finance"
      headerClassName="py-3 lg:py-3"
      localNav={
        <FinanceWorkspaceNavigation
          activeRoute="/finance"
          canReadFinanceReports={data.role === "finance_manager"}
        />
      }
      title="Finance"
    >
      <div className="workspace-gutter-x py-4">
        {data.role === "finance_manager" ? (
          <FinanceManagerWorkspace data={data} />
        ) : (
          <FinanceMemberWorkspace data={data} />
        )}
      </div>
    </WorkspacePage>
  );
}
