import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("finance operations initial reads", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockReset();
  });

  it("caps database concurrency while preserving declared result order", async () => {
    // Break caught: restoring the wide Promise.all burst that exhausted the
    // authenticated eight-second statement budget during rapid navigation.
    const harness = createFinanceReadHarness({
      organizations: {
        data: { operational_timezone: "Asia/Phnom_Penh" },
        delayMs: 20,
      },
      properties: {
        data: [
          {
            archived_at: null,
            code: "P-01",
            id: "property-1",
            name: "Palm House",
          },
        ],
        delayMs: 1,
      },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      harness.client as never,
    );

    const result = await getFinanceOperationsData("organization-1");

    expect(harness.maxInFlight()).toBeLessThanOrEqual(4);
    expect(result.operationalTimezone).toBe("Asia/Phnom_Penh");
    expect(result.propertyOptions).toEqual([
      { id: "property-1", label: "Palm House — P-01" },
    ]);
  });

  it("keeps an initial database error fatal", async () => {
    // Break caught: treating a finance timeout as empty authoritative data.
    const harness = createFinanceReadHarness({
      owner_invoice_balances: {
        data: null,
        error: { message: "canceling statement due to statement timeout" },
      },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      harness.client as never,
    );

    await expect(
      getFinanceOperationsData("organization-1"),
    ).rejects.toThrow(
      "Could not load finance operations: canceling statement due to statement timeout",
    );
  });
});

type QueryResult = {
  data: unknown;
  delayMs?: number;
  error?: { message: string } | null;
};

function createFinanceReadHarness(
  overrides: Record<string, QueryResult> = {},
) {
  let active = 0;
  let peak = 0;

  class Query implements PromiseLike<{ data: unknown; error: unknown }> {
    private singleRow = false;

    constructor(private readonly table: string) {}

    eq() {
      return this;
    }

    gt() {
      return this;
    }

    in() {
      return this;
    }

    is() {
      return this;
    }

    limit() {
      return this;
    }

    neq() {
      return this;
    }

    order() {
      return this;
    }

    range() {
      return this;
    }

    select() {
      return this;
    }

    single() {
      this.singleRow = true;
      return this;
    }

    then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
      onfulfilled?:
        | ((
            value: { data: unknown; error: unknown },
          ) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): Promise<TResult1 | TResult2> {
      const override = overrides[this.table];
      const value = {
        data:
          override?.data ??
          (this.singleRow ? { operational_timezone: "UTC" } : []),
        error: override?.error ?? null,
      };
      active += 1;
      peak = Math.max(peak, active);

      return new Promise<typeof value>((resolve) => {
        setTimeout(() => {
          active -= 1;
          resolve(value);
        }, override?.delayMs ?? 5);
      }).then(onfulfilled, onrejected);
    }
  }

  return {
    client: {
      from: (table: string) => new Query(table),
      rpc: () => new Query("rpc"),
    },
    maxInFlight: () => peak,
  };
}
