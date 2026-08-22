import type { Database } from "./database";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;

type CreateUnitArgs =
  Database["public"]["Functions"]["create_unit"]["Args"];
type UpdateUnitArgs =
  Database["public"]["Functions"]["update_unit"]["Args"];

type ExpectedCreateUnitArgs =
  | {
      p_bathroom_count: number | null;
      p_bedroom_count: number | null;
      p_floor: string | null;
      p_organization_id: string;
      p_property_id: string;
      p_size_sqm: number | null;
      p_status: string;
      p_unit_number: string;
    }
  | {
      p_floor: string | null;
      p_organization_id: string;
      p_property_id: string;
      p_size_sqm: number | null;
      p_status: string;
      p_unit_number: string;
    };

type ExpectedUpdateUnitArgs =
  | {
      p_bathroom_count: number | null;
      p_bedroom_count: number | null;
      p_floor: string | null;
      p_organization_id: string;
      p_property_id: string;
      p_size_sqm: number | null;
      p_status: string;
      p_unit_id: string;
      p_unit_number: string;
    }
  | {
      p_floor: string | null;
      p_organization_id: string;
      p_property_id: string;
      p_size_sqm: number | null;
      p_status: string;
      p_unit_id: string;
      p_unit_number: string;
    };

type CreateUnitPreservesBothSqlOverloads = Expect<
  Equal<CreateUnitArgs, ExpectedCreateUnitArgs>
>;
type UpdateUnitPreservesBothSqlOverloads = Expect<
  Equal<UpdateUnitArgs, ExpectedUpdateUnitArgs>
>;

export type UnitRpcTypeContract =
  | CreateUnitPreservesBothSqlOverloads
  | UpdateUnitPreservesBothSqlOverloads;
