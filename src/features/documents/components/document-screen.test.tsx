/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentScreen } from "@/features/documents/components/document-screen";
import type {
  DocumentSummary,
  DocumentViewQuery,
} from "@/features/documents/document.types";

const navigation = vi.hoisted(() => ({
  pathname: "/documents",
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams();
  installMatchMedia(1440);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DocumentScreen workspace contract", () => {
  it("keeps documents dense, selected, directly linked, metadata-rich, and docked at 1280+", () => {
    const { container } = renderDocuments();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(screen.getByRole("toolbar", { name: "Workspace tools" })).not.toBeNull();
    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(
      within(rows[0]!).getByRole("link", { name: "lease.pdf" }).getAttribute("href"),
    ).toBe("/documents?archiveState=all&documentId=document-1");
    expect(within(rows[0]!).getByText("PDF")).not.toBeNull();
    expect(within(rows[0]!).getByText("2 KB")).not.toBeNull();
    expect(within(rows[0]!).getByText("Property")).not.toBeNull();
    expect(within(rows[0]!).getByText("10 Jul 2026")).not.toBeNull();
    expect(within(rows[0]!).getByRole("button", { name: "Preview lease.pdf" })).not.toBeNull();

    const inspector = screen.getByRole("complementary", {
      name: "lease.pdf document inspector",
    });
    const open = within(inspector).getByRole("link", { name: "Open file" });
    expect(open.getAttribute("href")).toBe("https://example.test/lease.pdf?token=private");
    expect(open.getAttribute("target")).toBe("_blank");
    expect(open.getAttribute("rel")).toBe("noreferrer");
    expect(within(inspector).getAllByRole("link", { name: "Open file" })).toHaveLength(1);
    expect(within(inspector).queryByRole("link", { name: "Download file" })).toBeNull();
    expect(within(inspector).getByRole("link", { name: "HOME / Home" })).not.toBeNull();
    expect(screen.queryByText(/select a document/i)).toBeNull();
  });

  it("keeps nested direct links independent while row keys and Preview select one document", () => {
    renderDocuments(documents, { propertyId: "property-1" });
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const secondLink = within(rows[1]!).getByRole("link", { name: "photo.jpg" });
    const secondPreview = within(rows[1]!).getByRole("button", {
      name: "Preview photo.jpg",
    });

    expect(fireEvent.keyDown(secondLink, { key: "Enter" })).toBe(true);
    expect(rows[0]!.getAttribute("aria-selected")).toBe("true");
    expect(rows[1]!.getAttribute("aria-selected")).toBe("false");
    fireEvent.keyDown(rows[1]!, { key: "Enter" });
    expect(rows[1]!.getAttribute("aria-selected")).toBe("true");
    expect(secondPreview.getAttribute("aria-pressed")).toBe("true");
  });

  it.each([1024, 390])(
    "opens Preview deliberately at %ipx and replaces it with one edit drawer",
    async (width) => {
      installMatchMedia(width);
      const user = userEvent.setup();
      renderDocuments();
      const preview = screen.getByRole("button", { name: "Preview lease.pdf" });

      expect(screen.queryByRole("dialog")).toBeNull();
      await user.click(preview);
      expect(screen.getByRole("dialog", { name: "lease.pdf document inspector" })).not.toBeNull();
      await user.click(screen.getByRole("button", { name: "Edit document" }));
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: "Edit document" })).not.toBeNull();

      await user.click(screen.getByRole("button", { name: "Close drawer" }));
      expect(document.activeElement).toBe(preview);
    },
  );

  it("selects a canonical document link without auto-opening compact Preview", () => {
    installMatchMedia(390);
    renderDocuments(documents, {}, "document-2");

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows[1]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows file limits and linking scope only inside upload or edit actions", async () => {
    const user = userEvent.setup();
    renderDocuments(documents, { propertyId: "property-1" });

    expect(screen.queryByRole("region", { name: "Document link and file limits" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Upload document" }));
    const consequence = screen.getByRole("region", { name: "Document link and file limits" });
    expect(consequence.textContent).toContain("PDF, JPG, PNG, or WebP up to 10 MB");
    expect(consequence.textContent).toContain("HOME / Home");
    expect((document.querySelector('input[name="propertyId"]') as HTMLInputElement | null)?.value ?? (document.querySelector('select[name="propertyId"]') as HTMLSelectElement).value).toBe("property-1");
    const fileInput = document.querySelector('input[name="document"]') as HTMLInputElement;
    await user.upload(
      fileInput,
      new File(["agreement"], "lease-agreement.pdf", { type: "application/pdf" }),
    );
    expect(screen.getByText("lease-agreement.pdf")).not.toBeNull();
  });

  it("does not invent an unsafe file action when no signed URL is available", () => {
    renderDocuments([makeDocument("document-unavailable", "missing.pdf", { url: undefined })]);
    const inspector = screen.getByRole("complementary", {
      name: "missing.pdf document inspector",
    });

    expect(within(inspector).queryByRole("link", { name: "Open file" })).toBeNull();
    expect(within(inspector).queryByRole("link", { name: "Download file" })).toBeNull();
    expect(within(inspector).queryByRole("link", { name: "Open document record" })).toBeNull();
  });

  it("distinguishes filtered-empty from a true-empty document library", () => {
    const filtered = renderDocuments([], { query: "missing" });
    const filteredState = screen.getByText("No matching documents").closest("section")!;
    expect(filteredState.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(filteredState).getByRole("link", { name: "Clear filters" }).getAttribute("href"),
    ).toBe("/documents");
    filtered.unmount();

    renderDocuments([]);
    const emptyState = screen.getByText("No documents yet").closest("section")!;
    expect(emptyState.getAttribute("data-kind")).toBe("empty");
    expect(within(emptyState).queryByRole("button", { name: "Upload document" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Upload document" })).toHaveLength(1);
  });

  it("keeps search and link-scope filters URL-backed", async () => {
    navigation.searchParams = new URLSearchParams(
      "propertyId=property-1&leaseId=lease-1&page=2&documentId=document-1",
    );
    const user = userEvent.setup();
    renderDocuments([], { leaseId: "lease-1", propertyId: "property-1" });

    const search = screen.getByRole("textbox", { name: "Search documents" });
    await user.clear(search);
    await user.type(search, "lease");
    await user.click(screen.getByRole("button", { name: "Search documents" }));

    expect(navigation.replace).toHaveBeenCalledWith(
      "/documents?propertyId=property-1&query=lease",
      { scroll: false },
    );
  });
});

const defaultViewQuery: DocumentViewQuery = {
  archiveState: "active",
  documentId: "all",
  leaseId: "all",
  page: 1,
  pageSize: 50,
  propertyId: "all",
  query: "",
  taskId: "all",
  unitId: "all",
};

const documents = [makeDocument("document-1", "lease.pdf"), makeDocument("document-2", "photo.jpg", { mimeType: "image/jpeg" })];

function renderDocuments(
  nextDocuments: DocumentSummary[] = documents,
  query: Partial<DocumentViewQuery> = {},
  initialDocumentId?: string,
) {
  return render(
    <DocumentScreen
      documents={nextDocuments}
      initialDocumentId={initialDocumentId}
      pagination={{
        from: nextDocuments.length ? 1 : 0,
        page: 1,
        pageSize: 50,
        to: nextDocuments.length,
        totalCount: nextDocuments.length,
        totalPages: nextDocuments.length ? 1 : 0,
      }}
      propertyOptions={[{ id: "property-1", label: "HOME / Home" }]}
      unitOptions={[{ id: "unit-1", label: "HOME / Unit 1A", propertyId: "property-1" }]}
      viewQuery={{ ...defaultViewQuery, ...query }}
    />,
  );
}

function makeDocument(
  id: string,
  fileName: string,
  options: { mimeType?: string; url?: string } = {},
): DocumentSummary {
  const hasUrl = Object.prototype.hasOwnProperty.call(options, "url")
    ? options.url
    : `https://example.test/${fileName}?token=private`;

  return {
    activity: [],
    category: "Lease",
    fileName,
    formValues: {
      category: "Lease",
      propertyId: "property-1",
      unitId: "unit-1",
    },
    hrefs: {
      document: `/documents?archiveState=all&documentId=${id}`,
      property: "/properties/property-1",
      unit: "/units/unit-1",
    },
    id,
    isArchived: false,
    linkedRecords: [
      { href: "/properties/property-1", label: "HOME / Home", type: "Property" },
      { href: "/units/unit-1", label: "Unit 1A", type: "Unit" },
    ],
    mimeType: options.mimeType ?? "application/pdf",
    nextAction: {
      description: "Open the file",
      href: hasUrl ?? `/documents?archiveState=all&documentId=${id}`,
      label: "Review file",
      tone: "neutral",
    },
    riskIndicators: [],
    sizeBytes: 2048,
    storagePath: `property-1/${fileName}`,
    uploadedAt: "2026-07-10T00:00:00.000Z",
    url: hasUrl,
  };
}

function installMatchMedia(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => {
      const minWidth = Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
      return {
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: width >= minWidth,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      };
    }),
  });
}
