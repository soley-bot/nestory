import { escapeSearchPattern, matchesSearchText, searchTokens } from "./text";

export type PortfolioProperty = {
  id: string;
  code: string;
  name: string;
  ownerNames: string[];
  ownerPersonIds?: string[];
};
export type PortfolioUnit = { id: string; property_id: string; unit_number: string };
export type PortfolioSearch = ReturnType<typeof createPortfolioSearch>;

/** A unit match stays unit-specific on registers that contain unit records. */
export function createPortfolioSearch(properties: PortfolioProperty[], units: PortfolioUnit[]) {
  const propertyText = new Map(properties.map(p => [p.id, [p.code, p.name, ...p.ownerNames]]));
  const unitText = new Map(units.map(u => [u.id, [...(propertyText.get(u.property_id) ?? []), u.unit_number]]));
  const propertyWithUnits = new Map(properties.map(p => [p.id, [...(propertyText.get(p.id) ?? [])]]));
  for (const unit of units) propertyWithUnits.get(unit.property_id)?.push(unit.unit_number);
  const owners = new Map<string, string[]>();
  for (const property of properties) {
    for (const personId of property.ownerPersonIds ?? []) {
      owners.set(personId, [...(owners.get(personId) ?? []), ...(propertyWithUnits.get(property.id) ?? [])]);
    }
  }
  function conditions(token: string) {
    const propertyIds = properties.filter(p => matchesSearchText(token, propertyText.get(p.id) ?? [])).map(p => p.id);
    const unitIds = units.filter(u => matchesSearchText(token, unitText.get(u.id) ?? [])).map(u => u.id);
    return [idCondition("property_id", propertyIds), idCondition("unit_id", unitIds)].filter(Boolean);
  }
  return {
    properties,
    units,
    ownerValues: (id: string) => owners.get(id) ?? [],
    ownerIds: (token: string) => [...owners].filter(([, values]) => matchesSearchText(token, values)).map(([id]) => id),
    propertyValues: (id: string) => propertyText.get(id) ?? [],
    unitValues: (id: string) => unitText.get(id) ?? [],
    matchesProperty(query: string, id: string, extra: string[] = []) {
      return matchesSearchText(query, [...(propertyWithUnits.get(id) ?? []), ...extra]);
    },
    conditions,
    groups(query: string, fields: string[]) {
      return searchTokens(query).map(token => [
        ...fields.map(field => `${field}.ilike.${JSON.stringify("%" + escapeSearchPattern(token) + "%")}`),
        ...conditions(token),
      ].join(","));
    },
  };
}
function idCondition(column: string, ids: string[]) {
  return ids.length ? `${column}.in.(${ids.map(id => JSON.stringify(id)).join(",")})` : "";
}
