import { describe, expect, it, vi } from "vitest";
import { readCompleteRows } from "./complete-read";

type Row = { id: string };
const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: String(index).padStart(6, "0") }));
const options = { context: "Could not load synthetic rows", getRowId: (row: Row) => row.id, compareRows: (first: Row, second: Row) => first.id.localeCompare(second.id) };

describe("readCompleteRows", () => {
  it.each([0, 1, 500, 501, 1000, 1001, 36017])("reads all %i rows across exact page boundaries", async (size) => {
    const data = rows(size);
    const readPage = vi.fn(async (from: number, to: number) => ({ data: data.slice(from, to + 1), count: size, error: null }));
    expect(await readCompleteRows({ ...options, readPage })).toEqual(data);
    expect(readPage).toHaveBeenCalledTimes(Math.max(1, Math.ceil(size / 500)));
  });
  it("continues after a short capped page using the number actually returned", async () => {
    const data = rows(1001);
    const readPage = vi.fn(async (from: number, to: number) => ({ data: data.slice(from, Math.min(to + 1, from + 137)), count: data.length, error: null }));
    expect(await readCompleteRows({ ...options, readPage })).toEqual(data);
    expect(readPage.mock.calls[1]).toEqual([137, 636]);
  });
  it.each([null, NaN, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid exact count %s", async count => {
    await expect(readCompleteRows({ ...options, readPage: async () => ({ data: [], count, error: null }) })).rejects.toThrow("exact row count");
  });
  it.each(["count", "duplicate", "empty", "error", "throw", "order"])("rejects later page %s instead of returning partial rows", async failure => {
    const data = rows(4);
    const readPage = vi.fn(async (from: number) => {
      if (from === 0) return { data: data.slice(0, 2), count: 4, error: null };
      if (failure === "throw") throw new Error("Synthetic transport failure");
      return { data: failure === "duplicate" ? [data[1], data[2]] : failure === "empty" ? [] : failure === "order" ? [data[3], data[2]] : data.slice(2), count: failure === "count" ? 5 : 4, error: failure === "error" ? { message: "Synthetic failure" } : null };
    });
    await expect(readCompleteRows({ ...options, pageSize: 2, readPage })).rejects.toThrow();
  });
  it("rejects oversized responses, missing identities and explicit safety limits", async () => {
    await expect(readCompleteRows({ ...options, pageSize: 1, readPage: async () => ({ data: rows(2), count: 2, error: null }) })).rejects.toThrow("range");
    await expect(readCompleteRows({ ...options, readPage: async () => ({ data: [{ id: "" }], count: 1, error: null }) })).rejects.toThrow("identity");
    await expect(readCompleteRows({ ...options, maxRows: 100000, readPage: async () => ({ data: rows(1), count: 100001, error: null }) })).rejects.toThrow("supported 100000");
  });
  it("enforces the default safety ceiling and checks later batches with no remaining budget", async () => {
    await expect(readCompleteRows({ ...options, readPage: async () => ({ data: [], count: 100001, error: null }) })).rejects.toThrow("supported 100000");
    await expect(readCompleteRows({ ...options, maxRows: 0, readPage: async () => ({ data: [], count: 0, error: null }) })).resolves.toEqual([]);
    await expect(readCompleteRows({ ...options, maxRows: 0, readPage: async () => ({ data: rows(1), count: 1, error: null }) })).rejects.toThrow("supported 0");
  });
});
