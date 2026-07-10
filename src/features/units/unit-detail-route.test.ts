import { describe, expect, it } from "vitest";
import * as unitDetailRoute from "@/features/units/unit-detail-route";

type ParseUnitDetailQuery = (
  searchParams: Record<string, string | string[] | undefined>,
) => {
  section: unitDetailRoute.UnitRecordSection;
  sourceTaskId?: string;
};

type GetUnitRecordReturnLink = (sourceTaskId?: string) => {
  href: string;
  label: string;
};

const parseUnitDetailQuery = Reflect.get(
  unitDetailRoute,
  "parseUnitDetailQuery",
) as ParseUnitDetailQuery | undefined;
const getUnitRecordReturnLink = Reflect.get(
  unitDetailRoute,
  "getUnitRecordReturnLink",
) as GetUnitRecordReturnLink | undefined;

describe("unit detail route contract", () => {
  it("builds a bookmarkable unit section with maintenance source context", () => {
    expect(
      unitDetailRoute.buildUnitRecordHref({
        section: "maintenance",
        sourceTaskId: "task-1",
        unitId: "unit-1",
      }),
    ).toBe("/units/unit-1?section=maintenance&sourceTaskId=task-1");
  });

  it("parses a supported section and source task", () => {
    expect(parseUnitDetailQuery).toBeTypeOf("function");
    expect(
      parseUnitDetailQuery?.({
        section: "maintenance",
        sourceTaskId: "task-1",
      }),
    ).toEqual({
      section: "maintenance",
      sourceTaskId: "task-1",
    });
  });

  it("falls back to overview for unknown or repeated section values", () => {
    expect(parseUnitDetailQuery).toBeTypeOf("function");
    expect(parseUnitDetailQuery?.({ section: "unknown" })).toEqual({
      section: "overview",
    });
    expect(
      parseUnitDetailQuery?.({
        section: ["maintenance", "finance"],
        sourceTaskId: ["task-1", "task-2"],
      }),
    ).toEqual({
      section: "maintenance",
      sourceTaskId: "task-1",
    });
  });

  it("returns to the originating case when task context is present", () => {
    expect(getUnitRecordReturnLink).toBeTypeOf("function");
    expect(getUnitRecordReturnLink?.("task-1")).toEqual({
      href: "/maintenance?archiveState=all&taskId=task-1",
      label: "Back to case",
    });
    expect(getUnitRecordReturnLink?.()).toEqual({
      href: "/units",
      label: "Units",
    });
  });
});
