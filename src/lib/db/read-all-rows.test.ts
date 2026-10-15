import { describe, expect, it, vi } from "vitest";
import { readAllRows, readAllRowsByIds } from "@/lib/db/read-all-rows";

describe("complete supporting reads", () => {
  it.each([0, 500, 1000, 1201])("reads %i rows including exact page boundaries", async (count) => {
    const rows = Array.from({ length: count }, (_, id) => ({ id: String(id), date: "2026-10-01" }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
    expect((await readAllRows(fetchPage)).data).toEqual(rows);
    expect(fetchPage).toHaveBeenLastCalledWith(count, count + 499);
    expect(fetchPage).toHaveBeenCalledTimes(Math.ceil(count / 500) + 1);
  });

  it("continues when the server caps rows below the requested page size", async () => {
    const rows = Array.from({ length: 1203 }, (_, id) => ({ id: String(id) }));
    const fetchPage = vi.fn(async (from: number) => ({ data: rows.slice(from, from + 200), error: null }));
    expect((await readAllRows(fetchPage)).data).toEqual(rows);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 200, 699);
  });

  it("discards partial data on a page error and starts a retry at the beginning", async () => {
    const rows = Array.from({ length: 1001 }, (_, id) => ({ id: String(id) }));
    let fail = true;
    const fetchPage = vi.fn(async (from: number, to: number) => from === 500 && fail
      ? { data: null, error: { message: "temporary failure" } }
      : { data: rows.slice(from, to + 1), error: null });
    expect(await readAllRows(fetchPage)).toEqual({ data: null, error: { message: "temporary failure" } });
    fail = false;
    expect((await readAllRows(fetchPage)).data).toEqual(rows);
    expect(fetchPage.mock.calls[2]).toEqual([0, 499]);
  });

  it("rejects repeated pages and malformed successful responses", async () => {
    await expect(readAllRows(async () => ({ data: [{ id: "repeated" }], error: null }))).rejects.toThrow(/repeated a row/);
    await expect(readAllRows(async () => ({ data: null, error: null }))).rejects.toThrow(/malformed/);
  });

  it("batches and deduplicates IDs, paging all children of every batch", async () => {
    const fetchPage = vi.fn(async (ids: string[], from: number, to: number) => ({
      data: ids.flatMap(id => Array.from({ length: 501 }, (_, index) => ({ id: `${id}-${index}` }))).slice(from, to + 1),
      error: null,
    }));
    expect((await readAllRowsByIds(["a", "b", "a", "c"], fetchPage, 2)).data).toHaveLength(1503);
    expect(fetchPage.mock.calls.map(call => call[0])).toEqual([["a", "b"], ["a", "b"], ["a", "b"], ["a", "b"], ["c"], ["c"], ["c"]]);
    expect(await readAllRowsByIds([], fetchPage)).toEqual({ data: [], error: null });
  });

  it("does not return earlier batches when a later batch fails", async () => {
    const result = await readAllRowsByIds(["a", "b"], async (ids, from) => ids[0] === "b"
      ? { data: null, error: { message: "denied" } }
      : { data: from === 0 ? [{ id: "a" }] : [], error: null }, 1);
    expect(result).toEqual({ data: null, error: { message: "denied" } });
  });
});
