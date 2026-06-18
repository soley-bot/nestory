import { describe, expect, it } from "vitest";
import {
  DEFAULT_PEOPLE_ARCHIVE_STATE,
  DEFAULT_PEOPLE_PAGE_SIZE,
  DEFAULT_PEOPLE_SORT,
  parsePeopleSearchParams,
} from "@/features/people/people.filters";

describe("parsePeopleSearchParams", () => {
  it("normalizes default people filters", () => {
    expect(parsePeopleSearchParams({})).toEqual({
      archiveState: DEFAULT_PEOPLE_ARCHIVE_STATE,
      page: 1,
      pageSize: DEFAULT_PEOPLE_PAGE_SIZE,
      query: "",
      role: "all",
      sort: DEFAULT_PEOPLE_SORT,
      status: "all",
    });
  });

  it("keeps valid filters and clamps unsafe values", () => {
    expect(
      parsePeopleSearchParams({
        archiveState: "all",
        page: "3",
        pageSize: "100",
        query: "  tenant owner vendor  ",
        role: "tenant",
        sort: "updated_desc",
        status: "active",
      }),
    ).toEqual({
      archiveState: "all",
      page: 3,
      pageSize: 100,
      query: "tenant owner vendor",
      role: "tenant",
      sort: "updated_desc",
      status: "active",
    });
  });

  it("falls back for unknown role, status, sort, and page size", () => {
    expect(
      parsePeopleSearchParams({
        page: "-1",
        pageSize: "999",
        role: "manager",
        sort: "random",
        status: "draft",
      }),
    ).toMatchObject({
      page: 1,
      pageSize: DEFAULT_PEOPLE_PAGE_SIZE,
      role: "all",
      sort: DEFAULT_PEOPLE_SORT,
      status: "all",
    });
  });
});
