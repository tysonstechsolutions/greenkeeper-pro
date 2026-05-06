"use client";

import { useState } from "react";
import {
  Loader2,
  Printer,
  Users,
  CalendarDays,
  CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import type { ScheduleBoard } from "@/lib/hooks/useScheduleBoard";
import { SUN_DAY_LABELS } from "@/lib/hooks/useScheduleBoard";
import {
  generatePerPersonHandouts,
  generatePerPersonWeeklyHandouts,
} from "@/lib/reports/schedule-handout-report";
import {
  generateDailyOverview,
  generateWeeklyOverview,
} from "@/lib/reports/schedule-overview-report";
import { saveBlobToDevice } from "@/lib/utils/download-blob";

interface BoardPrintMenuProps {
  board: ScheduleBoard | null;
  preparedBy?: string;
}

function formatShortDay(date: string): string {
  const d = new Date(date + "T00:00:00");
  const day = SUN_DAY_LABELS[d.getDay()];
  const monthDay = `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
  return `${day} · ${monthDay}`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BoardPrintMenu({ board, preparedBy }: BoardPrintMenuProps) {
  const [busy, setBusy] = useState(false);
  const today = todayString();

  const run = async (fn: () => { blob: Blob; filename: string }) => {
    if (!board || busy) return;
    setBusy(true);
    try {
      const { blob, filename } = fn();
      await saveBlobToDevice({ blob, filename, shareTitle: filename });
    } catch (err) {
      console.error("[print/schedule]", err);
    } finally {
      setBusy(false);
    }
  };

  const handlePerPerson = (date: string) =>
    run(() => generatePerPersonHandouts({ board: board!, date, preparedBy }));

  const handlePerPersonWeekly = () =>
    run(() => generatePerPersonWeeklyHandouts({ board: board!, preparedBy }));

  const handleDaily = (date: string) =>
    run(() => generateDailyOverview({ board: board!, date, preparedBy }));

  const handleWeekly = () =>
    run(() => generateWeeklyOverview({ board: board!, preparedBy }));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!board || busy}>
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Printer className="w-4 h-4" />
          )}
          Print
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Print schedule</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Per-person daily handouts — submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Users className="w-4 h-4" />
            Per-person daily
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-56">
              {board?.dates.map((d) => (
                <DropdownMenuItem
                  key={d}
                  onSelect={() => void handlePerPerson(d)}
                >
                  {formatShortDay(d)}
                  {d === today && (
                    <span className="ml-auto text-[10px] text-primary font-semibold">
                      TODAY
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        {/* Per-person weekly handouts — single item, prints whole week */}
        <DropdownMenuItem onSelect={() => void handlePerPersonWeekly()}>
          <Users className="w-4 h-4" />
          Per-person weekly (current week)
        </DropdownMenuItem>

        {/* Daily overview — submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CalendarDays className="w-4 h-4" />
            Daily overview
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-56">
              {board?.dates.map((d) => (
                <DropdownMenuItem
                  key={d}
                  onSelect={() => void handleDaily(d)}
                >
                  {formatShortDay(d)}
                  {d === today && (
                    <span className="ml-auto text-[10px] text-primary font-semibold">
                      TODAY
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        {/* Weekly overview — single item */}
        <DropdownMenuItem onSelect={() => void handleWeekly()}>
          <CalendarRange className="w-4 h-4" />
          Weekly overview (landscape)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
