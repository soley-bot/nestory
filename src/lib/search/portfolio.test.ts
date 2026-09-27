import { describe, expect, it } from "vitest";
import { createPortfolioSearch } from "./portfolio";
import { matchesSearchText } from "./text";

// Synthetic records model the pilot's distinct property aliases, legal owners and unit labels.
const portfolio = createPortfolioSearch([
  { id: "p1", code: "PM-0003", name: "Alex Morgan", ownerNames: ["MORGAN JAMES"], ownerPersonIds: ["owner1"] },
  { id: "p2", code: "PM-0006", name: "Sam - CASA #A1105", ownerNames: ["Sam\\tTaylor"], ownerPersonIds: ["owner2"] },
], [
  { id: "u1", property_id: "p1", unit_number: "BELLAVITA #7F-D2" },
  { id: "u2", property_id: "p1", unit_number: "BELLAVITA #8F-D2" },
  { id: "u3", property_id: "p2", unit_number: "CASA #A11-05" },
]);
describe("property, unit and owner search", () => {
  it("finds a property by its alias, legal owner, unit name or property code", () => {
    for (const query of ["Alex", "James Morgan", "BELLAVITA 7FD2", "pm0003", "7f-d2 MORGAN"]) {
      expect(portfolio.matchesProperty(query, "p1")).toBe(true);
      expect(portfolio.matchesProperty(query, "p2")).toBe(false);
    }
  });
  it("keeps a unit-specific query from including sibling units", () => {
    expect(portfolio.conditions("7FD2")).toEqual(['unit_id.in.("u1")']);
    expect(matchesSearchText("MORGAN 7FD2", portfolio.unitValues("u1"))).toBe(true);
    expect(matchesSearchText("MORGAN 7FD2", portfolio.unitValues("u2"))).toBe(false);
  });
  it("matches imported whitespace and punctuation variants without wildcard matching", () => {
    expect(matchesSearchText("Taylor A1105", portfolio.unitValues("u3"))).toBe(true);
    expect(matchesSearchText("%", portfolio.unitValues("u3"))).toBe(false);
    expect(matchesSearchText("_", portfolio.unitValues("u3"))).toBe(false);
    expect(portfolio.matchesProperty("unknown 7FD2", "p1")).toBe(false);
  });
  it("finds the owner when staff know only the property or unit", () => {
    expect(portfolio.ownerIds("7FD2")).toEqual(["owner1"]);
    expect(matchesSearchText("BELLAVITA James", portfolio.ownerValues("owner1"))).toBe(true);
  });
  it("quotes user text so punctuation cannot add PostgREST conditions", () => {
    expect(portfolio.groups('x),id.neq.null', ["title"])).toEqual(['title.ilike."%x),id.neq.null%"']);
  });
});
