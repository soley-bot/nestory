"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type TableProps = React.ComponentProps<"table"> & {
  scrollRegionLabel?: string
  /** Feature-owned mobile composition. Keep key values/actions visible here;
   * the complete table remains available through View all columns. */
  mobileContent?: React.ReactNode
}

function Table({ className, scrollRegionLabel, mobileContent, ...props }: TableProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const hintId = React.useId()
  const viewportId = React.useId()
  const [showAllColumns, setShowAllColumns] = React.useState(false)
  const [scrollState, setScrollState] = React.useState({ overflow: false, atStart: true, atEnd: true })
  const measure = React.useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const position = Math.abs(container.scrollLeft)
    const next = {
      overflow: container.scrollWidth > container.clientWidth + 1,
      atStart: position < 1,
      atEnd: position + container.clientWidth >= container.scrollWidth - 1,
    }
    setScrollState(previous => previous.overflow === next.overflow && previous.atStart === next.atStart && previous.atEnd === next.atEnd ? previous : next)
  }, [])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return
    measure()
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure)
    observer?.observe(container)
    const table = container.querySelector("table")
    if (table) observer?.observe(table)
    window.addEventListener("resize", measure)
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure) }
  }, [measure])

  function scrollToEdge(last: boolean) {
    const container = containerRef.current
    if (!container) return
    const direction = getComputedStyle(container).direction === "rtl" ? -1 : 1
    container.scrollTo({ left: last ? direction * container.scrollWidth : 0, behavior: "auto" })
    measure()
  }

  return (
    <>
      {mobileContent ? <div className="md:hidden print:hidden">
        {!showAllColumns ? mobileContent : null}
        <div className="px-3 py-2">
          <Button aria-expanded={showAllColumns} aria-controls={viewportId} onClick={() => setShowAllColumns(value => !value)} type="button" variant="outline">
            {showAllColumns ? "Use compact view" : "View all columns"}
          </Button>
        </div>
      </div> : null}
        {scrollState.overflow ? <div className={cn("flex flex-wrap items-center justify-between gap-2 bg-muted/50 px-3 py-2 print:hidden", mobileContent && !showAllColumns && "hidden md:flex")} data-slot="table-scroll-controls">
          <p className="text-sm text-muted-foreground" id={hintId}>More columns — scroll to see the full table</p>
          <div className="flex flex-wrap gap-2">
            <Button aria-controls={viewportId} aria-label={`Show first columns of ${scrollRegionLabel ?? "table"}`} aria-disabled={scrollState.atStart} className="aria-disabled:bg-muted aria-disabled:text-muted-foreground" onClick={() => { if (!scrollState.atStart) scrollToEdge(false) }} type="button" variant="outline">← First columns</Button>
            <Button aria-controls={viewportId} aria-label={`Show last columns of ${scrollRegionLabel ?? "table"}`} aria-disabled={scrollState.atEnd} className="aria-disabled:bg-muted aria-disabled:text-muted-foreground" onClick={() => { if (!scrollState.atEnd) scrollToEdge(true) }} type="button" variant="outline">Last columns →</Button>
          </div>
        </div> : null}
        <div
      aria-label={scrollRegionLabel}
      aria-describedby={scrollState.overflow ? hintId : undefined}
      data-slot="table-container"
      id={viewportId}
      ref={containerRef}
      onScroll={measure}
      className={cn("relative min-w-0 w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring", mobileContent && !showAllColumns && "hidden md:block print:block")}
      role={scrollRegionLabel ? "region" : undefined}
      tabIndex={scrollRegionLabel ? 0 : undefined}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
        </div>
    </>
  )
}

type TableHeaderProps = React.ComponentProps<"thead"> & {
  /** Pins the header while the body scrolls. Register tables want this. */
  sticky?: boolean
}

function TableHeader({ className, sticky, ...props }: TableHeaderProps) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "bg-[var(--table-header-bg)] [&_tr]:border-b",
        sticky && "sticky top-0 z-10 shadow-[0_1px_0_var(--border)]",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-[var(--table-row-hover)] has-aria-expanded:bg-[var(--table-row-hover)] data-[state=selected]:bg-[var(--table-row-selected)]",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
