import type {
  OverviewAttentionItem,
  OverviewScreenData,
} from "@/features/overview/overview.types";

export function buildAdminWorkspaceQueue(
  data: Pick<OverviewScreenData, "attentionItems">,
): OverviewAttentionItem[] {
  return data.attentionItems
    .filter((item) => item.count > 0)
    .toSorted(
      (first, second) =>
        first.priority - second.priority ||
        second.count - first.count ||
        first.id.localeCompare(second.id),
    );
}
