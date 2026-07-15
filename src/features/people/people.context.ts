import type { PeopleSummary } from "@/features/people/people.types";

export function getPeopleLinkedLabel(person: PeopleSummary) {
  if (person.linked.activeLease) {
    return `${person.linked.activeLeaseCount} active lease${
      person.linked.activeLeaseCount === 1 ? "" : "s"
    }`;
  }

  if (person.linked.ownerProperty) {
    return `${person.linked.ownerPropertyCount} owner propert${
      person.linked.ownerPropertyCount === 1 ? "y" : "ies"
    }`;
  }

  if (person.linked.vendorProfile) {
    return person.linked.vendorProfile.label;
  }

  return null;
}

export function getPeopleOperatingContext(person: PeopleSummary) {
  const linkedLabel = getPeopleLinkedLabel(person);
  const notes = person.notes?.trim();

  return [linkedLabel, notes].filter(Boolean).join(" / ") || "No operating context";
}
