import type { Json } from "@/types/database";
import type { MaintenanceChecklistItem } from "@/features/maintenance/maintenance.types";

export function parseMaintenanceChecklistText(
  value: string,
): MaintenanceChecklistItem[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const completed = /^\[[xX]\]\s*/.test(line);
      const label = line.replace(/^\[[ xX]\]\s*/, "").trim();

      return {
        completed,
        id: String(index + 1),
        label,
      };
    })
    .filter((item) => item.label.length > 0);
}

export function formatMaintenanceChecklistText(
  items: Pick<MaintenanceChecklistItem, "completed" | "label">[],
) {
  return items
    .map((item) => ({
      completed: item.completed,
      label: item.label.trim(),
    }))
    .filter((item) => item.label.length > 0)
    .map((item) => `${item.completed ? "[x]" : "[ ]"} ${item.label}`)
    .join("\n");
}

export function parseMaintenanceChecklistValue(
  value: Json,
): MaintenanceChecklistItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return [
        {
          completed: false,
          id: String(index + 1),
          label: item.trim(),
        },
      ];
    }

    if (!item || Array.isArray(item) || typeof item !== "object") {
      return [];
    }

    const label = typeof item.label === "string" ? item.label.trim() : "";

    if (!label) {
      return [];
    }

    return [
      {
        completed: item.completed === true,
        id: typeof item.id === "string" ? item.id : String(index + 1),
        label,
      },
    ];
  });
}
