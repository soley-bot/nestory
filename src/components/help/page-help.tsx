"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, CircleHelp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { getPageHelp, type PageHelpContent } from "./page-help-content";

export type { PageHelpContent } from "./page-help-content";

export function PageHelp({ content }: { content?: PageHelpContent | false }) {
  const pathname = usePathname();
  const resolvedContent = content === false ? undefined : content ?? getPageHelp(pathname);
  if (!resolvedContent) return null;
  return <PageHelpPanel content={resolvedContent} key={`${pathname}:${resolvedContent.title}`} />;
}

function PageHelpPanel({ content }: { content: PageHelpContent }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(content);
  const mobile = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  function selectTopic(next: PageHelpContent) {
    setTopic(next);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    titleRef.current?.focus();
  }

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button className="min-h-11 gap-1.5 text-muted-foreground md:min-h-8" type="button" variant="ghost">
          <CircleHelp aria-hidden="true" size={16} />
          Help with this page
        </Button>
      </SheetTrigger>
      <SheetContent
        className={mobile ? "max-h-[90dvh] rounded-t-xl" : "w-[26rem] max-w-[calc(100vw-2rem)] sm:max-w-[26rem]"}
        onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }}
        showCloseButton={false}
        side={mobile ? "bottom" : "right"}
      >
        <SheetHeader className="shrink-0 border-b border-border p-5 pr-16">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Help with this page</p>
          <SheetTitle className="text-lg outline-none" ref={titleRef} tabIndex={-1}>{topic.title}</SheetTitle>
          <SheetDescription className="mt-2 leading-6">{topic.purpose}</SheetDescription>
        </SheetHeader>
        <SheetClose asChild>
          <Button aria-label="Close page help" className="absolute right-3 top-3 min-h-11 min-w-11" size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button>
        </SheetClose>
        <div className="min-h-0 space-y-6 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]" ref={bodyRef}>
          <section aria-label="Three steps">
            <h3 className="mb-3 font-semibold">How to use this page</h3>
            <ol className="space-y-3">
              {topic.steps.map((step, index) => <li className="flex gap-3 leading-6" key={step}><span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{index + 1}</span><span>{step}</span></li>)}
            </ol>
          </section>
          <section className="border-l-2 border-primary/40 pl-4" aria-label="Example">
            <h3 className="mb-1 font-semibold">Example</h3>
            <p className="leading-6 text-muted-foreground">{topic.example}</p>
          </section>
          <section aria-label="Common questions">
            <h3 className="mb-2 font-semibold">Common questions</h3>
            {topic.questions.map(({ question, answer }) => <HelpExplanation key={question} label={question} text={answer} />)}
          </section>
          {topic.terms?.length ? <section aria-label="Terms explained"><h3 className="mb-2 font-semibold">Terms explained</h3>{topic.terms.map(({ term, meaning }) => <HelpExplanation key={term} label={term} text={meaning} />)}</section> : null}
          {content.related?.length ? <nav aria-label="Related help" className="border-t border-border pt-3"><p className="mb-1 font-semibold">Related help</p>{[content, ...content.related].map((item) => <Button aria-pressed={topic === item} className="mr-1 min-h-11" key={item.title} onClick={() => selectTopic(item)} type="button" variant="ghost">{item.title}</Button>)}</nav> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function HelpExplanation({ label, text }: { label: string; text: string }) {
  return <details className="group border-b border-border py-1"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm py-2 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}<ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary><p className="pb-3 leading-6 text-muted-foreground">{text}</p></details>;
}
