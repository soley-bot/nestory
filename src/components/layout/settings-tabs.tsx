import Link from "next/link";
import { cn } from "@/lib/utils";

const settingsTabs = [
  { href: "/settings", label: "Workspace" },
  { href: "/users-roles", label: "Users & Roles" },
];

export function SettingsTabs({ activeHref }: { activeHref: string }) {
  const activeIndex = settingsTabs.findIndex((tab) => tab.href === activeHref);

  return (
    <nav
      aria-label="Settings sections"
      className="border-b border-border bg-surface px-4 sm:px-6 lg:px-6"
    >
      <div className="flex gap-1 overflow-x-auto py-2">
        {settingsTabs.map((tab, index) => {
          const active = index === (activeIndex === -1 ? 0 : activeIndex);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center rounded-md px-3 text-[13px] font-medium text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring",
                active && "bg-accent-soft text-foreground",
              )}
              href={tab.href}
              key={tab.href}
              prefetch={false}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
