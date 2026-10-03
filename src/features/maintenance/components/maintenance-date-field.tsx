"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";

const DatePickerField = dynamic(
  () => import("@/components/ui/date-picker-field").then(module => module.DatePickerField),
  { ssr: false, loading: LoadingDateControl },
);

export function MaintenanceDateField(props: ComponentProps<typeof DatePickerField>) {
  const [value, setValue] = useState(props.defaultValue ?? "");
  return <div data-maintenance-date-field>
    {/* Keep the submitted value mounted while the calendar component loads. */}
    <input name={props.name} type="hidden" value={value} />
    <DatePickerField {...props} name="" onValueChange={(next) => { setValue(next); props.onValueChange?.(next); }} />
  </div>;
}

function LoadingDateControl() {
  const controlRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const control = controlRef.current;
    return () => {
      if (!control || document.activeElement !== control) return;
      const field = control.closest("[data-maintenance-date-field]");
      const dialog = control.closest('[role="dialog"]');
      requestAnimationFrame(() => {
        if (!field?.isConnected) return;
        // The drawer focus trap temporarily focuses its dialog when this control is removed.
        if (document.activeElement !== document.body && document.activeElement !== dialog) return;
        field.querySelector<HTMLButtonElement>("button")?.focus();
      });
    };
  }, []);

  return (
    <button
      aria-busy="true"
      className="flex h-8 w-full items-center rounded-md border border-input bg-card px-2.5 text-left text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      ref={controlRef}
      tabIndex={-1}
      type="button"
    >
      Loading date…
    </button>
  );
}
