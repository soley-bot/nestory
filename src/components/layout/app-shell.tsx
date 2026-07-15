"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Activity,
  BookOpen,
  Building2,
  CheckSquare,
  ClipboardList,
  Coins,
  CreditCard,
  Database,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  FileText,
  FileChartColumn,
  Gauge,
  History,
  House,
  IdCard,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Repeat,
  ScrollText,
  Settings,
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
import { NestoryLogo } from "@/components/brand/nestory-logo";
import { signOutAction } from "@/features/auth/actions";
import type { WorkspaceRole } from "@/lib/auth/context";
import { getWorkspaceEntryPath } from "@/lib/auth/workspace-entry";

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
  href?: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: "dashboard",
    label: "Overview",
    roomLabel: "Dashboard",
    icon: LayoutDashboard,
    href: "/overview",
    items: [],
  },
  {
    id: "property",
    label: "Property",
    roomLabel: "Property",
    icon: Building2,
    items: [
      { href: "/properties", label: "Properties", icon: House },
      { href: "/units", label: "Units", icon: DoorOpen },
    ],
  },
  {
    id: "people",
    label: "People",
    roomLabel: "People",
    icon: UsersRound,
    items: [
      { href: "/people", label: "Dashboard", icon: Gauge },
      { href: "/tenants", label: "Tenants", icon: UserRound },
      { href: "/owners", label: "Owners", icon: KeyRound },
      { href: "/staff", label: "Staff", icon: IdCard, activeHrefs: ["/team"] },
      { href: "/vendors", label: "Vendors", icon: Truck },
    ],
  },
  {
    id: "operations",
    label: "Maintenance",
    roomLabel: "Maintenance",
    icon: Wrench,
    items: [
      {
        href: "/maintenance",
        label: "Cases",
        icon: ClipboardList,
        activeHrefs: ["/work-orders", "/tasks", "/inspections"],
      },
      { href: "/recurring-tasks", label: "Recurring Work", icon: Repeat },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    roomLabel: "Finance",
    icon: Landmark,
    items: [
      {
        href: "/rent-income",
        label: "Rent & Income",
        icon: CreditCard,
        activeHrefs: ["/payments"],
      },
      {
        href: "/bills-expenses",
        label: "Bills & Expenses",
        icon: ReceiptText,
        activeHrefs: ["/invoices"],
      },
      { href: "/leases", label: "Leases", icon: ScrollText },
      { href: "/ledger", label: "Ledger", icon: BookOpen },
      { href: "/petty-cash", label: "Petty Cash", icon: Coins },
    ],
  },
  {
    id: "timeline",
    label: "Timeline",
    roomLabel: "Timeline",
    icon: History,
    items: [
      { href: "/timeline", label: "Global Timeline", icon: Activity },
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
  {
    id: "reports",
    label: "Reports",
    roomLabel: "Reports",
    icon: FileChartColumn,
    href: "/reports",
    items: [],
  },
];

const dataGroup: NavGroup = {
  id: "data",
  label: "Data",
  roomLabel: "Data",
  icon: Database,
  items: [
    { href: "/documents", label: "Documents", icon: FileText },
    { href: "/import", label: "Import data", icon: Upload },
  ],
};

const settingsGroup: NavGroup = {
  id: "settings",
  label: "Settings",
  roomLabel: "Settings",
  icon: Settings,
  items: [
    { href: "/settings", label: "Organization", icon: Building2, section: "Organization" },
    { href: "/users-roles", label: "Users & Roles", icon: UsersRound, section: "Access" },
  ],
};

const mobilePrimaryItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: House },
  { href: "/units", label: "Units", icon: DoorOpen },
  { href: "/maintenance", label: "Cases", icon: ClipboardList },
  { href: "/ledger", label: "Ledger", icon: Landmark },
] satisfies NavItem[];

type AppShellProps = {
  children: React.ReactNode;
  organizationName?: string;
  role?: WorkspaceRole;
  userEmail?: string;
};

function getDesktopNavGroups(role: WorkspaceRole) {
  if (role === "admin") {
    return [...navGroups, dataGroup, settingsGroup];
  }

  if (role === "manager") {
    return [
      {
        ...navGroups.find((group) => group.id === "operations")!,
        items: [
          {
            href: "/maintenance",
            label: "Cases",
            icon: ClipboardList,
            activeHrefs: ["/tasks"],
          },
          { href: "/tasks", label: "Tasks", icon: CheckSquare },
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

function getMobilePrimaryNavItems(role: WorkspaceRole) {
  if (role === "admin") {
    return mobilePrimaryItems;
  }

  if (role === "manager") {
    return [
      { href: "/maintenance", label: "Cases", icon: ClipboardList },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
    ] satisfies NavItem[];
  }

  return [{ href: "/tasks", label: "Tasks", icon: CheckSquare }] satisfies NavItem[];
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

function isNavGroupActive(pathname: string, group: NavGroup) {
  return (
    (group.href !== undefined &&
      (pathname === group.href || pathname.startsWith(`${group.href}/`))) ||
    group.items.some((item) => isNavItemActive(pathname, item))
  );
}

function getPathGroup(pathname: string, groups: NavGroup[]) {
  return groups.find((group) => isNavGroupActive(pathname, group));
}

export function AppShell({
  children,
  organizationName = "Admin workspace",
  role = "admin",
  userEmail,
}: AppShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const desktopNavGroups = getDesktopNavGroups(role);
  const mobilePrimaryNavItems = getMobilePrimaryNavItems(role);
  const mobileMoreItems = [
    ...desktopNavGroups.flatMap((group) =>
      group.href
        ? [{ href: group.href, label: group.label, icon: group.icon }]
        : group.items,
    ),
  ] satisfies NavItem[];
  const pathGroup = getPathGroup(pathname, desktopNavGroups);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const selectedDesktopGroup = pathGroup ?? desktopNavGroups[0];
  const [openDesktopGroupIds, setOpenDesktopGroupIds] = useState<string[]>(
    () => [selectedDesktopGroup.id],
  );
  const expandedDesktopGroupIds = new Set([
    ...openDesktopGroupIds,
    selectedDesktopGroup.id,
  ]);
  const workspaceNavGroups = desktopNavGroups.filter(
    (group) => group.id !== "settings",
  );
  const managementNavGroups = desktopNavGroups.filter(
    (group) => group.id === "settings",
  );
  const isSettingsActive = managementNavGroups.some((group) =>
    group.items.some((item) => isNavItemActive(pathname, item)),
  );
  const isMobileMoreActive = mobileMoreItems.some((item) =>
    isNavItemActive(pathname, item),
  );

  function toggleTheme() {
    const currentTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("nestory-theme", nextTheme);
  }

  function toggleDesktopGroup(groupId: string) {
    setOpenDesktopGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );
  }

  function expandDesktopSidebar(groupId?: string) {
    if (groupId) {
      setOpenDesktopGroupIds((current) =>
        current.includes(groupId) ? current : [...current, groupId],
      );
    }

    setSidebarCollapsed(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden border-r border-border bg-surface text-foreground transition-[width] duration-200 print:hidden lg:flex",
          sidebarCollapsed ? "w-12" : "w-[244px]",
        )}
      >
        {sidebarCollapsed ? (
          <CollapsedDesktopSidebar
            groups={workspaceNavGroups}
            onExpand={expandDesktopSidebar}
            onThemeToggle={toggleTheme}
            organizationName={organizationName}
            role={role}
            selectedGroupId={selectedDesktopGroup.id}
            showSettings={managementNavGroups.length > 0}
            settingsActive={isSettingsActive}
            userEmail={userEmail}
          />
        ) : (
          <ExpandedDesktopSidebar
            expandedGroupIds={expandedDesktopGroupIds}
            managementGroups={managementNavGroups}
            onCollapse={() => setSidebarCollapsed(true)}
            onGroupToggle={toggleDesktopGroup}
            onThemeToggle={toggleTheme}
            organizationName={organizationName}
            pathname={pathname}
            role={role}
            selectedGroupId={selectedDesktopGroup.id}
            settingsActive={isSettingsActive}
            userEmail={userEmail}
            workspaceGroups={workspaceNavGroups}
          />
        )}
      </aside>

      <main
        className={cn(
          "min-h-screen transition-[margin-left] duration-200 print:ml-0",
          sidebarCollapsed ? "lg:ml-12" : "lg:ml-[244px]",
        )}
      >
        <div className="border-b border-border bg-surface print:hidden lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <NestoryLogo
                markClassName="h-8 w-8"
                subtitle={userEmail ?? organizationName}
                subtitleClassName="text-muted normal-case tracking-normal"
                textClassName="text-lg text-foreground"
              />
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
            <Popover.Root onOpenChange={setMobileMoreOpen} open={mobileMoreOpen}>
              <Popover.Trigger asChild>
                <button
                  aria-haspopup="menu"
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted transition-colors",
                    isMobileMoreActive || mobileMoreOpen
                      ? "bg-accent-soft text-foreground"
                      : "hover:bg-surface-muted hover:text-foreground",
                  )}
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
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="end"
                  className="z-[80] w-56 rounded-md border border-border bg-surface p-2 shadow-lg"
                  role="menu"
                  sideOffset={6}
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
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

function ExpandedDesktopSidebar({
  expandedGroupIds,
  managementGroups,
  onCollapse,
  onGroupToggle,
  onThemeToggle,
  organizationName,
  pathname,
  role,
  selectedGroupId,
  settingsActive,
  userEmail,
  workspaceGroups,
}: {
  expandedGroupIds: Set<string>;
  managementGroups: NavGroup[];
  onCollapse: () => void;
  onGroupToggle: (groupId: string) => void;
  onThemeToggle: () => void;
  organizationName: string;
  pathname: string;
  role: WorkspaceRole;
  selectedGroupId: string;
  settingsActive: boolean;
  userEmail?: string;
  workspaceGroups: NavGroup[];
}) {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3">
        <Link
          className="flex min-w-0 flex-1 items-center gap-3 text-foreground"
          href={getWorkspaceEntryPath(role)}
          prefetch={false}
        >
          <NestoryLogo
            markClassName="h-8 w-8"
            subtitle="Dashboard"
            subtitleClassName="text-muted"
            textClassName="text-foreground"
          />
        </Link>
        <button
          aria-label="Collapse sidebar"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          onClick={onCollapse}
          title="Collapse sidebar"
          type="button"
        >
          <PanelLeftClose size={14} />
        </button>
      </header>

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Sidebar navigation">
        <DesktopSidebarSection
          expandedGroupIds={expandedGroupIds}
          groups={workspaceGroups}
          onGroupToggle={onGroupToggle}
          pathname={pathname}
          selectedGroupId={selectedGroupId}
          title="Workspace"
        />
      </nav>

      <div className="flex h-12 shrink-0 items-center gap-1 border-t border-border px-3">
        {managementGroups.length > 0 ? (
          <SidebarAccountLink
            href="/settings"
            icon={Settings}
            isActive={settingsActive}
            label="Settings"
          />
        ) : null}
        <ThemeToggle onToggle={onThemeToggle} />
      </div>

      <footer className="flex h-16 shrink-0 items-center border-t border-border px-3">
        <ProfileMenu
          email={userEmail}
          menuClassName="w-56"
          menuSide="top"
          organizationName={organizationName}
          role={role}
          variant="sidebar"
        />
      </footer>
    </div>
  );
}

function CollapsedDesktopSidebar({
  groups,
  onExpand,
  onThemeToggle,
  organizationName,
  role,
  selectedGroupId,
  settingsActive,
  showSettings,
  userEmail,
}: {
  groups: NavGroup[];
  onExpand: (groupId?: string) => void;
  onThemeToggle: () => void;
  organizationName: string;
  role: WorkspaceRole;
  selectedGroupId: string;
  settingsActive: boolean;
  showSettings: boolean;
  userEmail?: string;
}) {
  return (
    <div className="flex h-full w-12 flex-col items-center">
      <div className="flex h-24 shrink-0 flex-col items-center justify-center gap-2 border-b border-border">
        <Link
          aria-label="Nestory dashboard"
          className="grid h-8 w-8 place-items-center overflow-hidden"
          href={getWorkspaceEntryPath(role)}
          prefetch={false}
          title="Nestory"
        >
          <NestoryLogo markClassName="h-8 w-8" showText={false} />
        </Link>
        <button
          aria-label="Expand sidebar"
          className="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          onClick={() => onExpand()}
          title="Expand sidebar"
          type="button"
        >
          <PanelLeftOpen size={14} />
        </button>
      </div>

      <nav
        aria-label="Collapsed sidebar navigation"
        className="flex flex-1 flex-col items-center gap-1 px-2 py-3"
      >
        {groups.map((group) => {
          const Icon = group.icon;
          const isActive = selectedGroupId === group.id;

          if (group.href) {
            return (
              <Link
                aria-label={group.label}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
                  isActive && "bg-surface-muted text-foreground",
                )}
                href={group.href}
                key={group.id}
                prefetch={false}
                title={group.label}
              >
                <Icon size={14} />
              </Link>
            );
          }

          return (
            <button
              aria-label={`Open ${group.label} navigation`}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
                isActive && "bg-surface-muted text-foreground",
              )}
              key={group.id}
              onClick={() => onExpand(group.id)}
              title={group.label}
              type="button"
            >
              <Icon size={14} />
            </button>
          );
        })}
      </nav>

      <div className="flex w-full shrink-0 flex-col items-center gap-1 border-t border-border py-2">
        <ThemeToggle onToggle={onThemeToggle} />
        {showSettings ? (
          <Link
            aria-label="Settings"
            className={cn(
              "grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
              settingsActive && "bg-surface-muted text-foreground",
            )}
            href="/settings"
            prefetch={false}
            title="Settings"
          >
            <Settings size={15} />
          </Link>
        ) : null}
        <ProfileMenu
          email={userEmail}
          menuAlign="end"
          menuClassName="w-56"
          menuSide="right"
          organizationName={organizationName}
          role={role}
        />
      </div>
    </div>
  );
}

function DesktopSidebarSection({
  expandedGroupIds,
  groups,
  onGroupToggle,
  pathname,
  selectedGroupId,
  title,
}: {
  expandedGroupIds: Set<string>;
  groups: NavGroup[];
  onGroupToggle: (groupId: string) => void;
  pathname: string;
  selectedGroupId: string;
  title: string;
}) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="mb-4">
      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-subtle">
        {title}
      </p>
      <div className="space-y-1">
        {groups.map((group) => (
          <DesktopSidebarGroup
            group={group}
            isExpanded={expandedGroupIds.has(group.id)}
            isSelected={selectedGroupId === group.id}
            key={group.id}
            onToggle={() => onGroupToggle(group.id)}
            pathname={pathname}
          />
        ))}
      </div>
    </section>
  );
}

function DesktopSidebarGroup({
  group,
  isExpanded,
  isSelected,
  onToggle,
  pathname,
}: {
  group: NavGroup;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  pathname: string;
}) {
  const Icon = group.icon;
  const ToggleIcon = isExpanded ? ChevronDown : ChevronRight;

  if (group.href) {
    return (
      <Link
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground",
          isSelected && "bg-surface-muted font-semibold text-foreground",
        )}
        href={group.href}
        prefetch={false}
      >
        <Icon
          className={cn(
            "ml-[21px] shrink-0",
            isSelected && "text-foreground",
          )}
          size={13}
        />
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        aria-expanded={isExpanded}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground",
          isSelected && "font-semibold text-foreground",
        )}
        onClick={onToggle}
        type="button"
      >
        <ToggleIcon className="shrink-0 text-foreground-subtle" size={13} />
        <Icon
          className={cn(
            "shrink-0",
            isSelected && "text-foreground",
          )}
          size={13}
        />
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
      </button>
      {isExpanded ? (
        <div className="mt-0.5 space-y-0.5 pl-6">
          {group.items.map((item, index) => {
            const ItemIcon = item.icon;
            const isActive = isNavItemActive(pathname, item);
            const showSection =
              item.section && item.section !== group.items[index - 1]?.section;

            return (
              <div key={item.href}>
                {showSection ? (
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-subtle">
                    {item.section}
                  </p>
                ) : null}
                <Link
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
                    isActive && "bg-surface-muted font-semibold text-foreground",
                  )}
                  href={item.href}
                  prefetch={false}
                >
                  <ItemIcon className="shrink-0" size={13} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </Link>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SidebarAccountLink({
  href,
  icon: Icon,
  isActive,
  label,
}: {
  href: string;
  icon: LucideIcon;
  isActive: boolean;
  label: string;
}) {
  return (
    <Link
      className={cn(
        "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
        isActive && "bg-surface-muted font-semibold text-foreground",
      )}
      href={href}
      prefetch={false}
    >
      <Icon className="shrink-0" size={14} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}

function ProfileMenu({
  email,
  menuAlign,
  menuClassName,
  menuSide,
  organizationName,
  role,
  variant = "avatar",
}: {
  email?: string;
  menuAlign?: "center" | "end" | "start";
  menuClassName?: string;
  menuSide?: "bottom" | "left" | "right" | "top";
  organizationName: string;
  role: WorkspaceRole;
  variant?: "avatar" | "sidebar";
}) {
  const [open, setOpen] = useState(false);
  const label = email ?? organizationName;
  const contentAlign = menuAlign ?? (variant === "sidebar" ? "start" : "end");
  const contentSide = menuSide ?? (variant === "sidebar" ? "top" : "bottom");

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>
        <button
          aria-haspopup="menu"
          aria-label="Open profile menu"
          className={cn(
            "transition-colors",
            variant === "sidebar"
              ? "flex h-10 w-full min-w-0 items-center gap-3 rounded-md text-left hover:bg-surface-muted"
              : "flex h-8 min-w-8 items-center justify-center rounded-full border border-border bg-surface-muted px-2 text-[12px] font-semibold text-foreground hover:bg-surface",
          )}
          title={label}
          type="button"
        >
          {variant === "sidebar" ? (
            <>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-[12px] font-semibold text-foreground">
                {getInitials(label)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-foreground">
                  {label}
                </span>
                <span className="mt-1 block truncate text-[11px] text-muted">
                  {formatRole(role)} / {organizationName}
                </span>
              </span>
            </>
          ) : (
            getInitials(label)
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={contentAlign}
          className={cn(
            "z-[80] w-64 rounded-md border border-border bg-surface p-2 shadow-lg",
            menuClassName,
          )}
          role="menu"
          side={contentSide}
          sideOffset={6}
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
            onNavigate={() => setOpen(false)}
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
