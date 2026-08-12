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
} from "@/components/ui/sidebar";
import { signOutAction } from "@/features/auth/actions";
import { formatWorkspaceAccessRole } from "@/features/organization/access-status";
import type { WorkspaceRole } from "@/lib/auth/context";
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

const FINANCE_CHILDREN = [
  { href: "/finance", label: "Finance work", routes: ["/finance"] },
  { href: "/rent-income", label: "Rent", routes: ["/rent-income"] },
  { href: "/bills-expenses", label: "Expenses", routes: ["/bills-expenses"] },
  { href: "/balances", label: "Owner balances", routes: ["/balances"] },
  { href: "/leases", label: "Leases", routes: ["/leases"] },
  { href: "/ledger", label: "Ledger", routes: ["/ledger"] },
  { href: "/petty-cash", label: "Petty cash", routes: ["/petty-cash"] },
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
    label: "Overview",
    routes: ["/overview"],
  },
  {
    id: "properties",
    href: "/properties",
    icon: Building2,
    label: "Properties",
    routes: ["/properties", "/units"],
  },
  {
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
      "/rent-income",
      "/bills-expenses",
      "/leases",
      "/ledger",
      "/petty-cash",
      "/finance",
      "/balances",
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
    routes: ["/settings", "/users-roles", "/account"],
  },
] satisfies readonly GlobalDestination[];

const FINANCE_GLOBAL_DESTINATIONS = ADMIN_GLOBAL_DESTINATIONS.filter(
  (destination) => destination.id === "finance",
);

type AppShellProps = {
  children: React.ReactNode;
  /** Resolved from the sidebar_state cookie so a collapsed rail stays collapsed. */
  defaultSidebarOpen?: boolean;
  organizationId?: string;
  organizationName?: string;
  role?: WorkspaceRole;
  theme?: OrganizationTheme;
  userEmail?: string;
};

function getGlobalDestinations(
  role: WorkspaceRole,
): readonly GlobalDestination[] {
  if (role === "super_admin") return ADMIN_GLOBAL_DESTINATIONS;
  if (role === "finance_manager" || role === "finance_member") {
    return FINANCE_GLOBAL_DESTINATIONS;
  }

  return [
    {
      children:
        role === "operations_manager"
          ? MAINTENANCE_CHILDREN
          : [MAINTENANCE_CHILDREN[1]],
      id: "maintenance",
      href: role === "operations_manager" ? "/maintenance" : "/tasks",
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
  const Icon = destination.icon;

  // Open the domain the operator navigated into, without closing the ones they
  // opened by hand. Adjusting state during render is React's documented answer
  // for deriving from a changed prop; remounting on every pathname change (the
  // previous approach) discarded the operator's choice instead.
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setExpanded(true);
  }

  return (
    <Collapsible asChild onOpenChange={setExpanded} open={expanded}>
      <SidebarMenuItem>
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
            <span className="sr-only">{active ? "Current: " : ""}</span>
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
  role = "super_admin",
  theme,
  userEmail,
}: AppShellProps) {
  const pathname = usePathname();
  const destinations = getGlobalDestinations(role);
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
                  <Link href={getWorkspaceEntryPath(role)} prefetch={false}>
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
                  {role === "super_admin" ? (
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
                              <span className="sr-only">
                                {active ? "Current: " : ""}
                              </span>
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
                                <span className="sr-only">
                                  {active ? "Current: " : ""}
                                </span>
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
              role={role}
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
              <WorkspaceCommandPalette role={role} />
              {role === "super_admin" && organizationId && theme ? (
                <ThemeToggle organizationId={organizationId} theme={theme} />
              ) : null}
            </div>
          </header>
          <div
            className="min-h-0 min-w-0 flex-1 overflow-y-auto print:overflow-visible"
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
  role,
}: {
  email?: string;
  organizationName: string;
  role: WorkspaceRole;
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
                  {formatWorkspaceAccessRole(role)}
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
