"use client";

import { Popover } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HelpTerm({ term, meaning }: { term: string; meaning: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={`Explain ${term}`}
          className="inline-flex min-h-11 items-center rounded-sm underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8"
          type="button"
        >
          {term}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label={`${term} explained`}
          className="z-[80] w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-4 pr-14 text-sm text-popover-foreground shadow-lg"
          collisionPadding={16}
          sideOffset={4}
        >
          <p className="font-semibold">{term}</p>
          <p className="mt-2 leading-6 text-muted-foreground">{meaning}</p>
          <Popover.Close asChild>
            <Button aria-label="Close explanation" className="absolute right-1 top-1 min-h-11 min-w-11" size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button>
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
