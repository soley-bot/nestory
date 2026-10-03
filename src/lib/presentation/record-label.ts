const databaseUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** For record names only. Keep business references and internal identifiers unchanged. */
export function recordDisplayLabel(value: string | null | undefined, fallback: string): string {
  const label = value?.trim();
  return label && !databaseUuid.test(label) ? label : fallback;
}
