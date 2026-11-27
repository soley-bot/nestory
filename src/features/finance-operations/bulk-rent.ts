import { z } from "zod";

export const bulkRentChunkSize = 10;
export const bulkRentMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const bulkRentProperty = z.uuid().nullable();
const token = z.string().regex(/^[a-f0-9]{32}$/);
const row = z.object({
  leaseId: z.uuid(), tenant: z.string(), property: z.string(), unit: z.string().nullable(), note: z.string().nullable(),
});
export const bulkRentRow = z.discriminatedUnion("status", [
  row.extend({
    status: z.literal("ready"), token, rent: z.number().positive(), fee: z.number().nonnegative(), currency: z.literal("USD"),
    from: z.iso.date(), through: z.iso.date(), issueDate: z.iso.date(), prorated: z.boolean(),
    recipient: z.string(), route: z.string(),
  }),
  row.extend({ status: z.literal("existing"), invoiceId: z.uuid() }),
  row.extend({ status: z.literal("blocked"), invoiceId: z.uuid().optional() }),
]);
export const bulkRentSelection = z.array(z.object({ id: z.uuid(), token })).min(1).max(bulkRentChunkSize)
  .refine(items => new Set(items.map(item => item.id)).size === items.length);
export const bulkRentOutcome = z.object({
  leaseId: z.uuid(), status: z.enum(["generated", "existing", "review"]), message: z.string(), invoiceId: z.uuid().optional(),
});
export type BulkRentRow = z.infer<typeof bulkRentRow>;
export type ReadyRent = Extract<BulkRentRow, { status: "ready" }>;
export type BulkRentOutcome = z.infer<typeof bulkRentOutcome>;
export type BulkRentSelection = z.infer<typeof bulkRentSelection>;
export type BulkRentResponse<T> = { data: T; error?: never } | { data?: never; error: string };
