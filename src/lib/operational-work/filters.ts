import { categoryOf } from "./category";
import { daysFrom } from "./priority";
import type { OperationalWorkFilters, OperationalWorkItem } from "./types";

export const EMPTY_OPERATIONAL_FILTERS: OperationalWorkFilters = {
  category: "all",
  department: "all",
  employee: "all",
  position: "all",
  status: "all",
  source: "all",
  priority: "all",
  due: "all",
  duration: "all",
  standard: "all",
  delegated: "all",
  blocked: "all",
  leadership: "all",
};

export function applyOperationalFilters(
  items: OperationalWorkItem[],
  filters: OperationalWorkFilters,
  today: Date,
): OperationalWorkItem[] {
  return items.filter((item) => {
    if (filters.category !== "all" && categoryOf(item) !== filters.category) return false;
    if (filters.department !== "all" && item.department !== filters.department) return false;
    if (filters.employee !== "all" && item.responsibleEmployee?.id !== filters.employee) return false;
    if (filters.position !== "all" && item.responsiblePosition !== filters.position) return false;
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.source !== "all" && item.sourceType !== filters.source) return false;
    if (filters.priority !== "all" && item.priorityBand !== filters.priority) return false;
    if (filters.standard !== "all" && item.programStandardId !== filters.standard) return false;
    if (filters.delegated === "yes" && !item.delegated) return false;
    if (filters.delegated === "no" && item.delegated) return false;
    if (filters.blocked === "yes" && !item.blockedState.blocked) return false;
    if (filters.blocked === "no" && item.blockedState.blocked) return false;
    if (filters.leadership === "yes" && !item.leadershipState.active) return false;
    if (filters.leadership === "no" && item.leadershipState.active) return false;

    if (filters.due !== "all") {
      if (!item.dueDate) return filters.due === "none";
      const days = daysFrom(today, item.dueDate);
      if (filters.due === "overdue" && days >= 0) return false;
      if (filters.due === "today" && days !== 0) return false;
      if (filters.due === "week" && (days < 0 || days > 7)) return false;
      if (filters.due === "none") return false;
    }

    if (filters.duration !== "all") {
      if (item.estimatedMinutes === null) return false;
      if (filters.duration === "15" && item.estimatedMinutes > 15) return false;
      if (filters.duration === "30" && item.estimatedMinutes > 30) return false;
      if (filters.duration === "60" && item.estimatedMinutes > 60) return false;
      if (filters.duration === "long" && item.estimatedMinutes <= 60) return false;
    }
    return true;
  });
}
