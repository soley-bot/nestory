"use server";

import { requireWorkspaceContext } from "@/lib/auth/context";
import { getPersonSelectPage } from "./data/person-options";
import type { PersonRoleValue } from "./people.types";

async function read(roles: PersonRoleValue[], query: string, page: number, selectedId: string) {
  const context = await requireWorkspaceContext();
  return getPersonSelectPage({ organizationId: context.organizationId, roles, query, page, selectedId: selectedId && selectedId !== "external" ? selectedId : undefined });
}
export async function getOwnerOptionsAction(query: string, page: number, selectedId: string) { return read(["owner"],query,page,selectedId); }
export async function getTenantOptionsAction(query: string, page: number, selectedId: string) { return read(["tenant"],query,page,selectedId); }
export async function getStaffOptionsAction(query: string, page: number, selectedId: string) { return read(["staff"],query,page,selectedId); }
export async function getCounterpartyOptionsAction(query: string, page: number, selectedId: string) { return read(["tenant","owner","vendor","staff"],query,page,selectedId); }
