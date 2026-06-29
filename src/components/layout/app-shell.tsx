"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Building2,
  ChevronDown,
  FileText,
  FolderOpen,
  Home,
  Landmark,
  ListTree,
  LogOut,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Sun,
  Upload,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/features/auth/actions";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  activeHrefs?: string[];
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: "home",
    label: "Home",
    icon: BarChart3,
    items: [{ href: "/overview", label: "Dashboard", icon: BarChart3 }],
  },
  {
    id: "record-room",
    label: "Record room",
    icon: Building2,
    items: [
      { href: "/properties", label: "Properties", icon: Building2 },
      { href: "/units", label: "Units", icon: Home },
      { href: "/maintenance", label: "Maintenance", icon: Wrench },
      { href: "/timeline", label: "Timeline", icon: ListTree },
    ],
  },
  {
    id: "people-money",
    label: "People & money",
    icon: Users,
    items: [
      { href: "/leases", label: "Leases", icon: ScrollText },
      {
        href: "/people",
        label: "People",
        icon: Users,
        activeHrefs: ["/tenants"],
      },
      { href: "/ledger", label: "Ledger", icon: Landmark },
      { href: "/payments", label: "Payments", icon: Wallet },
    ],
  },
];

const moreNavItems: NavItem[] = [
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/import", label: "Import data", icon: Upload },
];

const desktopNavGroups: NavGroup[] = [
  ...navGroups,
  {
    id: "tools",
    label: "Tools",
    icon: MoreHorizontal,
    items: moreNavItems,
  },
];

const settingsItem: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: Settings,
};

const mobilePrimaryItems = [
  { href: "/overview", label: "Dashboard", icon: BarChart3 },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/units", label: "Units", icon: Home },
  { href: "/timeline", label: "Timeline", icon: ListTree },
  { href: "/ledger", label: "Ledger", icon: Landmark },
] satisfies NavItem[];

const mobileMoreItems = [
  { href: "/leases", label: "Leases", icon: ScrollText },
  { href: "/people", label: "People", icon: Users, activeHrefs: ["/tenants"] },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/payments", label: "Payments", icon: Wallet },
  ...moreNavItems,
] satisfies NavItem[];

type AppShellProps = {
  children: React.ReactNode;
  organizationName?: string;
  userEmail?: string;
};

function isNavItemActive(pathname: string, item: NavItem) {
  return (
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`) ||
    item.activeHrefs?.some(
      (href) => pathname === href || pathname.startsWith(`${href}/`),
    ) === true
  );
}

function getPathGroup(pathname: string) {
  return desktopNavGroups.find((group) =>
    group.items.some((item) => isNavItemActive(pathname, item)),
  );
}

function DesktopRailGroupButton({
  group,
  isActive,
  onSelect,
}: {
  group: NavGroup;
  isActive: boolean;
  onSelect: () => void;
}) {
  const Icon = group.icon;

  return (
    <button
      aria-label={group.label}
      aria-pressed={isActive}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted transition-colors hover:bg-surface hover:text-foreground",
        isActive && "border-border bg-surface text-foreground shadow-sm",
      )}
      onClick={onSelect}
      title={group.label}
      type="button"
    >
      <Icon size={15} />
    </button>
  );
}

export function AppShell({
  children,
  organizationName = "Admin workspace",
  userEmail,
}: AppShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathGroup = getPathGroup(pathname);
  const [selectedDesktopGroupId, setSelectedDesktopGroupId] = useState(
    pathGroup?.id ?? "home",
  );
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const selectedDesktopGroup =
    desktopNavGroups.find((group) => group.id === selectedDesktopGroupId) ??
    desktopNavGroups[0];
  const isSettingsActive = isNavItemActive(pathname, settingsItem);
  const isMobileMoreActive = mobileMoreItems.some((item) =>
    isNavItemActive(pathname, item),
  );
  const sidebarToggleLabel = sidebarCollapsed
    ? "Expand sidebar"
    : "Collapse sidebar";

  function toggleTheme() {
    const currentTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("nestory-theme", nextTheme);
  }

  return (
    <div className="min-h-screen bg-background text-[13px]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden border-r border-border bg-surface transition-[width] duration-200 print:hidden lg:flex",
          sidebarCollapsed ? "w-12" : "w-52",
        )}
      >
        {sidebarCollapsed ? (
          <div className="flex w-12 shrink-0 flex-col items-center bg-surface-muted/60">
            <Link
              aria-label="Nestory dashboard"
              className="flex h-12 w-full items-center justify-center border-b border-border text-[13px] font-semibold text-foreground"
              href="/overview"
              onClick={() => {
                setSelectedDesktopGroupId("home");
                setSidebarCollapsed(false);
              }}
              prefetch={false}
              title="Nestory"
            >
              N
            </Link>
            <nav
              aria-label="Quick module rail"
              className="flex flex-1 flex-col items-center gap-1 px-1 py-2"
            >
              {desktopNavGroups.map((group) => (
                <DesktopRailGroupButton
                  group={group}
                  isActive={selectedDesktopGroup.id === group.id}
                  key={group.id}
                  onSelect={() => {
                    setSelectedDesktopGroupId(group.id);
                    setSidebarCollapsed(false);
                  }}
                />
              ))}
            </nav>
            <div className="flex flex-col items-center gap-1 border-t border-border px-1 py-2">
              <ThemeToggle onToggle={toggleTheme} />
              <Link
                aria-label="Settings"
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground",
                  isSettingsActive && "bg-surface text-foreground",
                )}
                href={settingsItem.href}
                prefetch={false}
                title="Settings"
              >
                <Settings size={15} />
              </Link>
              <button
                aria-label={sidebarToggleLabel}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-surface text-foreground transition-colors hover:bg-surface hover:text-foreground"
                onClick={() => setSidebarCollapsed(false)}
                title={sidebarToggleLabel}
                type="button"
              >
                <PanelLeftOpen size={15} />
              </button>
              <form action={signOutAction}>
                <button
                  aria-label={userEmail ? `Sign out ${userEmail}` : "Sign out"}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground"
                  title={userEmail ? `Sign out ${userEmail}` : "Sign out"}
                  type="submit"
                >
                  <LogOut size={15} />
                </button>
              </form>
            </div>
          </div>
        ) : (
          <>
            <div className="flex w-12 shrink-0 flex-col items-center border-r border-border bg-surface-muted/60">
              <Link
                aria-label="Nestory dashboard"
                className="flex h-12 w-full items-center justify-center border-b border-border text-[13px] font-semibold text-foreground"
                href="/overview"
                onClick={() => setSelectedDesktopGroupId("home")}
                prefetch={false}
                title="Nestory"
              >
                N
              </Link>
              <nav
                aria-label="Quick module rail"
                className="flex flex-1 flex-col items-center gap-1 px-1 py-2"
              >
                {desktopNavGroups.map((group) => (
                  <DesktopRailGroupButton
                    group={group}
                    isActive={selectedDesktopGroup.id === group.id}
                    key={group.id}
                    onSelect={() => setSelectedDesktopGroupId(group.id)}
                  />
                ))}
              </nav>
              <div className="flex flex-col items-center gap-1 border-t border-border px-1 py-2">
                <ThemeToggle onToggle={toggleTheme} />
                <Link
                  aria-label="Settings"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground",
                    isSettingsActive && "bg-surface text-foreground",
                  )}
                  href={settingsItem.href}
                  prefetch={false}
                  title="Settings"
                >
                  <Settings size={15} />
                </Link>
                <button
                  aria-label={sidebarToggleLabel}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground"
                  onClick={() => setSidebarCollapsed(true)}
                  title={sidebarToggleLabel}
                  type="button"
                >
                  <PanelLeftClose size={15} />
                </button>
                <form action={signOutAction}>
                  <button
                    aria-label={
                      userEmail ? `Sign out ${userEmail}` : "Sign out"
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground"
                    title={userEmail ? `Sign out ${userEmail}` : "Sign out"}
                    type="submit"
                  >
                    <LogOut size={15} />
                  </button>
                </form>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col bg-surface">
              <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
                <Link
                  className="min-w-0 leading-none text-foreground"
                  href="/overview"
                  onClick={() => setSelectedDesktopGroupId("home")}
                  prefetch={false}
                >
                  <span className="block truncate text-[13px] font-semibold">
                    Nestory
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                    {selectedDesktopGroup.label}
                  </span>
                </Link>
              </div>

              <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
                <div aria-label={selectedDesktopGroup.label}>
                  <p className="px-2 pb-1.5 text-[10px] font-medium text-muted">
                    {selectedDesktopGroup.label}
                  </p>
                  <div className="space-y-1">
                    {selectedDesktopGroup.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = isNavItemActive(pathname, item);

                      return (
                        <Link
                          className={cn(
                            "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted transition-colors",
                            isActive
                              ? "bg-surface-muted text-foreground"
                              : "hover:bg-surface-muted hover:text-foreground",
                          )}
                          href={item.href}
                          key={item.href}
                          prefetch={false}
                        >
                          <Icon className="shrink-0" size={14} />
                          <span className="min-w-0 flex-1 truncate">
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </nav>
            </div>
          </>
        )}
      </aside>

      <main
        className={cn(
          "min-h-screen transition-[margin-left] duration-200 print:ml-0",
          sidebarCollapsed ? "lg:ml-12" : "lg:ml-52",
        )}
      >
        <div className="border-b border-border bg-surface print:hidden lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-none tracking-normal">
                  NESTORY
                </p>
                <p className="truncate text-xs text-muted">
                  {userEmail ?? organizationName}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <ThemeToggle onToggle={toggleTheme} />
              <Link
                aria-label="Settings"
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
                  isSettingsActive ? "bg-surface-muted text-foreground" : null,
                )}
                href={settingsItem.href}
                prefetch={false}
              >
                <Settings size={16} />
              </Link>
              <form action={signOutAction}>
                <button
                  aria-label="Sign out"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                  type="submit"
                >
                  <LogOut size={16} />
                </button>
              </form>
            </div>
          </div>
          <div className="relative flex items-center gap-2 px-4 pb-3">
            <nav
              aria-label="Primary mobile navigation"
              className="flex min-w-0 flex-1 gap-2 overflow-x-auto"
            >
              {mobilePrimaryItems.map((item) => {
                const Icon = item.icon;
                const isActive = isNavItemActive(pathname, item);

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
                    onNavigate={() => setMobileMoreOpen(false)}
                    prefetch={false}
                  >
                    <Icon size={15} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="relative shrink-0">
              <button
                aria-expanded={mobileMoreOpen}
                aria-haspopup="menu"
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted transition-colors",
                  isMobileMoreActive || mobileMoreOpen
                    ? "bg-accent-soft text-foreground"
                    : "hover:bg-surface-muted hover:text-foreground",
                )}
                onClick={() => setMobileMoreOpen((open) => !open)}
                type="button"
              >
                <MoreHorizontal size={15} />
                More
                <ChevronDown
                  className={cn(
                    "transition-transform",
                    mobileMoreOpen && "rotate-180",
                  )}
                  size={13}
                />
              </button>
              {mobileMoreOpen ? (
                <div
                  className="absolute right-0 top-11 z-30 w-56 rounded-md border border-border bg-surface p-2 shadow-lg"
                  role="menu"
                >
                  {mobileMoreItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = isNavItemActive(pathname, item);

                    return (
                      <Link
                        className={cn(
                          "flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-muted transition-colors",
                          isActive
                            ? "bg-accent-soft text-foreground"
                            : "hover:bg-surface-muted hover:text-foreground",
                        )}
                        href={item.href}
                        key={item.href}
                        onNavigate={() => setMobileMoreOpen(false)}
                        prefetch={false}
                        role="menuitem"
                      >
                        <Icon className="shrink-0" size={15} />
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

function ThemeToggle({ onToggle }: { onToggle: () => void }) {
  return (
    <button
      aria-label="Toggle color theme"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      onClick={onToggle}
      title="Toggle color theme"
      type="button"
    >
      <Moon className="theme-toggle-moon" size={16} />
      <Sun className="theme-toggle-sun" size={16} />
    </button>
  );
}
