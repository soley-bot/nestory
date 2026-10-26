export const FIXTURE_UUID: RegExp;

export type ConcurrencyIdentityProfile = Readonly<{
  namespace: string;
  id(value: string): string;
  email(value: string): string;
  sql(source: string): string;
  mappedIds(): string[];
  assertApi(value: string): void;
}>;

export function concurrencyIdentityProfile(
  namespace: string,
  sources?: readonly string[],
): ConcurrencyIdentityProfile;
