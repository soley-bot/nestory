"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronRight,
  FileChartColumn,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Settings,
  UserRound,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { NestoryLogo } from "@/components/brand/nestory-logo";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { WorkspaceCommandPalette } from "@/components/layout/workspace-command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { signOutAction } from "@/features/auth/actions";
import { formatWorkspaceAccessRole } from "@/features/organization/access-status";
import type { WorkspaceRole, WorkspaceRoleKind } from "@/lib/auth/context";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permission-catalog";
import type { OrganizationTheme } from "@/lib/theme/organization-theme";
import { getWorkspaceEntryPath } from "@/lib/auth/workspace-entry";

type GlobalDestination = {
  children?: readonly GlobalDestinationChild[];
  id: string;
  href: string;
  icon: LucideIcon;
  label: string;
  routes: readonly string[];
};

type GlobalDestinationChild = {
  href: string;
  label: string;
  routes: readonly string[];
};

const PROPERTIES_CHILDREN = [
  { href: "/properties", label: "Register", routes: ["/properties"] },
  { href: "/units", label: "Units", routes: ["/units"] },
  { href: "/leases", label: "Leases", routes: ["/leases"] },
] satisfies readonly GlobalDestinationChild[];

const PEOPLE_CHILDREN = [
  { href: "/people", label: "Directory", routes: ["/people"] },
  { href: "/tenants", label: "Tenants", routes: ["/tenants"] },
  { href: "/owners", label: "Owners", routes: ["/owners"] },
  { href: "/vendors", label: "Vendors", routes: ["/vendors"] },
  { href: "/staff", label: "Staff", routes: ["/staff"] },
] satisfies readonly GlobalDestinationChild[];

const FINANCE_CHILDREN = [
  { href: "/finance", label: "Portfolio review", routes: ["/finance"] },
  {
    href: "/rent-income",
    label: "Rent & collections",
    routes: ["/rent-income"],
  },
  { href: "/bills-expenses", label: "Expenses", routes: ["/bills-expenses"] },
  { href: "/balances", label: "Owner accounts", routes: ["/balances"] },
  {
    href: "/finance/advanced",
    label: "Advanced",
    routes: ["/finance/advanced", "/petty-cash", "/ledger"],
  },
] satisfies readonly GlobalDestinationChild[];

const MAINTENANCE_CHILDREN = [
  { href: "/maintenance", label: "Cases", routes: ["/maintenance"] },
  { href: "/tasks", label: "My work", routes: ["/tasks"] },
  {
    href: "/recurring-tasks",
    label: "Recurring work",
    routes: ["/recurring-tasks"],
  },
  { href: "/inspections", label: "Inspections", routes: ["/inspections"] },
  { href: "/work-orders", label: "Work orders", routes: ["/work-orders"] },
] satisfies readonly GlobalDestinationChild[];

const RECORDS_CHILDREN = [
  { href: "/timeline", label: "Timeline history", routes: ["/timeline"] },
  {
    href: "/property-timeline",
    label: "Property timeline",
    routes: ["/property-timeline"],
  },
  {
    href: "/maintenance-timeline",
    label: "Maintenance timeline",
    routes: ["/maintenance-timeline"],
  },
  {
    href: "/financial-timeline",
    label: "Financial timeline",
    routes: ["/financial-timeline"],
  },
  { href: "/documents", label: "Documents", routes: ["/documents"] },
  { href: "/import", label: "Import", routes: ["/import"] },
] satisfies readonly GlobalDestinationChild[];

const ADMIN_GLOBAL_DESTINATIONS = [
  {
    id: "overview",
    href: "/overview",
    icon: LayoutDashboard,
    label: "Dashboard",
    routes: ["/overview"],
  },
  {
    children: PROPERTIES_CHILDREN,
    id: "properties",
    href: "/properties",
    icon: Building2,
    label: "Properties",
    routes: ["/properties", "/units", "/leases"],
  },
  {
    children: PEOPLE_CHILDREN,
    id: "people",
    href: "/people",
    icon: UsersRound,
    label: "People",
    routes: ["/people", "/tenants", "/owners", "/vendors", "/staff"],
  },
  {
    children: FINANCE_CHILDREN,
    id: "finance",
    href: "/finance",
    icon: Landmark,
    label: "Finance",
    routes: [
      ...FINANCE_CHILDREN.flatMap((destination) => destination.routes),
    ],
  },
  {
    children: MAINTENANCE_CHILDREN,
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
    ],
  },
  {
    children: RECORDS_CHILDREN,
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
    routes: ["/settings"],
  },
] satisfies readonly GlobalDestination[];

type AppShellBaseProps = {
  children: React.ReactNode;
  /** Resolved from the sidebar_state cookie so a collapsed rail stays collapsed. */
  defaultSidebarOpen?: boolean;
  organizationName?: string;
  permissionKeys?: readonly PermissionKey[];
  role?: WorkspaceRole | WorkspaceRoleKind;
  roleKind?: WorkspaceRoleKind;
  roleName?: string;
  userEmail?: string;
};

type AppShellProps = AppShellBaseProps &
  (
    | {
        organizationId: string;
        theme: OrganizationTheme;
        userId: string;
      }
    | {
        organizationId?: undefined;
        theme?: undefined;
        userId?: undefined;
      }
  );

function getGlobalDestinations({
  isSuperAdmin,
  permissionKeys,
}: {
  isSuperAdmin: boolean;
  permissionKeys: ReadonlySet<PermissionKey>;
}): readonly GlobalDestination[] {
  if (isSuperAdmin) return ADMIN_GLOBAL_DESTINATIONS;

  const destinations: GlobalDestination[] = [];
  const has = (permission: PermissionKey) => permissionKeys.has(permission);

  if (has("properties.view") || has("leases.view")) {
    destinations.push({
      ...ADMIN_GLOBAL_DESTINATIONS[1],
      children: PROPERTIES_CHILDREN.filter((child) =>
        child.href === "/leases" ? has("leases.view") : has("properties.view"),
      ),
    });
  }

  if (has("people.view")) {
    destinations.push(ADMIN_GLOBAL_DESTINATIONS[2]);
  }

  if (has("finance.view")) {
    destinations.push({
      ...ADMIN_GLOBAL_DESTINATIONS[3],
      children: FINANCE_CHILDREN.filter((child) => {
        if (child.href === "/rent-income") return has("finance.record_payments");
        if (child.href === "/bills-expenses") {
          return (
            has("finance.submit_expenses") ||
            has("finance.approve_expenses") ||
            has("finance.correct_records")
          );
        }
        if (child.href === "/finance/advanced") {
          return has("finance.correct_records") || has("finance.close_periods");
        }
        return true;
      }),
    });
  }

  if (has("maintenance.view")) {
    const canManage =
      has("maintenance.create_assign") || has("maintenance.review");
    destinations.push({
      ...ADMIN_GLOBAL_DESTINATIONS[4],
      children: MAINTENANCE_CHILDREN.filter((child) => {
        if (child.href === "/maintenance") return true;
        if (child.href === "/tasks") return has("maintenance.complete");
        return canManage;
      }),
    });
  }

  if (has("finance.publish")) {
    destinations.push(ADMIN_GLOBAL_DESTINATIONS[6]);
  }

  return destinations;
}

function destinationMatchesPath(
  pathname: string,
  destination: GlobalDestination,
) {
  return destination.routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function childDestinationMatchesPath(
  pathname: string,
  destination: GlobalDestinationChild,
) {
  return destination.routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function DomainDestinationMenuItem({
  active,
  destination,
  pathname,
}: {
  active: boolean;
  destination: GlobalDestination;
  pathname: string;
}) {
  const [expanded, setExpanded] = useState(active);
  const [wasActive, setWasActive] = useState(active);
  const { isMobile, state } = useSidebar();
  const Icon = destination.icon;
  const children = destination.children ?? [];
  const hasActiveChild = children.some((child) =>
    childDestinationMatchesPath(pathname, child),
  );

  // Open the domain the operator navigated into, without closing the ones they
  // opened by hand. Adjusting state during render is React's documented answer
  // for deriving from a changed prop; remounting on every pathname change (the
  // previous approach) discarded the operator's choice instead.
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setExpanded(true);
  }

  // Collapsed to icons, SidebarMenuSub is display:none, so the domain's pages
  // become unreachable from the rail — Records has no in-page nav to fall back
  // on. Swap the inline list for a flyout, the shadcn pattern for this state.
  if (state === "collapsed" && !isMobile && children.length > 0) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton isActive={active} tooltip={destination.label}>
              <Icon />
              <span>{destination.label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48" side="right" sideOffset={4}>
            <DropdownMenuLabel>{destination.label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {children.map((child) => (
              <DropdownMenuItem asChild key={child.href}>
                <Link href={child.href} prefetch={false}>
                  {child.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild onOpenChange={setExpanded} open={expanded}>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={active && !hasActiveChild}
          tooltip={destination.label}
        >
          <Link
            aria-current={active && !hasActiveChild ? "page" : undefined}
            href={destination.href}
            prefetch={false}
          >
            <Icon />
            <span>{destination.label}</span>
          </Link>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction
            aria-label={`${expanded ? "Collapse" : "Expand"} ${destination.label} navigation`}
            type="button"
          >
            <ChevronRight
              aria-hidden="true"
              className="transition-transform duration-200 data-open:rotate-90"
              data-open={expanded ? "" : undefined}
            />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent className="data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-1">
          <SidebarMenuSub aria-label={`${destination.label} pages`}>
            {destination.children?.map((child) => {
              const childActive = childDestinationMatchesPath(pathname, child);
              return (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton asChild isActive={childActive}>
                    <Link
                      aria-current={childActive ? "page" : undefined}
                      href={child.href}
                      prefetch={false}
                    >
                      <span>{child.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AppShell({
  children,
  defaultSidebarOpen = true,
  organizationId,
  organizationName = "Nestory workspace",
  permissionKeys,
  role,
  roleKind,
  roleName,
  theme,
  userEmail,
  userId,
}: AppShellProps) {
  const pathname = usePathname();
  const resolvedRoleKind =
    roleKind ?? (role === "super_admin" || role === "custom" ? role : null);
  const isSuperAdmin = resolvedRoleKind === "super_admin";
  const resolvedPermissionKeys = new Set<PermissionKey>(
    isSuperAdmin ? PERMISSION_KEYS : permissionKeys ?? [],
  );
  const resolvedRoleName =
    roleName ??
    (resolvedRoleKind === "custom"
      ? "Custom role"
      : resolvedRoleKind === "super_admin"
        ? formatWorkspaceAccessRole("super_admin")
        : "Access unavailable");
  const destinations = getGlobalDestinations({
    isSuperAdmin,
    permissionKeys: resolvedPermissionKeys,
  });
  const primaryDestinations = destinations.filter(
    (destination) =>
      destination.id !== "reports" && destination.id !== "settings",
  );
  const secondaryDestinations = destinations.filter(
    (destination) =>
      destination.id === "reports" || destination.id === "settings",
  );

  return (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen={defaultSidebarOpen}
        style={
          {
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties
        }
      >
        <Sidebar collapsible="icon" variant="inset">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  size="lg"
                  tooltip="Nestory"
                >
                  <Link
                    href={getWorkspaceEntryPath({
                      isSuperAdmin,
                      permissionKeys: resolvedPermissionKeys,
                    })}
                    prefetch={false}
                  >
                    <NestoryLogo markClassName="size-8" showText={false} />
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">Nestory</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {organizationName}
                      </span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <nav
              aria-label="Global navigation"
              className="flex min-h-0 flex-1 flex-col"
            >
              <SidebarGroup>
                <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                <SidebarGroupContent className="flex flex-col gap-2">
                  {isSuperAdmin || resolvedPermissionKeys.has("properties.write") ? (
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                          tooltip="Quick Create"
                        >
                          <Link
                            href="/properties?action=create"
                            prefetch={false}
                          >
                            <PlusCircle />
                            <span>Quick Create</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  ) : null}
                  <SidebarMenu>
                    {primaryDestinations.map((destination) => {
                      const active = destinationMatchesPath(
                        pathname,
                        destination,
                      );
                      const Icon = destination.icon;
                      return destination.children ? (
                        <DomainDestinationMenuItem
                          active={active}
                          destination={destination}
                          key={destination.id}
                          pathname={pathname}
                        />
                      ) : (
                        <SidebarMenuItem key={destination.id}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={destination.label}
                          >
                            <Link
                              aria-current={active ? "page" : undefined}
                              href={destination.href}
                              prefetch={false}
                            >
                              <Icon />
                              <span>{destination.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {secondaryDestinations.length > 0 ? (
                <SidebarGroup className="mt-auto">
                  <SidebarGroupLabel>Manage</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {secondaryDestinations.map((destination) => {
                        const active = destinationMatchesPath(
                          pathname,
                          destination,
                        );
                        const Icon = destination.icon;
                        return (
                          <SidebarMenuItem key={destination.id}>
                            <SidebarMenuButton
                              asChild
                              isActive={active}
                              tooltip={destination.label}
                            >
                              <Link
                                aria-current={active ? "page" : undefined}
                                href={destination.href}
                                prefetch={false}
                              >
                                <Icon />
                                <span>{destination.label}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ) : null}
            </nav>
          </SidebarContent>

          <SidebarFooter>
            <SidebarProfileMenu
              email={userEmail}
              organizationName={organizationName}
              roleName={resolvedRoleName}
            />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="h-svh min-h-0 overflow-hidden print:h-auto print:min-h-screen print:overflow-visible">
          <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear print:hidden">
            <div className="flex w-full min-w-0 items-center gap-2 px-4 lg:px-6">
              <SidebarTrigger className="-ml-1" />
              <Separator
                className="mx-1 data-[orientation=vertical]:h-4"
                orientation="vertical"
              />
              <div
                className="flex min-w-0 flex-1 items-center"
                id="workspace-page-tools"
              />
              {isSuperAdmin || resolvedPermissionKeys.size > 0 ? (
                <WorkspaceCommandPalette
                  isSuperAdmin={isSuperAdmin}
                  permissionKeys={[...resolvedPermissionKeys]}
                />
              ) : null}
              {organizationId && theme ? (
                <ThemeToggle
                  organizationId={organizationId}
                  theme={theme}
                  userId={userId}
                />
              ) : null}
            </div>
          </header>
          <div
            className="min-h-0 min-w-0 flex-1 overflow-y-auto print:overflow-visible"
            data-scroll-owner="application"
            data-slot="app-shell-content"
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function SidebarProfileMenu({
  email,
  organizationName,
  roleName,
}: {
  email?: string;
  organizationName: string;
  roleName: string;
}) {
  const label = email ?? organizationName;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent"
              size="lg"
              tooltip={label}
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {getInitials(label)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {roleName}
                </span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56"
            side="right"
            sideOffset={4}
          >
            <DropdownMenuLabel>
              <p className="truncate font-medium">{label}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {organizationName}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/account">
                <UserRound />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={signOutAction}>
              <DropdownMenuItem asChild variant="destructive">
                <button className="w-full" type="submit">
                  <LogOut />
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function getInitials(label: string) {
  const [first = "", second = ""] = label
    .replace(/@.*/, "")
    .split(/[.\s_-]+/)
    .filter(Boolean);
  return `${first[0] ?? "U"}${second[0] ?? ""}`.toUpperCase();
}
