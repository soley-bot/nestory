import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CardAction,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";

export function SettingsSectionHeader({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <>
      <CardTitle className="flex items-center gap-2 text-base">
        <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-3.5" />
        </span>
        <h2>{title}</h2>
      </CardTitle>
      <CardDescription className="max-w-2xl pl-9 text-sm leading-5">
        {description}
      </CardDescription>
      {action ? <CardAction>{action}</CardAction> : null}
    </>
  );
}
