"use client";

import type { ComponentProps } from "react";
import { DraftActionBar } from "@/components/ui/draft-action-bar";

type SettingsSaveBarProps = ComponentProps<typeof DraftActionBar>;

export function SettingsSaveBar(props: SettingsSaveBarProps) {
  if (props.status === "clean") return null;

  return (
    <div
      className="sticky bottom-0 z-10 border-t bg-popover/95 shadow-[0_-10px_24px_-20px_rgb(0_0_0/0.55)] backdrop-blur"
      data-testid="settings-save-bar"
    >
      <DraftActionBar {...props} />
    </div>
  );
}
