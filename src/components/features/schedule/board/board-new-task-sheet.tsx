"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Save, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ScheduleBoard,
  CrewProfile,
} from "@/lib/hooks/useScheduleBoard";
import type { TaskCategory, TaskPriority } from "@/types/database";
import { cn } from "@/lib/utils";

const PRIORITIES: { value: TaskPriority; label: string; color: string }[] = [
  { value: "critical", label: "Critical", color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30" },
  { value: "high", label: "High", color: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30" },
  { value: "normal", label: "Normal", color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30" },
  { value: "low", label: "Low", color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30" },
];

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: "mowing", label: "Mowing" },
  { value: "greens", label: "Greens" },
  { value: "bunker", label: "Bunker" },
  { value: "mechanical", label: "Mechanical" },
  { value: "landscaping", label: "Landscaping" },
  { value: "construction", label: "Construction" },
  { value: "admin", label: "Admin" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Other" },
];

export interface NewTaskSubmission {
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  assigned_to: string;
  due_date: string;
  estimated_minutes: number | null;
}

interface BoardNewTaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: ScheduleBoard | null;
  /** Pre-fill the assignee — comes from empty-cell click, otherwise null. */
  defaultUserId?: string | null;
  /** Pre-fill the date — same. Falls back to first date in board. */
  defaultDate?: string | null;
  onSubmit: (data: NewTaskSubmission) => Promise<boolean>;
}

/**
 * Quick-add sheet for creating a one-off task directly from the schedule
 * page. Skips the long /tasks/new form — only the fields we need to drop
 * a task on the grid. There's a "Need more options" deep link to the full
 * form for everything else.
 */
export function BoardNewTaskSheet({
  open,
  onOpenChange,
  board,
  defaultUserId,
  defaultDate,
  onSubmit,
}: BoardNewTaskSheetProps) {
  // Use board.dates fallback for the date and first crew member for assignee.
  const initialDate = defaultDate ?? board?.dates[0] ?? "";
  const initialUserId = defaultUserId ?? board?.crew[0]?.id ?? "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col"
      >
        <SheetTitle className="sr-only">New task</SheetTitle>
        <SheetDescription className="sr-only">
          Create a one-off task assigned to a crew member and date.
        </SheetDescription>

        {board && open && (
          <NewTaskForm
            // Fresh form each time the sheet opens (key forces remount).
            key={`${initialUserId}|${initialDate}|${open}`}
            crew={board.crew}
            dates={board.dates}
            initialUserId={initialUserId}
            initialDate={initialDate}
            onSubmit={async (data) => {
              const ok = await onSubmit(data);
              if (ok) onOpenChange(false);
              return ok;
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface NewTaskFormProps {
  crew: CrewProfile[];
  dates: string[];
  initialUserId: string;
  initialDate: string;
  onSubmit: (data: NewTaskSubmission) => Promise<boolean>;
  onCancel: () => void;
}

function NewTaskForm({
  crew,
  dates,
  initialUserId,
  initialDate,
  onSubmit,
  onCancel,
}: NewTaskFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TaskCategory>("other");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [assignee, setAssignee] = useState<string>(initialUserId);
  const [date, setDate] = useState<string>(initialDate);
  const [estMinutes, setEstMinutes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!assignee) {
      setError("Assignee is required");
      return;
    }
    if (!date) {
      setError("Date is required");
      return;
    }
    const mins = estMinutes.trim() === "" ? null : parseInt(estMinutes, 10);
    if (mins != null && (Number.isNaN(mins) || mins < 0)) {
      setError("Estimated minutes must be a non-negative number");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        category,
        priority,
        assigned_to: assignee,
        due_date: date,
        estimated_minutes: mins,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-sm font-semibold">New task</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Quick-add — drops a task directly on the schedule.
        </div>
      </div>

      <div className="px-4 py-4 flex-1 overflow-y-auto space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-task-title">Title *</Label>
          <Input
            id="new-task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Mow Greens — HOC 0.125 inch"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-task-assignee">Assignee *</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="new-task-assignee">
                <SelectValue placeholder="Pick crew" />
              </SelectTrigger>
              <SelectContent>
                {crew.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.display_name || c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-task-date">Date *</Label>
            <Input
              id="new-task-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={dates[0]}
              max={dates[dates.length - 1]}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Priority</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {PRIORITIES.map((p) => {
              const active = priority === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-medium border transition-colors",
                    active
                      ? p.color
                      : "bg-background text-muted-foreground border-border hover:bg-accent/30",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-task-category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as TaskCategory)}
            >
              <SelectTrigger id="new-task-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-task-est">Est. minutes</Label>
            <Input
              id="new-task-est"
              type="number"
              inputMode="numeric"
              min={0}
              value={estMinutes}
              onChange={(e) => setEstMinutes(e.target.value)}
              placeholder="e.g. 90"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-task-desc">Description (optional)</Label>
          <Input
            id="new-task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Free text — instructions, hazards, gotchas"
          />
        </div>

        {error && <div className="text-xs text-destructive">{error}</div>}

        <Link
          href="/tasks/new"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          Need more options (full form)
        </Link>
      </div>

      <div className="px-4 py-3 border-t border-border flex flex-col gap-2">
        <Button onClick={handleSubmit} disabled={submitting} className="w-full">
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Add task
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={submitting} className="w-full">
          Cancel
        </Button>
      </div>
    </div>
  );
}
