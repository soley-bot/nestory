import type { ReactNode } from "react";
import {
  CardAction,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";

export function SettingsSectionHeader({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <>
      <CardTitle className="text-base">
        <h2>{title}</h2>
      </CardTitle>
      <CardDescription className="max-w-2xl text-sm leading-5">
        {description}
      </CardDescription>
      {action ? <CardAction>{action}</CardAction> : null}
    </>
  );
}
