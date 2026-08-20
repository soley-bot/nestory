import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import {
  downloadTenantCommercialDocumentArtifact,
  markReceiptPublicationFailed,
  publishTenantInvoiceArtifact,
  publishTenantReceiptArtifact,
} from "@/features/finance-operations/documents/commercial-document-artifacts";

vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

const organizationId = "10000000-0000-4000-8000-000000000001";
const actorId = "20000000-0000-4000-8000-000000000001";
const invoiceId = "30000000-0000-4000-8000-000000000001";
const paymentId = "40000000-0000-4000-8000-000000000001";
const artifactId = "50000000-0000-4000-8000-000000000001";
const objectId = "60000000-0000-4000-8000-000000000001";
const replacementObjectId = "60000000-0000-4000-8000-000000000002";
const claimId = "70000000-0000-4000-8000-000000000001";
const invoicePath =
  `${organizationId}/invoice/${invoiceId}/INV-2026-0042.pdf`;
const invoiceObjectVersion = "tenant-commercial-document-v1-invoice-current";
const publicationInput = {
  contactEmail: "billing@ips.example",
  contactPhone: "+855 12 345 678",
  note: "Include the Invoice number with payment.",
  paymentInstructions: "Bank transfer to IPS operating account 001-9182.",
};

beforeEach(() => {
  vi.mocked(createSupabaseAdminClient).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("commercial document artifact publication", () => {
  it("publishes exact rendered Invoice bytes to the stable server-derived path and attests before authenticated registration", async () => {
    const harness = artifactHarness();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    const result = await publishTenantInvoiceArtifact({
      client: harness.client as unknown as SupabaseClient<Database>,
      invoiceId,
      organizationId,
      publicationInput,
    });

    expect(result).toEqual({
      artifactId,
      documentNumber: "INV / 2026 #0042",
      href: `/api/finance/documents/${artifactId}`,
    });
    expect(Object.keys(result).sort()).toEqual([
      "artifactId",
      "documentNumber",
      "href",
    ]);
    expect(JSON.stringify(result)).not.toContain("service-role-secret");
    expect(JSON.stringify(result)).not.toContain("admin-client-sentinel");

    const upload = onlyEvent(harness.events, "storage.upload");
    expect(upload.path).toBe(invoicePath);
    expect(upload.options).toEqual({
      cacheControl: "31536000",
      contentType: "application/pdf",
      upsert: false,
    });
    const uploadedBytes = upload.bytes as Uint8Array;
    expect(Buffer.from(uploadedBytes).subarray(0, 8).toString("latin1")).toBe(
      "%PDF-1.4",
    );
    const expectedHash = createHash("sha256")
      .update(uploadedBytes)
      .digest("hex");

    expect(onlyEvent(harness.events, "admin.attest").args).toEqual({
      p_actor_id: actorId,
      p_organization_id: organizationId,
      p_presentation_snapshot: expectedInvoiceSnapshot(),
      p_renderer_version: "commercial-pdf-v1",
      p_sha256: expectedHash,
      p_size_bytes: uploadedBytes.byteLength,
      p_source_id: invoiceId,
      p_source_kind: "invoice",
      p_storage_object_id: objectId,
      p_storage_object_version: invoiceObjectVersion,
      p_storage_path: invoicePath,
    });
    expect(onlyEvent(harness.events, "client.register").args).toEqual({
      p_document_number: "INV / 2026 #0042",
      p_organization_id: organizationId,
      p_presentation_snapshot: expectedInvoiceSnapshot(),
      p_renderer_version: "commercial-pdf-v1",
      p_sha256: expectedHash,
      p_size_bytes: uploadedBytes.byteLength,
      p_source_id: invoiceId,
      p_source_kind: "invoice",
      p_storage_path: invoicePath,
    });
    expect(indexOfEvent(harness.events, "storage.download")).toBeGreaterThan(
      indexOfEvent(harness.events, "storage.upload"),
    );
    expect(indexOfEvent(harness.events, "object.read")).toBeGreaterThan(
      indexOfEvent(harness.events, "storage.download"),
    );
    expect(indexOfEvent(harness.events, "admin.attest")).toBeGreaterThan(
      indexOfEvent(harness.events, "object.read"),
    );
    expect(indexOfEvent(harness.events, "client.register")).toBeGreaterThan(
      indexOfEvent(harness.events, "admin.attest"),
    );
  });

  it("publishes a Receipt from the authoritative payment source without accepting Invoice publication input", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T09:15:00.000Z"));
    const receiptPath =
      `${organizationId}/receipt/${paymentId}/RCT-2026-0018.pdf`;
    const harness = artifactHarness({
      sourceResponses: [receiptSource()],
      storageObject: storageObject({
        id: objectId,
        version: "tenant-commercial-document-v1-receipt-current",
      }),
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    const result = await publishTenantReceiptArtifact({
      client: harness.client as unknown as SupabaseClient<Database>,
      organizationId,
      paymentId,
    });

    expect(result).toEqual({
      artifactId,
      documentNumber: "RCT / 2026 #0018",
      href: `/api/finance/documents/${artifactId}`,
    });
    expect(onlyEvent(harness.events, "storage.upload")).toMatchObject({
      path: receiptPath,
      options: {
        cacheControl: "31536000",
        contentType: "application/pdf",
        upsert: false,
      },
    });
    expect(onlyEvent(harness.events, "admin.attest").args).toMatchObject({
      p_actor_id: actorId,
      p_organization_id: organizationId,
      p_presentation_snapshot: expectedReceiptSnapshot(),
      p_renderer_version: "commercial-pdf-v1",
      p_source_id: paymentId,
      p_source_kind: "receipt",
      p_storage_object_id: objectId,
      p_storage_object_version:
        "tenant-commercial-document-v1-receipt-current",
      p_storage_path: receiptPath,
    });
  });

  it("returns an already registered artifact idempotently without touching the admin boundary", async () => {
    const existing = publishedArtifact();
    const harness = artifactHarness({
      sourceResponses: [invoiceSource({ artifact: existing })],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    const result = await publishTenantInvoiceArtifact({
      client: harness.client as unknown as SupabaseClient<Database>,
      invoiceId,
      organizationId,
      publicationInput,
    });

    expect(result).toEqual({
      artifactId,
      documentNumber: "INV / 2026 #0042",
      href: `/api/finance/documents/${artifactId}`,
    });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(eventNames(harness.events)).toEqual(["client.source"]);
  });

  it("returns the immutable artifact document number when the current authoritative source number diverges", async () => {
    const harness = artifactHarness({
      sourceResponses: [
        invoiceSource({
          artifact: publishedArtifact(),
          document_number: "INV / 2026 #0099",
        }),
      ],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    const result = await publishTenantInvoiceArtifact({
      client: harness.client as unknown as SupabaseClient<Database>,
      invoiceId,
      organizationId,
      publicationInput,
    });

    expect(result).toEqual({
      artifactId,
      documentNumber: "INV / 2026 #0042",
      href: `/api/finance/documents/${artifactId}`,
    });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("fails closed when retained bytes differ from the exact bytes that were hashed and uploaded", async () => {
    const harness = artifactHarness({
      beginResponses: [{ data: claimId, error: null }],
      currentObjects: [
        storageObject(),
        storageObject(),
        storageObject(),
      ],
      downloadResponses: [
        {
          data: new Blob([Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x00])]),
          error: null,
        },
      ],
      finishResponses: [{ data: true, error: null }],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      publishTenantInvoiceArtifact({
        client: harness.client as unknown as SupabaseClient<Database>,
        invoiceId,
        organizationId,
        publicationInput,
      }),
    ).rejects.toThrow("Tenant Invoice PDF retained-byte verification failed.");

    expect(eventsOf(harness.events, "admin.attest")).toHaveLength(0);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(1);
  });

  it("normalizes a retained-download promise throw and routes the fresh exact upload through guarded cleanup", async () => {
    const harness = artifactHarness({
      beginResponses: [{ data: claimId, error: null }],
      currentObjects: [storageObject(), storageObject(), storageObject()],
      downloadResponses: [
        new Error("provider download timeout with service-role-secret"),
      ],
      finishResponses: [{ data: true, error: null }],
      sourceResponses: [invoiceSource(), invoiceSource()],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      publishTenantInvoiceArtifact({
        client: harness.client as unknown as SupabaseClient<Database>,
        invoiceId,
        organizationId,
        publicationInput,
      }),
    ).rejects.toThrow("Tenant Invoice PDF retained-byte verification failed.");

    expect(eventsOf(harness.events, "admin.attest")).toHaveLength(0);
    expect(eventsOf(harness.events, "admin.begin")).toHaveLength(1);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(1);
    expect(eventsOf(harness.events, "admin.finish")).toHaveLength(1);
  });

  it("normalizes a retained Blob read throw and routes the fresh exact upload through guarded cleanup", async () => {
    const harness = artifactHarness({
      beginResponses: [{ data: claimId, error: null }],
      currentObjects: [storageObject(), storageObject(), storageObject()],
      downloadResponses: [
        {
          data: rejectingBlob("provider Blob read failed with private details"),
          error: null,
        },
      ],
      finishResponses: [{ data: true, error: null }],
      sourceResponses: [invoiceSource(), invoiceSource()],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      publishTenantInvoiceArtifact({
        client: harness.client as unknown as SupabaseClient<Database>,
        invoiceId,
        organizationId,
        publicationInput,
      }),
    ).rejects.toThrow("Tenant Invoice PDF retained-byte verification failed.");

    expect(eventsOf(harness.events, "admin.attest")).toHaveLength(0);
    expect(eventsOf(harness.events, "admin.begin")).toHaveLength(1);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(1);
    expect(eventsOf(harness.events, "admin.finish")).toHaveLength(1);
  });

  it("preserves a fresh upload when retained verification fails and exact cleanup identity info times out", async () => {
    const harness = artifactHarness({
      currentObjects: [new Error("provider info timeout with private details")],
      downloadResponses: [
        {
          data: new Blob([Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x00])]),
          error: null,
        },
      ],
      sourceResponses: [invoiceSource(), invoiceSource()],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      publishTenantInvoiceArtifact({
        client: harness.client as unknown as SupabaseClient<Database>,
        invoiceId,
        organizationId,
        publicationInput,
      }),
    ).rejects.toThrow("Tenant Invoice PDF publication requires operator review.");

    expect(eventsOf(harness.events, "admin.attest")).toHaveLength(0);
    expect(eventsOf(harness.events, "admin.begin")).toHaveLength(0);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(0);
    expect(eventsOf(harness.events, "admin.finish")).toHaveLength(0);
  });

  it("preserves a same-path replacement when info identity differs from the successful upload id", async () => {
    const harness = artifactHarness({
      currentObjects: [
        storageObject({
          id: replacementObjectId,
          version: "tenant-commercial-document-v1-invoice-replacement",
        }),
      ],
      sourceResponses: [invoiceSource(), invoiceSource()],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      publishTenantInvoiceArtifact({
        client: harness.client as unknown as SupabaseClient<Database>,
        invoiceId,
        organizationId,
        publicationInput,
      }),
    ).rejects.toThrow("Tenant Invoice PDF publication requires operator review.");

    expect(eventsOf(harness.events, "admin.attest")).toHaveLength(0);
    expect(eventsOf(harness.events, "client.register")).toHaveLength(0);
    expect(eventsOf(harness.events, "admin.begin")).toHaveLength(0);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(0);
  });

  it("attests a byte-verified 409 orphan but preserves it after registration failure without beginning cleanup", async () => {
    const harness = artifactHarness({
      beginResponses: [{ data: claimId, error: null }],
      registerResponses: [
        { data: null, error: { message: "registration unavailable" } },
      ],
      sourceResponses: [invoiceSource(), invoiceSource(), invoiceSource()],
      uploadResponse: {
        data: null,
        error: { message: "The resource already exists", statusCode: "409" },
      },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      publishTenantInvoiceArtifact({
        client: harness.client as unknown as SupabaseClient<Database>,
        invoiceId,
        organizationId,
        publicationInput,
      }),
    ).rejects.toThrow("Tenant Invoice PDF publication requires operator review.");

    expect(eventsOf(harness.events, "admin.attest")).toHaveLength(1);
    expect(eventsOf(harness.events, "admin.begin")).toHaveLength(0);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(0);
    expect(eventsOf(harness.events, "admin.finish")).toHaveLength(0);
  });

  it("attests and registers a byte-verified 409 orphan without treating it as freshly uploaded cleanup material", async () => {
    const harness = artifactHarness({
      beginResponses: [{ data: claimId, error: null }],
      sourceResponses: [invoiceSource()],
      uploadResponse: {
        data: null,
        error: { message: "The resource already exists", statusCode: "409" },
      },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    const result = await publishTenantInvoiceArtifact({
      client: harness.client as unknown as SupabaseClient<Database>,
      invoiceId,
      organizationId,
      publicationInput,
    });

    expect(result).toEqual({
      artifactId,
      documentNumber: "INV / 2026 #0042",
      href: `/api/finance/documents/${artifactId}`,
    });
    expect(eventsOf(harness.events, "admin.attest")).toHaveLength(1);
    expect(eventsOf(harness.events, "client.register")).toHaveLength(1);
    expect(eventsOf(harness.events, "admin.begin")).toHaveLength(0);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(0);
    expect(eventsOf(harness.events, "admin.finish")).toHaveLength(0);
  });

  it("treats a thrown upload timeout as indeterminate, reconciles, and never cleans an object whose freshness is unknown", async () => {
    const harness = artifactHarness({
      sourceResponses: [invoiceSource(), invoiceSource()],
      uploadResponses: [
        new Error(
          "provider timeout https://storage.example?token=service-role-secret",
        ),
      ],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      publishTenantInvoiceArtifact({
        client: harness.client as unknown as SupabaseClient<Database>,
        invoiceId,
        organizationId,
        publicationInput,
      }),
    ).rejects.toThrow("Tenant Invoice PDF publication requires operator review.");

    expect(eventsOf(harness.events, "client.source")).toHaveLength(2);
    expect(eventsOf(harness.events, "object.read")).toHaveLength(1);
    expect(eventsOf(harness.events, "admin.begin")).toHaveLength(0);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(0);
    expect(eventsOf(harness.events, "admin.finish")).toHaveLength(0);
  });
});

describe("commercial document cleanup reconciliation", () => {
  it("reconciles the authenticated artifact first and preserves a concurrently registered exact object", async () => {
    const harness = registrationFailureHarness({
      sourceResponses: [invoiceSource(), invoiceSource({ artifact: publishedArtifact() })],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    const result = await publishTenantInvoiceArtifact({
      client: harness.client as unknown as SupabaseClient<Database>,
      invoiceId,
      organizationId,
      publicationInput,
    });

    expect(result).toEqual({
      artifactId,
      documentNumber: "INV / 2026 #0042",
      href: `/api/finance/documents/${artifactId}`,
    });
    const registrationIndex = indexOfEvent(harness.events, "client.register");
    expect(harness.events[registrationIndex + 1]?.name).toBe("client.source");
    expect(eventsOf(harness.events, "admin.begin")).toHaveLength(0);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(0);
  });

  it("preserves any authenticated concurrent artifact even when its registered object identity differs", async () => {
    const replacementArtifact = {
      ...publishedArtifact(),
      storage_object_id: replacementObjectId,
      storage_object_version:
        "tenant-commercial-document-v1-invoice-concurrent-replacement",
    };
    const harness = registrationFailureHarness({
      sourceResponses: [
        invoiceSource(),
        invoiceSource({ artifact: replacementArtifact }),
      ],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    const result = await publishTenantInvoiceArtifact({
      client: harness.client as unknown as SupabaseClient<Database>,
      invoiceId,
      organizationId,
      publicationInput,
    });

    expect(result.artifactId).toBe(artifactId);
    expect(eventsOf(harness.events, "admin.begin")).toHaveLength(0);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(0);
  });

  it("begins cleanup with every exact field, rechecks the same identity immediately, removes once, and finishes with the durable UUID", async () => {
    const harness = registrationFailureHarness();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expectInvoicePublicationFailure(harness);

    const exactFields = {
      p_organization_id: organizationId,
      p_source_id: invoiceId,
      p_source_kind: "invoice",
      p_storage_object_id: objectId,
      p_storage_object_version: invoiceObjectVersion,
      p_storage_path: invoicePath,
    };
    expect(onlyEvent(harness.events, "admin.begin").args).toEqual(exactFields);
    expect(onlyEvent(harness.events, "admin.finish").args).toEqual({
      ...exactFields,
      p_cleanup_claim_id: claimId,
    });
    expect(eventsOf(harness.events, "storage.remove")).toEqual([
      { name: "storage.remove", paths: [invoicePath] },
    ]);
    expect(cleanupTail(harness.events)).toEqual([
      "client.source",
      "object.read",
      "admin.begin",
      "object.read",
      "storage.remove",
      "admin.finish",
    ]);
  });

  it.each([
    ["absent", null],
    [
      "replaced",
      storageObject({
        id: replacementObjectId,
        version: "tenant-commercial-document-v1-invoice-replacement",
      }),
    ],
  ])("does not remove an %s object after the claim identity recheck", async (_case, currentObject) => {
    const harness = registrationFailureHarness({
      currentObjects: [storageObject(), storageObject(), currentObject],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expectInvoicePublicationFailure(harness);

    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(0);
    expect(onlyEvent(harness.events, "admin.finish").args).toMatchObject({
      p_cleanup_claim_id: claimId,
      p_storage_object_id: objectId,
      p_storage_object_version: invoiceObjectVersion,
      p_storage_path: invoicePath,
    });
  });

  it.each([
    ["null", { data: null, error: null }],
    ["error", { data: null, error: { message: "begin unavailable" } }],
    ["timeout", new Error("begin timeout")],
  ])("treats a %s begin result as indeterminate and reconciles without removing", async (_case, beginResponse) => {
    const harness = registrationFailureHarness({
      beginResponses: [beginResponse],
      sourceResponses: [invoiceSource(), invoiceSource(), invoiceSource()],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      publishTenantInvoiceArtifact({
        client: harness.client as unknown as SupabaseClient<Database>,
        invoiceId,
        organizationId,
        publicationInput,
      }),
    ).rejects.toThrow("Tenant Invoice PDF publication requires operator review.");

    const beginIndex = indexOfEvent(harness.events, "admin.begin");
    expect(harness.events.slice(beginIndex + 1).map((event) => event.name)).toEqual([
      "client.source",
      "object.read",
    ]);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(0);
    expect(eventsOf(harness.events, "admin.finish")).toHaveLength(0);
  });

  it("returns a concurrent artifact discovered while reconciling an indeterminate begin", async () => {
    const harness = registrationFailureHarness({
      beginResponses: [{ data: null, error: null }],
      sourceResponses: [
        invoiceSource(),
        invoiceSource(),
        invoiceSource({ artifact: publishedArtifact() }),
      ],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    const result = await publishTenantInvoiceArtifact({
      client: harness.client as unknown as SupabaseClient<Database>,
      invoiceId,
      organizationId,
      publicationInput,
    });

    expect(result.artifactId).toBe(artifactId);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(0);
  });

  it("finishes after an ambiguous remove error, then reconciles artifact and current object without repeating removal", async () => {
    const harness = registrationFailureHarness({
      currentObjects: [storageObject(), storageObject(), storageObject(), storageObject()],
      finishResponses: [{ data: false, error: null }],
      removeResponses: [new Error("provider timeout after request dispatch")],
      sourceResponses: [invoiceSource(), invoiceSource(), invoiceSource()],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      publishTenantInvoiceArtifact({
        client: harness.client as unknown as SupabaseClient<Database>,
        invoiceId,
        organizationId,
        publicationInput,
      }),
    ).rejects.toThrow("Tenant Invoice PDF publication requires operator review.");

    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(1);
    expect(eventsOf(harness.events, "admin.finish")).toHaveLength(1);
    const finishIndex = indexOfEvent(harness.events, "admin.finish");
    expect(harness.events.slice(finishIndex + 1).map((event) => event.name)).toEqual([
      "client.source",
      "object.read",
    ]);
  });

  it.each([
    ["false", { data: false, error: null }],
    ["error", { data: null, error: { message: "finish unavailable" } }],
    ["timeout", new Error("finish timeout")],
  ])("treats a %s finish result as indeterminate and never repeats removal without a new claim and identity check", async (_case, finishResponse) => {
    const harness = registrationFailureHarness({
      currentObjects: [storageObject(), storageObject(), storageObject(), null],
      finishResponses: [finishResponse],
      sourceResponses: [invoiceSource(), invoiceSource(), invoiceSource()],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expectInvoicePublicationFailure(harness);

    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(1);
    expect(eventsOf(harness.events, "admin.begin")).toHaveLength(1);
    const finishIndex = indexOfEvent(harness.events, "admin.finish");
    expect(harness.events.slice(finishIndex + 1).map((event) => event.name)).toEqual([
      "client.source",
      "object.read",
    ]);
  });

  it("preserves an exact durable claim after a crashed attempt when the retry upload is not fresh", async () => {
    const harness = registrationFailureHarness({
      beginResponses: [
        { data: claimId, error: null },
        { data: claimId, error: null },
      ],
      currentObjects: Array.from({ length: 8 }, () => storageObject()),
      finishResponses: [
        { data: false, error: null },
        { data: true, error: null },
      ],
      registerResponses: [
        { data: null, error: { message: "registration unavailable" } },
        { data: null, error: { message: "registration unavailable" } },
      ],
      removeResponses: [
        new Error("worker lost the provider response"),
        { data: [{ name: invoicePath }], error: null },
      ],
      sourceResponses: Array.from({ length: 8 }, () => invoiceSource()),
      uploadResponses: [
        {
          data: {
            fullPath: `tenant-commercial-documents/${invoicePath}`,
            id: objectId,
            path: invoicePath,
          },
          error: null,
        },
        {
          data: null,
          error: { message: "The resource already exists", statusCode: "409" },
        },
      ],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      publishTenantInvoiceArtifact({
        client: harness.client as unknown as SupabaseClient<Database>,
        invoiceId,
        organizationId,
        publicationInput,
      }),
    ).rejects.toThrow("Tenant Invoice PDF publication requires operator review.");
    await expect(
      publishTenantInvoiceArtifact({
        client: harness.client as unknown as SupabaseClient<Database>,
        invoiceId,
        organizationId,
        publicationInput,
      }),
    ).rejects.toThrow("Tenant Invoice PDF publication requires operator review.");

    expect(eventsOf(harness.events, "admin.begin").map((event) => event.result)).toEqual([
      claimId,
    ]);
    expect(eventsOf(harness.events, "storage.remove")).toHaveLength(1);
    for (const removeIndex of indexesOfEvent(harness.events, "storage.remove")) {
      expect(harness.events[removeIndex - 1]?.name).toBe("object.read");
      expect(harness.events[removeIndex - 2]?.name).toBe("admin.begin");
    }
  });
});

describe("commercial document failure and download boundaries", () => {
  it("stores only a stable operational category for a raw Receipt publication failure", async () => {
    const harness = artifactHarness();

    await markReceiptPublicationFailed(
      harness.client as unknown as SupabaseClient<Database>,
      organizationId,
      paymentId,
      "Timeout at https://storage.example/private?token=service-role-secret\n    at upload.ts:42",
    );

    expect(onlyEvent(harness.events, "client.mark-failed").args).toEqual({
      p_failure_message: "storage_unavailable",
      p_organization_id: organizationId,
      p_source_id: paymentId,
      p_source_kind: "receipt",
    });
  });

  it("downloads only published metadata and returns verified private bytes with a server-derived filename", async () => {
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const harness = artifactHarness({
      downloadMetadata: {
        content_type: "application/pdf",
        document_number: "INV / 2026 #0042",
        filename: "caller-controlled-name.pdf",
        id: artifactId,
        publication_status: "published",
        renderer_version: "commercial-pdf-v1",
        sha256,
        size_bytes: 6,
        source_id: invoiceId,
        source_kind: "invoice",
        source_state: "voided",
        storage_path: invoicePath,
      },
      downloadResponses: [{ data: new Blob([bytes]), error: null }],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    const result = await downloadTenantCommercialDocumentArtifact(
      harness.client as unknown as SupabaseClient<Database>,
      organizationId,
      artifactId,
    );

    expect(result).toEqual({
      bytes,
      contentType: "application/pdf",
      filename: "invoice-INV-2026-0042.pdf",
      sourceState: "voided",
    });
    expect(Object.keys(result).sort()).toEqual([
      "bytes",
      "contentType",
      "filename",
      "sourceState",
    ]);
    expect((result as Record<string, unknown>).admin).toBeUndefined();
    expect(eventNames(harness.events)).toEqual([
      "client.download-metadata",
      "storage.download",
    ]);
  });

  it("normalizes an authenticated download metadata RPC throw without exposing transport details", async () => {
    const harness = artifactHarness({
      downloadMetadataResponse: new Error(
        "authenticated transport failed with bearer-token-details",
      ),
    });

    const failure = await downloadTenantCommercialDocumentArtifact(
      harness.client as unknown as SupabaseClient<Database>,
      organizationId,
      artifactId,
    ).catch((error: unknown) => error);

    expect(failure).toEqual(
      new Error("Tenant commercial document artifact is unavailable."),
    );
    expect(String(failure)).not.toContain("bearer-token-details");
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ["size", Uint8Array.from([0x25, 0x50, 0x44, 0x46])],
    ["SHA-256", Uint8Array.from([0x25, 0x50, 0x44, 0x47, 0x2d, 0x31])],
  ])("rejects a downloaded artifact with a %s mismatch", async (_case, retainedBytes) => {
    const expectedBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const harness = artifactHarness({
      downloadMetadata: {
        content_type: "application/pdf",
        document_number: "INV / 2026 #0042",
        filename: "invoice-INV-2026-0042.pdf",
        id: artifactId,
        publication_status: "published",
        renderer_version: "commercial-pdf-v1",
        sha256: createHash("sha256").update(expectedBytes).digest("hex"),
        size_bytes: 6,
        source_id: invoiceId,
        source_kind: "invoice",
        source_state: "current",
        storage_path: invoicePath,
      },
      downloadResponses: [{ data: new Blob([retainedBytes]), error: null }],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      downloadTenantCommercialDocumentArtifact(
        harness.client as unknown as SupabaseClient<Database>,
        organizationId,
        artifactId,
      ),
    ).rejects.toThrow("Tenant commercial document integrity verification failed.");
  });

  it("normalizes a private artifact download promise throw without exposing provider details", async () => {
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const harness = artifactHarness({
      downloadMetadata: {
        ...defaultDownloadMetadata(),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size_bytes: 6,
      },
      downloadResponses: [
        new Error("provider download timeout with service-role-secret"),
      ],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    const failure = await downloadTenantCommercialDocumentArtifact(
      harness.client as unknown as SupabaseClient<Database>,
      organizationId,
      artifactId,
    ).catch((error: unknown) => error);

    expect(failure).toEqual(
      new Error("Tenant commercial document artifact bytes are unavailable."),
    );
    expect(String(failure)).not.toContain("service-role-secret");
  });

  it("normalizes a private artifact Blob read throw as an integrity failure without exposing provider details", async () => {
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const harness = artifactHarness({
      downloadMetadata: {
        ...defaultDownloadMetadata(),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size_bytes: 6,
      },
      downloadResponses: [
        {
          data: rejectingBlob("provider Blob read failed with private details"),
          error: null,
        },
      ],
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    const failure = await downloadTenantCommercialDocumentArtifact(
      harness.client as unknown as SupabaseClient<Database>,
      organizationId,
      artifactId,
    ).catch((error: unknown) => error);

    expect(failure).toEqual(
      new Error("Tenant commercial document integrity verification failed."),
    );
    expect(String(failure)).not.toContain("private details");
  });

  it("does not fetch private bytes when the authenticated download RPC rejects a non-published artifact", async () => {
    const harness = artifactHarness({
      downloadMetadataError: {
        message: "tenant_commercial_document_artifact_not_published",
      },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(harness.admin as never);

    await expect(
      downloadTenantCommercialDocumentArtifact(
        harness.client as unknown as SupabaseClient<Database>,
        organizationId,
        artifactId,
      ),
    ).rejects.toThrow("Tenant commercial document artifact is unavailable.");

    expect(eventsOf(harness.events, "storage.download")).toHaveLength(0);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

type BoundaryEvent = {
  args?: Record<string, unknown>;
  bytes?: Uint8Array;
  name: string;
  options?: Record<string, unknown>;
  path?: string;
  paths?: string[];
  result?: unknown;
};

type RpcResponse = {
  data: unknown;
  error: { message: string; statusCode?: string } | null;
};

type ResponseOrError = RpcResponse | Error;

function artifactHarness({
  beginResponses = [{ data: claimId, error: null }],
  currentObjects,
  downloadMetadata = defaultDownloadMetadata(),
  downloadMetadataError = null,
  downloadMetadataResponse,
  downloadResponses = [],
  finishResponses = [{ data: true, error: null }],
  registerResponses = [{ data: artifactId, error: null }],
  removeResponses = [{ data: [{ name: invoicePath }], error: null }],
  sourceResponses = [invoiceSource()],
  storageObject: initialStorageObject = storageObject(),
  uploadResponse,
  uploadResponses,
}: {
  beginResponses?: ResponseOrError[];
  currentObjects?: Array<Error | Record<string, unknown> | null>;
  downloadMetadata?: Record<string, unknown>;
  downloadMetadataError?: { message: string } | null;
  downloadMetadataResponse?: ResponseOrError;
  downloadResponses?: ResponseOrError[];
  finishResponses?: ResponseOrError[];
  registerResponses?: ResponseOrError[];
  removeResponses?: ResponseOrError[];
  sourceResponses?: Array<Record<string, unknown>>;
  storageObject?: Record<string, unknown>;
  uploadResponse?: ResponseOrError;
  uploadResponses?: ResponseOrError[];
} = {}) {
  const events: BoundaryEvent[] = [];
  const sourceQueue = [...sourceResponses];
  const registerQueue = [...registerResponses];
  const beginQueue = [...beginResponses];
  const finishQueue = [...finishResponses];
  const removeQueue = [...removeResponses];
  const uploadQueue = [
    ...(uploadResponses ?? [
      uploadResponse ?? {
        data: {
          fullPath: `tenant-commercial-documents/${invoicePath}`,
          id: objectId,
          path: invoicePath,
        },
        error: null,
      },
    ]),
  ];
  const objectQueue = [...(currentObjects ?? [initialStorageObject])];
  const retainedQueue = [...downloadResponses];
  let lastUploadedBytes: Uint8Array | null = null;

  const client = {
    auth: {
      async getUser() {
        events.push({ name: "client.auth" });
        return {
          data: { user: { id: actorId } },
          error: null,
        };
      },
    },
    from(table: string) {
      if (table !== "organizations" && table !== "tenant_invoices") {
        throw new Error(`Unexpected authenticated table query: ${table}`);
      }
      const filters: Record<string, unknown> = {};
      const query = {
        eq(column: string, value: unknown) {
          filters[column] = value;
          return query;
        },
        select() {
          return query;
        },
        async single() {
          if (table === "tenant_invoices") {
            if (
              filters.organization_id !== organizationId ||
              filters.id !== invoiceId
            ) {
              throw new Error(
                "Tenant Invoice occupant lookup was not exactly scoped.",
              );
            }
            events.push({ name: "client.invoice-occupants" });
            return { data: { occupant_labels: [] }, error: null };
          }
          events.push({ name: "client.organization" });
          return {
            data: {
              logo_storage_path: null,
              name: "Independent Property Service",
              operational_timezone: "Asia/Phnom_Penh",
            },
            error: null,
          };
        },
      };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "get_tenant_commercial_document_publication_source") {
        events.push({ args, name: "client.source" });
        return { data: take(sourceQueue), error: null };
      }
      if (name === "register_tenant_commercial_document_artifact") {
        events.push({ args, name: "client.register" });
        return resolveResponse(take(registerQueue));
      }
      if (name === "mark_tenant_commercial_document_publication_failed") {
        events.push({ args, name: "client.mark-failed" });
        return { data: artifactId, error: null };
      }
      if (name === "get_tenant_commercial_document_artifact_download") {
        events.push({ args, name: "client.download-metadata" });
        if (downloadMetadataResponse) {
          return resolveResponse(downloadMetadataResponse);
        }
        return {
          data: downloadMetadataError ? null : [downloadMetadata],
          error: downloadMetadataError,
        };
      }
      throw new Error(`Unexpected authenticated RPC: ${name}`);
    },
    storage: {
      from(bucket: string) {
        if (bucket !== "organization-assets") {
          throw new Error(`Unexpected authenticated Storage bucket: ${bucket}`);
        }
        return {
          async download() {
            return { data: null, error: { message: "not found" } };
          },
        };
      },
    },
  };

  const bucket = {
    async download(path: string) {
      events.push({ name: "storage.download", path });
      if (retainedQueue.length > 0) {
        return resolveResponse(take(retainedQueue));
      }
      if (!lastUploadedBytes) {
        throw new Error("The test did not provide retained bytes.");
      }
      return {
        data: new Blob([new Uint8Array(lastUploadedBytes)], {
          type: "application/pdf",
        }),
        error: null,
      };
    },
    async info(path: string) {
      const data = take(objectQueue);
      events.push({
        args: { path },
        name: "object.read",
        result: data,
      });
      if (data instanceof Error) throw data;
      return data
        ? { data, error: null }
        : {
            data: null,
            error: { message: "not found", statusCode: "404" },
          };
    },
    async remove(paths: string[]) {
      events.push({ name: "storage.remove", paths });
      return resolveResponse(take(removeQueue));
    },
    async upload(
      path: string,
      bytes: Uint8Array,
      options: Record<string, unknown>,
    ) {
      lastUploadedBytes = new Uint8Array(bytes);
      events.push({
        bytes: lastUploadedBytes,
        name: "storage.upload",
        options,
        path,
      });
      const response = await resolveResponse(take(uploadQueue));
      return !response.error && response.data && typeof response.data === "object"
        ? {
            ...response,
            data: {
              ...(response.data as Record<string, unknown>),
              fullPath: `tenant-commercial-documents/${path}`,
              path,
            },
          }
        : response;
    },
  };

  const admin = {
    clientMarker: "admin-client-sentinel",
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "attest_tenant_commercial_document_upload") {
        events.push({ args, name: "admin.attest" });
        return { data: "80000000-0000-4000-8000-000000000001", error: null };
      }
      if (name === "begin_tenant_commercial_document_cleanup") {
        const response = take(beginQueue);
        const result = response instanceof Error ? undefined : response.data;
        events.push({ args, name: "admin.begin", result });
        return resolveResponse(response);
      }
      if (name === "finish_tenant_commercial_document_cleanup") {
        const response = take(finishQueue);
        events.push({ args, name: "admin.finish" });
        return resolveResponse(response);
      }
      throw new Error(`Unexpected admin RPC: ${name}`);
    },
    serviceRoleKey: "service-role-secret",
    storage: {
      from(name: string) {
        expect(name).toBe("tenant-commercial-documents");
        return bucket;
      },
    },
  };

  return { admin, client, events };
}

function registrationFailureHarness(
  overrides: Parameters<typeof artifactHarness>[0] = {},
) {
  return artifactHarness({
    beginResponses: [{ data: claimId, error: null }],
    currentObjects: [storageObject(), storageObject(), storageObject()],
    finishResponses: [{ data: true, error: null }],
    registerResponses: [
      { data: null, error: { message: "registration unavailable" } },
    ],
    sourceResponses: [invoiceSource(), invoiceSource()],
    ...overrides,
  });
}

async function expectInvoicePublicationFailure(
  harness: ReturnType<typeof artifactHarness>,
) {
  await expect(
    publishTenantInvoiceArtifact({
      client: harness.client as unknown as SupabaseClient<Database>,
      invoiceId,
      organizationId,
      publicationInput,
    }),
  ).rejects.toThrow("Tenant Invoice PDF publication failed.");
}

function invoiceSource(overrides: Record<string, unknown> = {}) {
  return {
    artifact: null,
    document_number: "INV / 2026 #0042",
    invoice: {
      billing_period_end: "2026-08-31",
      billing_period_start: "2026-08-01",
      collection_route: "through_ips",
      currency: "USD",
      due_date: "2026-08-10",
      issue_date: "2026-08-05",
      lifecycle: "issued",
      total_amount: "850.00",
    },
    issuer: {
      name: "Independent Property Service",
      organization_id: organizationId,
    },
    lines: [
      {
        amount: "850.00",
        description: "August rent",
        id: "31000000-0000-4000-8000-000000000001",
        label: "Monthly rent",
        line_type: "rent",
        sort_order: 1,
      },
    ],
    property: {
      code: "PEAK",
      id: "90000000-0000-4000-8000-000000000001",
      name: "The Peak Residence",
      unit_id: "91000000-0000-4000-8000-000000000001",
      unit_number: "2807",
    },
    recipient: {
      email: "sokha@example.test",
      kind: "tenant",
      label: "Sokha Chan",
      person_id: "92000000-0000-4000-8000-000000000001",
      phone: "+855 10 000 001",
    },
    source_id: invoiceId,
    source_kind: "invoice",
    source_state: "current",
    ...overrides,
  };
}

function receiptSource(overrides: Record<string, unknown> = {}) {
  return {
    allocations: [
      {
        allocation_order: 1,
        amount: "350.00",
        description: "August rent",
        invoice_line_id: "31000000-0000-4000-8000-000000000001",
        label: "Monthly rent",
      },
    ],
    artifact: null,
    document_number: "RCT / 2026 #0018",
    invoice: {
      currency: "USD",
      id: invoiceId,
      invoice_number: "INV / 2026 #0042",
      lifecycle: "issued",
      total_amount: "850.00",
    },
    issuer: {
      name: "Independent Property Service",
      organization_id: organizationId,
    },
    payment: {
      amount: "350.00",
      amount_previously_paid: "200.00",
      received_date: "2026-08-21",
      reference: "ABA-001",
      remaining_balance: "300.00",
      reversal_of_id: null,
    },
    property: {
      code: "PEAK",
      id: "90000000-0000-4000-8000-000000000001",
      name: "The Peak Residence",
      unit_id: "91000000-0000-4000-8000-000000000001",
      unit_number: "2807",
    },
    recipient: {
      kind: "tenant",
      label: "Sokha Chan",
      person_id: "92000000-0000-4000-8000-000000000001",
    },
    source_id: paymentId,
    source_kind: "receipt",
    source_state: "current",
    ...overrides,
  };
}

function expectedInvoiceSnapshot() {
  return {
    billingPeriodEnd: "2026-08-31",
    billingPeriodStart: "2026-08-01",
    currency: "USD",
    dueDate: "2026-08-10",
    invoiceNumber: "INV / 2026 #0042",
    issueDate: "2026-08-05",
    issuer: {
      contactEmail: "billing@ips.example",
      contactPhone: "+855 12 345 678",
      name: "Independent Property Service",
    },
    lines: [
      {
        amount: "850.00",
        description: "August rent",
        label: "Monthly rent",
      },
    ],
    note: "Include the Invoice number with payment.",
    occupantLabels: [],
    paymentInstructions: "Bank transfer to IPS operating account 001-9182.",
    propertyLabel: "PEAK / The Peak Residence",
    recipientLabel: "Sokha Chan",
    totalAmount: "850.00",
    unitLabel: "Unit 2807",
    voided: false,
  };
}

function expectedReceiptSnapshot() {
  return {
    allocations: [
      { amount: "350.00", label: "Monthly rent - August rent" },
    ],
    amountPreviouslyPaid: "200.00",
    currency: "USD",
    invoiceNumber: "INV / 2026 #0042",
    invoiceTotal: "850.00",
    issuer: { name: "Independent Property Service" },
    paymentAmount: "350.00",
    paymentDate: "2026-08-21",
    paymentReference: "ABA-001",
    propertyLabel: "PEAK / The Peak Residence",
    publicationDate: "2026-08-21",
    receiptNumber: "RCT / 2026 #0018",
    recipientLabel: "Sokha Chan",
    remainingBalance: "300.00",
    reversed: false,
    unitLabel: "Unit 2807",
  };
}

function publishedArtifact() {
  return {
    content_type: "application/pdf",
    created_at: "2026-08-21T08:00:00.000Z",
    document_number: "INV / 2026 #0042",
    failure_message: null,
    filename: "invoice-INV-2026-0042.pdf",
    id: artifactId,
    publication_status: "published",
    published_at: "2026-08-21T08:00:00.000Z",
    published_by: actorId,
    renderer_version: "commercial-pdf-v1",
    sha256: "d".repeat(64),
    size_bytes: 1024,
    source_id: invoiceId,
    source_kind: "invoice",
    storage_object_id: objectId,
    storage_object_version: invoiceObjectVersion,
    storage_path: invoicePath,
  };
}

function storageObject({
  id = objectId,
  version = invoiceObjectVersion,
}: {
  id?: string;
  version?: string;
} = {}) {
  return {
    bucket_id: "tenant-commercial-documents",
    id,
    metadata: { mimetype: "application/pdf", size: "1024" },
    name: invoicePath,
    version,
  };
}

function defaultDownloadMetadata() {
  return {
    content_type: "application/pdf",
    document_number: "INV / 2026 #0042",
    filename: "invoice-INV-2026-0042.pdf",
    id: artifactId,
    publication_status: "published",
    renderer_version: "commercial-pdf-v1",
    sha256: "d".repeat(64),
    size_bytes: 1024,
    source_id: invoiceId,
    source_kind: "invoice",
    source_state: "current",
    storage_path: invoicePath,
  };
}

function rejectingBlob(message: string) {
  const blob = new Blob([Uint8Array.from([0x25, 0x50, 0x44, 0x46])]);
  blob.arrayBuffer = vi.fn().mockRejectedValue(new Error(message));
  return blob;
}

function take<T>(values: T[]) {
  if (values.length > 1) return values.shift() as T;
  if (values.length === 1) return values[0] as T;
  throw new Error("The test boundary response queue is empty.");
}

async function resolveResponse(response: ResponseOrError) {
  if (response instanceof Error) throw response;
  return response;
}

function onlyEvent(events: BoundaryEvent[], name: string) {
  const matching = eventsOf(events, name);
  expect(matching).toHaveLength(1);
  return matching[0]!;
}

function eventsOf(events: BoundaryEvent[], name: string) {
  return events.filter((event) => event.name === name);
}

function eventNames(events: BoundaryEvent[]) {
  return events.map((event) => event.name);
}

function indexOfEvent(events: BoundaryEvent[], name: string) {
  const index = events.findIndex((event) => event.name === name);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

function indexesOfEvent(events: BoundaryEvent[], name: string) {
  return events.flatMap((event, index) => (event.name === name ? [index] : []));
}

function cleanupTail(events: BoundaryEvent[]) {
  const registrationIndex = indexOfEvent(events, "client.register");
  return events.slice(registrationIndex + 1).map((event) => event.name);
}
