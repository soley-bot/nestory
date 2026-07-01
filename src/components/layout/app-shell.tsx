"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  Coins,
  CreditCard,
  Database,
  ChevronDown,
  DoorOpen,
  FileChartColumn,
  History,
  IdCard,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  ReceiptText,
  Repeat,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Truck,
  Upload,
  UserRound,
  UsersRound,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/features/auth/actions";
import type { WorkspaceRole } from "@/lib/auth/context";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  activeHrefs?: string[];
  section?: string;
};

type NavGroup = {
  id: string;
  label: string;
  roomLabel: string;
  icon: LucideIcon;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    roomLabel: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { href: "/overview", label: "Overview", icon: LayoutDashboard },
      {
        href: "/property-dashboard",
        label: "Property",
        icon: Building2,
      },
      {
        href: "/maintenance-dashboard",
        label: "Maintenance",
        icon: Wrench,
      },
      {
        href: "/timeline-dashboard",
        label: "Timeline",
        icon: History,
      },
      { href: "/people-dashboard", label: "People", icon: UsersRound },
      { href: "/finance-dashboard", label: "Finance", icon: Wallet },
    ],
  },
  {
    id: "property",
    label: "Property",
    roomLabel: "Property",
    icon: Building2,
    items: [
      { href: "/properties", label: "Properties", icon: Building2 },
      { href: "/units", label: "Units", icon: DoorOpen },
      { href: "/amenities", label: "Amenities", icon: Sparkles },
      { href: "/property-inspections", label: "Inspections", icon: ClipboardCheck },
    ],
  },
  {
    id: "people",
    label: "People",
    roomLabel: "People",
    icon: UsersRound,
    items: [
      {
        href: "/tenants",
        label: "Tenants",
        icon: UserRound,
        activeHrefs: ["/people"],
      },
      { href: "/vendors", label: "Vendors", icon: Truck },
      { href: "/owners", label: "Owners", icon: KeyRound },
      {
        href: "/team",
        label: "Staff",
        icon: IdCard,
      },
    ],
  },
  {
    id: "operations",
    label: "Maintenance",
    roomLabel: "Maintenance",
    icon: Wrench,
    items: [
      { href: "/maintenance", label: "Requests", icon: Wrench },
      { href: "/work-orders", label: "Work Orders", icon: ClipboardList },
      { href: "/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/inspections", label: "Inspections", icon: ClipboardCheck },
      { href: "/recurring-tasks", label: "Recurring Tasks", icon: Repeat },
      { href: "/inventory", label: "Inventory", icon: Database },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    roomLabel: "Finance",
    icon: Wallet,
    items: [
      { href: "/leases", label: "Leases", icon: ScrollText },
      { href: "/ledger", label: "Ledger", icon: BookOpen },
      { href: "/payments", label: "Payments", icon: CreditCard },
      { href: "/invoices", label: "Invoices", icon: ReceiptText },
      { href: "/petty-cash", label: "Petty Cash", icon: Coins },
      { href: "/reports", label: "Reports", icon: FileChartColumn },
    ],
  },
  {
    id: "timeline",
    label: "Timeline",
    roomLabel: "Timeline",
    icon: History,
    items: [
      { href: "/timeline", label: "Global Timeline", icon: History },
      {
        href: "/property-timeline",
        label: "Property Timeline",
        icon: Building2,
      },
      {
        href: "/maintenance-timeline",
        label: "Maintenance Timeline",
        icon: Wrench,
      },
      {
        href: "/financial-timeline",
        label: "Financial Timeline",
        icon: Wallet,
      },
    ],
  },
];

const settingsGroup: NavGroup = {
  id: "settings",
  label: "Settings",
  roomLabel: "Settings",
  icon: Settings,
  items: [
    { href: "/settings", label: "Organization", icon: Building2, section: "Organization" },
    { href: "/branding", label: "Branding", icon: Sparkles, section: "Organization" },
    { href: "/users-roles", label: "Users & Roles", icon: UsersRound, section: "Access" },
    { href: "/property-settings", label: "Property", icon: Building2, section: "Modules" },
    { href: "/lease-settings", label: "Lease", icon: ScrollText, section: "Modules" },
    { href: "/maintenance-settings", label: "Maintenance", icon: Wrench, section: "Modules" },
    { href: "/financial-settings", label: "Financial", icon: Wallet, section: "Modules" },
    { href: "/notifications", label: "Notifications", icon: Bell, section: "Communication" },
    { href: "/security", label: "Security", icon: Shield, section: "System" },
    { href: "/backup-data", label: "Backup", icon: Database, section: "System" },
    { href: "/integrations", label: "Integrations", icon: Plug, section: "System" },
  ],
};

const mobilePrimaryItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/units", label: "Units", icon: DoorOpen },
  { href: "/maintenance", label: "Requests", icon: Wrench },
  { href: "/ledger", label: "Ledger", icon: BookOpen },
] satisfies NavItem[];

type AppShellProps = {
  children: React.ReactNode;
  organizationName?: string;
  role?: WorkspaceRole;
  userEmail?: string;
};

function getDesktopNavGroups(role: WorkspaceRole) {
  if (role === "admin") {
    return [...navGroups, settingsGroup];
  }

  if (role === "manager") {
    return [
      {
        ...navGroups.find((group) => group.id === "operations")!,
        items: [
          { href: "/maintenance", label: "Requests", icon: Wrench },
          { href: "/tasks", label: "Tasks", icon: CheckSquare },
        ],
      },
      {
        ...settingsGroup,
        items: [
          {
            href: "/settings",
            label: "Organization",
            icon: Building2,
            section: "Organization",
          },
        ],
      },
    ];
  }

  return [
    {
      ...navGroups.find((group) => group.id === "operations")!,
      items: [{ href: "/tasks", label: "Tasks", icon: CheckSquare }],
    },
  ];
}

function isNavItemActive(pathname: string, item: NavItem) {
  return (
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`) ||
    item.activeHrefs?.some(
      (href) => pathname === href || pathname.startsWith(`${href}/`),
    ) === true
  );
}

function getPathGroup(pathname: string, groups: NavGroup[]) {
  return groups.find((group) =>
    group.items.some((item) => isNavItemActive(pathname, item)),
  );
}

function DesktopRailGroupLink({
  group,
  isActive,
  onNavigate,
}: {
  group: NavGroup;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const Icon = group.icon;
  const href = group.items[0]?.href ?? "/overview";

  return (
    <Link
      aria-label={group.label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted transition-colors hover:bg-surface hover:text-foreground",
        isActive && groupRailActiveClass(group.id),
      )}
      href={href}
      onNavigate={onNavigate}
      prefetch={false}
      title={group.label}
    >
      <Icon size={15} />
    </Link>
  );
}

function groupRailActiveClass(groupId: string) {
  if (groupId === "property" || groupId === "finance") {
    return "border-success/30 bg-success-soft text-success shadow-sm";
  }

  if (groupId === "operations" || groupId === "settings") {
    return "border-warning/30 bg-warning-soft text-warning shadow-sm";
  }

  if (groupId === "people") {
    return "border-accent/30 bg-accent-soft text-accent shadow-sm";
  }

  return "border-border bg-surface text-foreground shadow-sm";
}

export function AppShell({
  children,
  organizationName = "Admin workspace",
  role = "admin",
  userEmail,
}: AppShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const desktopNavGroups = getDesktopNavGroups(role);
  const mobilePrimaryNavItems =
    role === "member"
      ? [{ href: "/tasks", label: "Tasks", icon: CheckSquare }]
      : mobilePrimaryItems;
  const mobileMoreItems = [
    ...desktopNavGroups.flatMap((group) => group.items),
    ...(role === "admin"
      ? [{ href: "/import", label: "Import data", icon: Upload }]
      : []),
  ] satisfies NavItem[];
  const pathGroup = getPathGroup(pathname, desktopNavGroups);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const selectedDesktopGroup = pathGroup ?? desktopNavGroups[0];
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
          sidebarCollapsed ? "w-14" : "w-[244px]",
        )}
      >
        {sidebarCollapsed ? (
          <div className="flex w-14 shrink-0 flex-col items-center bg-background">
            <Link
              aria-label="Nestory dashboard"
              className="flex h-14 w-full items-center justify-center border-b border-border text-[13px] font-semibold text-foreground"
              href="/overview"
              onNavigate={() => setSidebarCollapsed(false)}
              prefetch={false}
              title="Nestory"
            >
              N
            </Link>
            <nav
              aria-label="Quick module rail"
              className="flex flex-1 flex-col items-center gap-1 px-2 py-3"
            >
              {desktopNavGroups
                .filter((group) => group.id !== "settings")
                .map((group) => (
                  <DesktopRailGroupLink
                    group={group}
                    isActive={selectedDesktopGroup.id === group.id}
                    key={group.id}
                    onNavigate={() => setSidebarCollapsed(false)}
                  />
                ))}
            </nav>
            <div className="flex flex-col items-center gap-1 border-t border-border px-1 py-2">
              <ThemeToggle onToggle={toggleTheme} />
              <ProfileMenu
                email={userEmail}
                menuClassName="bottom-0 left-10 right-auto top-auto"
                onOpenChange={setProfileMenuOpen}
                open={profileMenuOpen}
                organizationName={organizationName}
                role={role}
              />
              {desktopNavGroups.some((group) => group.id === "settings") ? (
                <DesktopRailGroupLink
                  group={settingsGroup}
                  isActive={selectedDesktopGroup.id === settingsGroup.id}
                  onNavigate={() => setSidebarCollapsed(false)}
                />
              ) : null}
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
            <div className="flex w-14 shrink-0 flex-col items-center border-r border-border bg-background">
              <Link
                aria-label="Nestory dashboard"
                className="flex h-14 w-full items-center justify-center border-b border-border text-[13px] font-semibold text-foreground"
                href="/overview"
                prefetch={false}
                title="Nestory"
              >
                N
              </Link>
              <nav
                aria-label="Quick module rail"
                className="flex flex-1 flex-col items-center gap-1 px-2 py-3"
              >
                {desktopNavGroups
                  .filter((group) => group.id !== "settings")
                  .map((group) => (
                    <DesktopRailGroupLink
                      group={group}
                      isActive={selectedDesktopGroup.id === group.id}
                      key={group.id}
                    />
                  ))}
              </nav>
              <div className="flex flex-col items-center gap-1 border-t border-border px-1 py-2">
                <ThemeToggle onToggle={toggleTheme} />
                {desktopNavGroups.some((group) => group.id === "settings") ? (
                  <DesktopRailGroupLink
                    group={settingsGroup}
                    isActive={selectedDesktopGroup.id === settingsGroup.id}
                  />
                ) : null}
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
              <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
                <Link
                  className="min-w-0 leading-none text-foreground"
                  href="/overview"
                  prefetch={false}
                >
                  <span className="block truncate text-[13px] font-semibold">
                    Nestory
                  </span>
                  <span className="mt-1 block truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                    {selectedDesktopGroup.roomLabel}
                  </span>
                </Link>
                <ProfileMenu
                  email={userEmail}
                  menuClassName="left-full right-auto top-0 ml-2"
                  onOpenChange={setProfileMenuOpen}
                  open={profileMenuOpen}
                  organizationName={organizationName}
                  role={role}
                />
              </div>

              <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
                <div aria-label={selectedDesktopGroup.label}>
                  <p className="px-2 pb-2 text-[12px] font-medium text-muted">
                    {selectedDesktopGroup.roomLabel}
                  </p>
                  <div className="space-y-1">
                    {selectedDesktopGroup.items.map((item, index) => {
                      const Icon = item.icon;
                      const isActive = isNavItemActive(pathname, item);
                      const showSection =
                        item.section &&
                        item.section !== selectedDesktopGroup.items[index - 1]?.section;

                      return (
                        <div key={item.href}>
                          {showSection ? (
                            <p
                              className={cn(
                                "px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-subtle",
                                index === 0 ? "pt-0" : "pt-3",
                              )}
                            >
                              {item.section}
                            </p>
                          ) : null}
                          <Link
                            className={cn(
                              "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-medium text-muted transition-colors",
                              isActive
                                ? "bg-surface-muted text-foreground"
                                : "hover:bg-surface-muted hover:text-foreground",
                            )}
                            href={item.href}
                            prefetch={false}
                          >
                            <Icon className="shrink-0" size={14} />
                            <span className="min-w-0 flex-1 truncate">
                              {item.label}
                            </span>
                          </Link>
                        </div>
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
          sidebarCollapsed ? "lg:ml-14" : "lg:ml-[244px]",
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
              {desktopNavGroups.some((group) => group.id === "settings") ? (
                <Link
                  aria-label="Settings"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
                    selectedDesktopGroup.id === "settings"
                      ? "bg-surface-muted text-foreground"
                      : null,
                  )}
                  href="/settings"
                  prefetch={false}
                >
                  <Settings size={16} />
                </Link>
              ) : null}
              <ProfileMenu
                email={userEmail}
                onOpenChange={setProfileMenuOpen}
                open={profileMenuOpen}
                organizationName={organizationName}
                role={role}
              />
            </div>
          </div>
          <div className="relative flex items-center gap-2 px-4 pb-3">
            <nav
              aria-label="Primary mobile navigation"
              className="flex min-w-0 flex-1 gap-2 overflow-x-auto"
            >
              {mobilePrimaryNavItems.map((item) => {
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

function ProfileMenu({
  email,
  menuClassName,
  onOpenChange,
  open,
  organizationName,
  role,
}: {
  email?: string;
  menuClassName?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationName: string;
  role: WorkspaceRole;
}) {
  const label = email ?? organizationName;

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open profile menu"
        className="flex h-8 min-w-8 items-center justify-center rounded-full border border-border bg-surface-muted px-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-surface"
        onClick={() => onOpenChange(!open)}
        title={label}
        type="button"
      >
        {getInitials(label)}
      </button>
      {open ? (
        <div
          className={cn(
            "absolute right-0 top-10 z-40 w-64 rounded-md border border-border bg-surface p-2 shadow-lg",
            menuClassName,
          )}
          role="menu"
        >
          <div className="border-b border-border px-2 py-2">
            <p className="truncate text-sm font-semibold">{label}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {formatRole(role)} / {organizationName}
            </p>
          </div>
          <Link
            className="mt-1 flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href="/account"
            onNavigate={() => onOpenChange(false)}
            role="menuitem"
          >
            <UserRound size={15} />
            Profile
          </Link>
          <form action={signOutAction}>
            <button
              className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-surface-muted"
              role="menuitem"
              type="submit"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
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

function getInitials(label: string) {
  const [first = "", second = ""] = label
    .replace(/@.*/, "")
    .split(/[.\s_-]+/)
    .filter(Boolean);

  return `${first[0] ?? "U"}${second[0] ?? ""}`.toUpperCase();
}

function formatRole(role: WorkspaceRole) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "manager") {
    return "Manager";
  }

  return "Member";
}
