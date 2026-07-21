import type { OperationalWorkItem } from "./types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const FINISHED = new Set(["completed", "verified", "cancelled"]);

interface AssignedGroup {
  name: string;
  items: OperationalWorkItem[];
}

/** Group open, assigned work by the employee it was handed to. */
export function groupAssignmentsByEmployee(items: OperationalWorkItem[]): AssignedGroup[] {
  const groups = new Map<string, AssignedGroup>();
  for (const item of items) {
    if (FINISHED.has(item.status)) continue;
    const employee = item.responsibleEmployee;
    if (!employee) continue;
    const group = groups.get(employee.id) ?? { name: employee.name, items: [] };
    group.items.push(item);
    groups.set(employee.id, group);
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) =>
      (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31")
      || a.title.localeCompare(b.title),
    );
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build a self-contained, printable HTML document of per-employee task lists.
 * The GM hands these out on paper — staff have no app logins. Deterministic,
 * no network or app dependencies, so it is safe to open in a new window.
 */
export function buildAssignmentsPrintHtml(
  items: OperationalWorkItem[],
  generatedOn: Date,
): string {
  const groups = groupAssignmentsByEmployee(items);
  const printedDate = formatDate(generatedOn);

  const body = groups.length === 0
    ? `<p class="empty">No work is currently assigned to anyone. Assign tasks from the Operations Command Center to build a hand-out list.</p>`
    : groups.map((group) => {
      const rows = group.items.map((item) => {
        const due = item.dueDate ? `Due ${escapeHtml(item.dueDate)}` : "No due date";
        const meta = [due, escapeHtml(item.sourceLabel)]
          .filter(Boolean)
          .join(" &middot; ");
        return `
          <li>
            <span class="box" aria-hidden="true"></span>
            <span class="task">
              <span class="title">${escapeHtml(item.title)}</span>
              <span class="meta">${meta}</span>
            </span>
          </li>`;
      }).join("");
      return `
        <section class="person">
          <h2>${escapeHtml(group.name)}</h2>
          <p class="count">${group.items.length} task${group.items.length === 1 ? "" : "s"}</p>
          <ul>${rows}</ul>
          <p class="sign">Completed by ______________________  Date __________</p>
        </section>`;
    }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Assigned task lists</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 32px; }
    header { margin-bottom: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .printed { color: #555; font-size: 12px; margin: 0; }
    .person { break-inside: avoid; page-break-inside: avoid; margin-bottom: 28px; border-top: 2px solid #111; padding-top: 10px; }
    .person h2 { font-size: 16px; margin: 0; }
    .count { color: #555; font-size: 12px; margin: 2px 0 10px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; align-items: flex-start; gap: 10px; padding: 7px 0; border-bottom: 1px solid #ddd; }
    .box { width: 16px; height: 16px; border: 2px solid #333; border-radius: 3px; margin-top: 2px; flex: 0 0 auto; }
    .task { display: flex; flex-direction: column; }
    .title { font-size: 14px; font-weight: 600; }
    .meta { font-size: 11px; color: #555; }
    .sign { font-size: 12px; color: #333; margin-top: 12px; }
    .empty { color: #555; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <header>
    <h1>Assigned task lists</h1>
    <p class="printed">Printed ${escapeHtml(printedDate)}</p>
  </header>
  ${body}
</body>
</html>`;
}
