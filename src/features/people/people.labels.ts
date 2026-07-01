import type {
  PersonPartyType,
  PersonRoleValue,
} from "@/features/people/people.types";

export function formatPartyType(value: PersonPartyType) {
  return value === "company" ? "Company" : "Individual";
}

export function formatRole(value: PersonRoleValue) {
  if (value === "tenant") {
    return "Tenant";
  }

  if (value === "owner") {
    return "Owner";
  }

  if (value === "vendor") {
    return "Vendor";
  }

  return "Staff";
}
