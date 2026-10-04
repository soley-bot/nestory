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
      <CardTitle className="col-span-full min-w-0 text-base [overflow-wrap:anywhere] sm:col-span-1">
        <h2>{title}</h2>
      </CardTitle>
      <CardDescription className="col-span-full min-w-0 max-w-2xl text-sm leading-5 [overflow-wrap:anywhere] sm:col-span-1">
        {description}
      </CardDescription>
      {action ? <CardAction className="col-span-full col-start-1 row-span-1 row-start-3 justify-self-start sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end">{action}</CardAction> : null}
    </>
  );
}
