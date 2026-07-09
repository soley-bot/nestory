import Link from "next/link";
import { cn } from "@/lib/utils";

const settingsTabs = [
  { href: "/settings", label: "Organization" },
  { href: "/users-roles", label: "Users & Roles" },
];

export function SettingsTabs({ activeHref }: { activeHref: string }) {
  return (
    <nav
      aria-label="Settings sections"
      className="border-b border-border bg-surface px-4 sm:px-6 lg:px-6"
    >
      <div className="flex gap-1 overflow-x-auto py-2">
        {settingsTabs.map((tab) => {
          const active = activeHref === tab.href;

          return (
            <Link
              className={cn(
                "flex h-8 shrink-0 items-center rounded-md px-3 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
                active && "bg-surface-muted text-foreground",
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
