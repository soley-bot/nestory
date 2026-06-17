"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  FolderOpen,
  Home,
  Landmark,
  ListTree,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/features/auth/actions";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/overview", label: "Overview", icon: BarChart3 },
      { href: "/timeline", label: "Timeline", icon: ListTree },
      { href: "/properties", label: "Properties", icon: Building2 },
      { href: "/units", label: "Units", icon: Home },
    ],
  },
  {
    label: "Leasing",
    items: [
      { href: "/leases", label: "Leases", icon: ScrollText },
      { href: "/tenants", label: "Tenants", icon: Users },
    ],
  },
  {
    label: "Financial",
    items: [
      { href: "/ledger", label: "Ledger", icon: Landmark },
      { href: "/payments", label: "Payments", icon: CreditCard },
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/maintenance", label: "Tasks & maintenance", icon: Wrench },
      { href: "/documents", label: "Documents", icon: FolderOpen },
    ],
  },
  {
    label: "Tenant experience",
    items: [
      { href: "/tenant-portal", label: "Tenant portal", icon: ClipboardList },
      { href: "/communications", label: "Communications", icon: MessageSquare },
    ],
  },
  {
    label: "Automation",
    items: [{ href: "/workflows", label: "Workflows", icon: Workflow }],
  },
];

const settingsItem = { href: "/settings", label: "Settings", icon: Settings };

type AppShellProps = {
  children: React.ReactNode;
  organizationName?: string;
  userEmail?: string;
};

export function AppShell({
  children,
  organizationName = "Admin workspace",
  userEmail,
}: AppShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navItems = [...navGroups.flatMap((group) => group.items), settingsItem];
  const isSettingsActive =
    pathname === settingsItem.href || pathname.startsWith(`${settingsItem.href}/`);
  const sidebarToggleLabel = sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden flex-col border-r border-border bg-white transition-[width] duration-200 lg:flex",
          sidebarCollapsed ? "w-16" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex border-b border-border",
            sidebarCollapsed
              ? "h-16 items-center justify-center px-2"
              : "h-32 items-start gap-3 px-4 pt-6",
          )}
        >
          {sidebarCollapsed ? null : (
            <>
              <div className="min-w-0 flex-1">
                <Link
                  className="font-display block w-fit leading-none text-foreground"
                  href="/overview"
                  prefetch={false}
                >
                  <span className="block text-2xl font-semibold">NESTORY</span>
                  <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.24em] text-muted">
                    Property Management
                  </span>
                </Link>
                <p className="mt-3 max-w-full truncate text-sm font-semibold text-foreground">
                  {organizationName}
                </p>
              </div>
            </>
          )}
          <button
            aria-label={sidebarToggleLabel}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
              sidebarCollapsed ? "text-foreground" : "shrink-0",
            )}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            title={sidebarToggleLabel}
            type="button"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
        </div>

        <nav
          className={cn(
            "flex-1 overflow-y-auto",
            sidebarCollapsed ? "space-y-4 px-2 py-4" : "space-y-5 px-3 py-4",
          )}
        >
          {navGroups.map((group) => (
            <div aria-label={group.label} key={group.label}>
              {sidebarCollapsed ? null : (
                <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      aria-label={sidebarCollapsed ? item.label : undefined}
                      className={cn(
                        "flex h-8 rounded-md text-sm font-medium text-muted transition-colors",
                        sidebarCollapsed
                          ? "items-center justify-center px-0"
                          : "items-center gap-3 px-2",
                        isActive
                          ? "bg-accent-soft text-foreground"
                          : "hover:bg-surface-muted hover:text-foreground",
                      )}
                      href={item.href}
                      key={item.href}
                      prefetch={false}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <Icon size={16} />
                      {sidebarCollapsed ? null : item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={cn("border-t border-border", sidebarCollapsed ? "p-2" : "p-3")}>
          <Link
            aria-label={sidebarCollapsed ? settingsItem.label : undefined}
            className={cn(
              "mb-2 flex h-9 w-full rounded-md text-sm font-medium text-muted transition-colors",
              sidebarCollapsed
                ? "items-center justify-center px-0"
                : "items-center gap-3 px-2",
              isSettingsActive
                ? "bg-accent-soft text-foreground"
                : "hover:bg-surface-muted hover:text-foreground",
            )}
            href={settingsItem.href}
            prefetch={false}
            title={sidebarCollapsed ? settingsItem.label : undefined}
          >
            <Settings size={16} />
            {sidebarCollapsed ? null : settingsItem.label}
          </Link>
          {userEmail && !sidebarCollapsed ? (
            <p className="mb-2 truncate px-2 text-xs text-muted">{userEmail}</p>
          ) : null}
          <form action={signOutAction}>
            <button
              aria-label={sidebarCollapsed ? "Sign out" : undefined}
              className={cn(
                "flex h-9 w-full rounded-md text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
                sidebarCollapsed
                  ? "items-center justify-center px-0"
                  : "items-center gap-3 px-2",
              )}
              title={sidebarCollapsed ? "Sign out" : undefined}
              type="submit"
            >
              <LogOut size={16} />
              {sidebarCollapsed ? null : "Sign out"}
            </button>
          </form>
        </div>
      </aside>

      <main
        className={cn(
          "min-h-screen transition-[margin-left] duration-200",
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-56",
        )}
      >
        <div className="border-b border-border bg-white lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <p className="font-display text-xl font-semibold leading-none tracking-normal">
                  NESTORY
                </p>
                <p className="truncate text-xs text-muted">
                  {userEmail ?? organizationName}
                </p>
              </div>
            </div>
            <form action={signOutAction} className="shrink-0">
              <button
                aria-label="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                type="submit"
              >
                <LogOut size={16} />
              </button>
            </form>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-4 pb-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted transition-colors",
                    isActive
                      ? "bg-accent-soft text-foreground"
                      : "hover:bg-surface-muted hover:text-foreground",
                  )}
                  href={item.href}
                  key={item.href}
                  prefetch={false}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {children}
      </main>
    </div>
  );
}
