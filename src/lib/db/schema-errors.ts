export function isMissingSchemaObjectMessage(
  message: string,
  objectNames: readonly string[] = [],
) {
  const normalized = message.toLowerCase();
  const mentionsExpectedObject =
    objectNames.length === 0 ||
    objectNames.some((objectName) =>
      normalized.includes(objectName.toLowerCase()),
    );

  if (!mentionsExpectedObject) {
    return false;
  }

  return (
    normalized.includes("could not find the table") ||
    (normalized.includes("could not find the") &&
      normalized.includes("schema cache")) ||
    normalized.includes("does not exist")
  );
}
