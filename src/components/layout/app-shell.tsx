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
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-surface">
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-white">
            <LayoutDashboard size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Nestory</p>
            <p className="text-xs text-muted">Admin workspace</p>
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
      </aside>

      <main className="ml-64 min-h-screen flex-1">{children}</main>
    </div>
  );
}
