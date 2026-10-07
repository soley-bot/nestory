export const dailyIdentityMap: Readonly<Record<string, string>>;
export function dailyIdentity(id: string): string;
export function assertDailyReceiptIdentities(organizationId: string, actors: Record<string, { id: string }>): void;
export function remapDailyFixtureSql(sql: string): string;
export function fixtureIdentityProfile(env?: Record<string, string | undefined>): {
  id(value: string): string;
  sql(value: string): string;
  assertApi(value: string): void;
};
