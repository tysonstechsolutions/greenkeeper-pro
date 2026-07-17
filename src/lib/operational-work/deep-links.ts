import type { OperationalWorkSource } from "./types";

export function operationalWorkDeepLink(
  sourceType: OperationalWorkSource,
  sourceRecordId: string,
  stableId: string,
): string {
  const id = encodeURIComponent(sourceRecordId);
  switch (sourceType) {
    case "task":
    case "duty":
      return `/tasks/view?id=${id}`;
    case "standard":
      return `/standards?standard=${id}`;
    case "obligation":
      return `/operations?focus=${encodeURIComponent(stableId)}`;
    case "goal":
    case "step":
      return `/operations?view=mine&focus=${encodeURIComponent(stableId)}`;
    case "calendar":
      return `/calendar?event=${id}`;
    case "equipment":
      return `/equipment/view?id=${id}`;
    case "purchase_request":
      return `/purchase-requests/view?id=${id}`;
    case "inspection":
      return `/ast-inspections/view?id=${id}`;
  }
}
