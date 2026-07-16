import { describe, expect, it, vi } from "vitest";
import PropertyDashboardPage from "@/app/(dashboard)/property-dashboard/page";
import FinanceDashboardPage from "@/app/(dashboard)/finance-dashboard/page";
import MaintenanceDashboardPage from "@/app/(dashboard)/maintenance-dashboard/page";
import PaymentsPage from "@/app/(dashboard)/payments/page";
import InvoicesPage from "@/app/(dashboard)/invoices/page";
import SchedulePage from "@/app/(dashboard)/schedule/page";
import TeamPage from "@/app/(dashboard)/team/page";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));

type RedirectPage = (props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => unknown;

describe("legacy route redirects", () => {
  it.each([
    [PropertyDashboardPage, "/overview?lens=records&query=HOME&tag=late&tag=open&view=ignored"],
    [FinanceDashboardPage, "/overview?lens=finance&query=HOME&tag=late&tag=open&view=ignored"],
    [MaintenanceDashboardPage, "/overview?lens=maintenance&query=HOME&tag=late&tag=open&view=ignored"],
    [PaymentsPage, "/rent-income?lens=ignored&query=HOME&tag=late&tag=open&view=ignored"],
    [InvoicesPage, "/bills-expenses?lens=ignored&query=HOME&tag=late&tag=open&view=ignored"],
    [SchedulePage, "/maintenance?view=calendar&lens=ignored&query=HOME&tag=late&tag=open"],
    [TeamPage, "/staff?lens=ignored&query=HOME&tag=late&tag=open&view=ignored"],
  ])("preserves query values at %s", async (page, destination) => {
    redirect.mockReset();
    await (page as RedirectPage)({
      searchParams: Promise.resolve({
        lens: "ignored",
        query: "HOME",
        tag: ["late", "open"],
        view: "ignored",
      }),
    });

    expect(redirect).toHaveBeenCalledWith(destination);
  });
});
