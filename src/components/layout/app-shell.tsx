"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Building2,
  FileChartColumn,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  UserRound,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NestoryLogo } from "@/components/brand/nestory-logo";
import { WorkspaceCommandPalette } from "@/components/layout/workspace-command-palette";
import { signOutAction } from "@/features/auth/actions";
import type { WorkspaceRole } from "@/lib/auth/context";
import { getWorkspaceEntryPath } from "@/lib/auth/workspace-entry";

type GlobalDestination = {
  id: "overview" | "properties" | "people" | "finance" | "maintenance" | "records" | "reports" | "settings";
  href: string;
  icon: LucideIcon;
  label: string;
  routes: readonly string[];
};

const ADMIN_GLOBAL_DESTINATIONS = [
  {
    id: "overview",
    href: "/overview",
    icon: LayoutDashboard,
    label: "Overview",
    routes: ["/overview"],
  },
  {
    id: "properties",
    href: "/properties",
    icon: Building2,
    label: "Properties",
    routes: ["/properties", "/units", "/property-dashboard"],
  },
  {
    id: "people",
    href: "/people",
    icon: UsersRound,
    label: "People",
    routes: [
      "/people",
      "/people-reports",
      "/tenants",
      "/owners",
      "/vendors",
      "/staff",
      "/team",
    ],
  },
  {
    id: "finance",
    href: "/rent-income",
    icon: Landmark,
    label: "Finance",
    routes: [
      "/rent-income",
      "/bills-expenses",
      "/leases",
      "/ledger",
      "/petty-cash",
      "/payments",
      "/invoices",
      "/finance-dashboard",
    ],
  },
  {
    id: "maintenance",
    href: "/maintenance",
    icon: Wrench,
    label: "Maintenance",
    routes: [
      "/maintenance",
      "/tasks",
      "/work-orders",
      "/inspections",
      "/recurring-tasks",
      "/schedule",
      "/maintenance-dashboard",
    ],
  },
  {
    id: "records",
    href: "/timeline",
    icon: History,
    label: "Records",
    routes: [
      "/timeline",
      "/property-timeline",
      "/maintenance-timeline",
      "/financial-timeline",
      "/documents",
      "/import",
    ],
  },
  {
    id: "reports",
    href: "/reports",
    icon: FileChartColumn,
    label: "Reports",
    routes: ["/reports"],
  },
  {
    id: "settings",
    href: "/settings",
    icon: Settings,
    label: "Settings",
    routes: ["/settings", "/users-roles", "/account"],
  },
] satisfies readonly GlobalDestination[];

type AppShellProps = {
  children: React.ReactNode;
  organizationName?: string;
  role?: WorkspaceRole;
  userEmail?: string;
};

function getGlobalDestinations(role: WorkspaceRole): readonly GlobalDestination[] {
  if (role === "admin") {
    return ADMIN_GLOBAL_DESTINATIONS;
  }

  return [
    {
      id: "maintenance",
      href: role === "manager" ? "/maintenance" : "/tasks",
      icon: Wrench,
      label: "Maintenance",
      routes: [
        "/maintenance",
        "/tasks",
        "/work-orders",
        "/inspections",
        "/recurring-tasks",
        "/schedule",
      ],
    },
  ];
}

function destinationMatchesPath(
  pathname: string,
  destination: GlobalDestination,
) {
  return destination.routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function getActiveDestinationId(
  pathname: string,
  destinations: readonly GlobalDestination[],
) {
  return destinations.find((destination) =>
    destinationMatchesPath(pathname, destination),
  )?.id;
}

export function AppShell({
  children,
  organizationName = "Administrator workspace",
  role = "admin",
  userEmail,
}: AppShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const globalDestinations = getGlobalDestinations(role);
  const activeDestinationId = getActiveDestinationId(
    pathname,
    globalDestinations,
  );

  function toggleTheme() {
    const currentTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("nestory-theme", nextTheme);
  }

  function expandDesktopSidebar() {
    setSidebarCollapsed(false);
  }

  function collapseDesktopSidebar() {
    setSidebarCollapsed(true);
  }

  return (
    <div className="h-dvh min-h-0 overflow-hidden bg-background print:h-auto print:min-h-screen print:overflow-visible">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden border-r border-border bg-surface text-foreground transition-[width] duration-200 print:hidden lg:flex",
          sidebarCollapsed ? "w-12" : "w-[208px]",
        )}
      >
        {sidebarCollapsed ? (
          <CollapsedDesktopSidebar
            activeDestinationId={activeDestinationId}
            destinations={globalDestinations}
            role={role}
          />
        ) : (
          <ExpandedDesktopSidebar
            activeDestinationId={activeDestinationId}
            destinations={globalDestinations}
            role={role}
          />
        )}
      </aside>

      <main
        className={cn(
          "flex h-dvh min-h-0 flex-col overflow-hidden transition-[margin-left] duration-200 print:ml-0 print:block print:h-auto print:overflow-visible",
          sidebarCollapsed ? "lg:ml-12" : "lg:ml-[208px]",
        )}
      >
        <div
          className="shrink-0 border-b border-border bg-surface print:hidden lg:hidden"
          data-slot="mobile-shell-header"
        >
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
              <ProfileMenu
                email={userEmail}
                organizationName={organizationName}
                role={role}
              />
            </div>
          </div>
          <div className="relative flex items-center gap-2 px-4 pb-3">
            <nav
              aria-label="Global mobile navigation"
              className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
            >
              {globalDestinations.map((destination) => {
                const Icon = destination.icon;
                const isActive = activeDestinationId === destination.id;

                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring",
                      isActive
                        ? "bg-accent-soft text-foreground"
                        : null,
                    )}
                    href={destination.href}
                    key={destination.id}
                    prefetch={false}
                  >
                    <Icon size={15} />
                    {destination.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
        <div
          className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 print:hidden"
          data-slot="workspace-command-entry"
        >
          <button
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-8 w-8 shrink-0 place-items-center rounded-md text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring lg:grid"
            data-slot="workspace-sidebar-toggle"
            onClick={sidebarCollapsed ? expandDesktopSidebar : collapseDesktopSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            type="button"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
          <div className="flex min-w-0 flex-1 items-center" id="workspace-page-tools" />
          <WorkspaceCommandPalette role={role} />
          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            <ThemeToggle onToggle={toggleTheme} />
            <ProfileMenu
              email={userEmail}
              organizationName={organizationName}
              role={role}
            />
          </div>
        </div>
        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto print:overflow-visible"
          data-slot="app-shell-content"
        >
          {children}
        </div>
      </main>
    </div>
  );
}

function ExpandedDesktopSidebar({
  activeDestinationId,
  destinations,
  role,
}: {
  activeDestinationId?: GlobalDestination["id"];
  destinations: readonly GlobalDestination[];
  role: WorkspaceRole;
}) {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3">
        <Link
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          href={getWorkspaceEntryPath(role)}
          prefetch={false}
        >
          <NestoryLogo
            markClassName="h-8 w-8"
            subtitle="Workspace"
            subtitleClassName="text-muted"
            textClassName="text-foreground"
          />
        </Link>
      </header>

      <nav
        aria-label="Global navigation"
        className="flex-1 overflow-y-auto px-2 py-3"
      >
        <div className="space-y-1">
          {destinations.map((destination) => (
            <GlobalDestinationLink
              destination={destination}
              isActive={activeDestinationId === destination.id}
              key={destination.id}
            />
          ))}
        </div>
      </nav>

    </div>
  );
}

function CollapsedDesktopSidebar({
  activeDestinationId,
  destinations,
  role,
}: {
  activeDestinationId?: GlobalDestination["id"];
  destinations: readonly GlobalDestination[];
  role: WorkspaceRole;
}) {
  return (
    <div className="flex h-full w-12 flex-col items-center">
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-border">
        <Link
          aria-label="Nestory workspace"
          className="grid h-8 w-8 place-items-center overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          href={getWorkspaceEntryPath(role)}
          prefetch={false}
          title="Nestory"
        >
          <NestoryLogo markClassName="h-8 w-8" showText={false} />
        </Link>
      </div>

      <nav
        aria-label="Collapsed global navigation"
        className="flex flex-1 flex-col items-center gap-1 px-2 py-3"
      >
        {destinations.map((destination) => {
          const Icon = destination.icon;
          const isActive = activeDestinationId === destination.id;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              aria-label={destination.label}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-md text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring",
                isActive && "bg-surface-muted text-foreground",
              )}
              href={destination.href}
              key={destination.id}
              prefetch={false}
              title={destination.label}
            >
              <Icon size={14} />
            </Link>
          );
        })}
      </nav>

    </div>
  );
}

function GlobalDestinationLink({
  destination,
  isActive,
}: {
  destination: GlobalDestination;
  isActive: boolean;
}) {
  const Icon = destination.icon;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium text-foreground-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring",
        isActive && "bg-surface-muted font-semibold text-foreground",
      )}
      href={destination.href}
      prefetch={false}
    >
      <Icon className="shrink-0" size={15} />
      <span className="min-w-0 flex-1 truncate">{destination.label}</span>
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
            "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring",
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
            className="mt-1 flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
            href="/account"
            onNavigate={() => setOpen(false)}
            role="menuitem"
          >
            <UserRound size={15} />
            Profile
          </Link>
          <form action={signOutAction}>
            <button
              className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-danger outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
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
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
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
    return "Administrator";
  }

  if (role === "manager") {
    return "Manager";
  }

  return "Team Member";
}
