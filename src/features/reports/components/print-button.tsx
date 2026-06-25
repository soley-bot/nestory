"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button
      className="h-8 border-border bg-surface px-2.5 text-[13px] text-foreground hover:bg-surface-muted print:hidden"
      onClick={() => window.print()}
      title="Print report"
      type="button"
    >
      <Printer size={14} />
      Print / PDF
    </Button>
  );
}
