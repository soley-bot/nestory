"use client";

import dynamic from "next/dynamic";
import { useState, type ComponentProps } from "react";

const DatePickerField = dynamic(
  () => import("@/components/ui/date-picker-field").then(module => module.DatePickerField),
  { ssr: false },
);

export function MaintenanceDateField(props: ComponentProps<typeof DatePickerField>) {
  const [value, setValue] = useState(props.defaultValue ?? "");
  return <>
    {/* Keep the submitted value mounted while the calendar component loads. */}
    <input name={props.name} type="hidden" value={value} />
    <DatePickerField {...props} name="" onValueChange={(next) => { setValue(next); props.onValueChange?.(next); }} />
  </>;
}
