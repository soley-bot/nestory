import type { ActivityChangeDetail } from "@/features/activity/activity.types";

const TECHNICAL_FIELD_SUFFIX = /(?:^|\s)(?:id|uuid|hash)$/i;
const UUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA_256_VALUE = /^[0-9a-f]{64}$/i;

export function getOperatorActivityDetails(
  details: ActivityChangeDetail[],
): ActivityChangeDetail[] {
  return details.filter((detail) => {
    const field = detail.field
      .trim()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

    return (
      !TECHNICAL_FIELD_SUFFIX.test(field) &&
      !isTechnicalValue(detail.before) &&
      !isTechnicalValue(detail.after)
    );
  });
}

function isTechnicalValue(value: string) {
  const normalized = value.trim();
  return UUID_VALUE.test(normalized) || SHA_256_VALUE.test(normalized);
}
