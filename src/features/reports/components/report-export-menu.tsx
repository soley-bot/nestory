"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useFinancialWriteContext } from "@/lib/finance/financial-write-provider";
import { buildReportQueryParams } from "../reports.filters";
import type { ReportsViewQuery } from "../reports.types";

export function ReportExportMenu({viewQuery}: {viewQuery: ReportsViewQuery}) {
  // A changed report must not retain a previous report's pending download or error.
  const query = buildReportQueryParams(viewQuery).toString();
  return <ScopedReportExportMenu key={query} hrefs={{pdf: `/api/reports/pdf?${query}`, excel: `/api/reports/excel?${query}`}} />;
}

export function ReportBatchExportActions({pdfHref, excelHref, disabled}: {pdfHref: string; excelHref: string; disabled: boolean}) {
  return <ScopedReportExportMenu key={`${pdfHref}:${excelHref}`} hrefs={{pdf: pdfHref, excel: excelHref}} batch disabled={disabled} />;
}

function ScopedReportExportMenu({hrefs, batch = false, disabled = false}: {hrefs: Record<"pdf" | "excel", string>; batch?: boolean; disabled?: boolean}) {
  const session = useFinancialWriteContext();
  const [generation] = useState(session?.context.generation);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  const downloadUrls = useRef(new Map<string, number>());
  const [error, setError] = useState("");
  const [format, setFormat] = useState<"pdf" | "excel">("pdf");
  const router = useRouter();
  useEffect(() => {
    const urls = downloadUrls.current;
    return () => {
      inFlight.current?.abort();
      for (const [url, timer] of urls) {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);
  useEffect(() => {
    if (session?.invalid) inFlight.current?.abort();
  }, [session?.invalid]);
  function exportHref(format: "pdf" | "excel") {
    const [path, query] = hrefs[format].split("?");
    const params = new URLSearchParams(query);
    if (generation !== undefined) params.set("financialGeneration", String(generation));
    return `${path}?${params}`;
  }
  async function download(nextFormat: "pdf" | "excel" = format) {
    if (disabled || inFlight.current || session?.invalid) return;
    setOpen(false);
    const controller = new AbortController();
    inFlight.current = controller; setPending(true); setError(""); setFormat(nextFormat);
    try {
      const response = await fetch(exportHref(nextFormat), {cache: "no-store", signal: controller.signal});
      if (controller.signal.aborted) return;
      if (!response.ok) {
        const message = response.headers.get("content-type")?.includes("text/plain") ? await response.text() : "Report download could not be completed. Recheck the report and try again.";
        throw new Error(message.trim().slice(0, 500) || "Report download could not be completed. Recheck the report and try again.");
      }
      const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      const expectedType = batch ? "application/zip" : nextFormat === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (contentType !== expectedType) throw new Error("Your session may have expired. Recheck the report before downloading.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="([^"\r\n]+)"/)?.[1] ?? `report.${batch ? "zip" : nextFormat === "pdf" ? "pdf" : "xlsx"}`;
      try { document.body.append(link); link.click(); }
      catch (failure) { URL.revokeObjectURL(url); throw failure; }
      finally { link.remove(); }
      downloadUrls.current.set(url, window.setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.current.delete(url);
      }, 60_000));
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Download failed. Recheck the report and try again.");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return <div className="space-y-2">
    {batch ? <div className="flex flex-wrap items-center gap-2">
      {([["pdf", "Download PDFs"], ["excel", "Download Excel files"]] as const).map(([nextFormat, label]) => disabled || pending || session?.invalid
        ? <Button disabled key={nextFormat} size="sm" variant={nextFormat === "pdf" ? "default" : "outline"}><Download aria-hidden="true" />{pending && format === nextFormat ? "Preparing download..." : label}</Button>
        : <Button asChild key={nextFormat} size="sm" variant={nextFormat === "pdf" ? "default" : "outline"}><a href={exportHref(nextFormat)} onClick={event => { event.preventDefault(); void download(nextFormat); }}><Download aria-hidden="true" />{label}</a></Button>)}
    </div> : <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={pending || session?.invalid}><Download />{pending ? "Preparing download..." : "Export"}<ChevronDown /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><a href={exportHref("pdf")} onClick={event => { event.preventDefault(); void download("pdf"); }}>PDF report</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href={exportHref("excel")} onClick={event => { event.preventDefault(); void download("excel"); }}>Excel workbook</a></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>}
    {error ? <div role="alert" className="max-w-lg space-y-1 text-sm"><p>{error}</p><Button type="button" size="sm" variant="outline" onClick={() => router.refresh()}>Recheck report</Button> <Button type="button" size="sm" variant="outline" onClick={() => void download()} disabled={pending}>Retry download</Button></div> : null}
  </div>;
}
