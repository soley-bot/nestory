"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FileText,
  FolderOpen,
  Home,
  Landmark,
  LayoutDashboard,
  ListTree,
  LogOut,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/features/auth/actions";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/timeline", label: "Timeline", icon: ListTree },
      { href: "/properties", label: "Properties", icon: Building2 },
      { href: "/units", label: "Units", icon: Home },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/ledger", label: "Ledger", icon: Landmark },
      { href: "/documents", label: "Documents", icon: FolderOpen },
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

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
  const navItems = navGroups.flatMap((group) => group.items);

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-white">
            <LayoutDashboard size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Nestory</p>
            <p className="max-w-40 truncate text-xs text-muted">{organizationName}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      className={cn(
                        "flex h-9 items-center gap-3 rounded-md px-2 text-sm font-medium text-muted transition-colors",
                        isActive
                          ? "bg-accent-soft text-accent"
                          : "hover:bg-surface-muted hover:text-foreground",
                      )}
                      href={item.href}
                      key={item.href}
                      prefetch={false}
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          {userEmail ? (
            <p className="mb-2 truncate px-2 text-xs text-muted">{userEmail}</p>
          ) : null}
          <form action={signOutAction}>
            <button
              className="flex h-9 w-full items-center gap-3 rounded-md px-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              type="submit"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-h-screen lg:ml-64">
        <div className="border-b border-border bg-surface lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-white">
                <LayoutDashboard size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight">Nestory</p>
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
                      ? "bg-accent-soft text-accent"
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
