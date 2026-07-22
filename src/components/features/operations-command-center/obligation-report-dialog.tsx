"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadObligationReport } from "@/lib/operations/obligation-documents";

interface Props {
  open: boolean;
  obligationTitle: string;
  obligationId: string;
  onReschedule: (date: string, note: string) => Promise<void>;
  onSaved: () => void;
  onClose: () => void;
}

const ACCEPT = ".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg,.heic";

export function ObligationReportDialog({
  open,
  obligationTitle,
  obligationId,
  onReschedule,
  onSaved,
  onClose,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setInstructions("");
    setDueDate("");
    setSaving(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await uploadObligationReport({
        obligationId,
        file,
        instructions,
        dueDate: dueDate || null,
      });
      if (!saved) {
        throw new Error("The report could not be saved. Please try again.");
      }
      if (dueDate) {
        const note = instructions.trim()
          ? `Report attached: ${file?.name || "instructions"}`
          : `Rescheduled to ${dueDate}`;
        await onReschedule(dueDate, note);
      }
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The report could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Attach report / set due date</DialogTitle>
          <DialogDescription>{obligationTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Report sample (optional)</span>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground"
            />
            <span className="text-xs text-muted-foreground">Excel, PDF, Word, CSV, or a photo of the real report.</span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Instructions</span>
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="What is this report and how do you do it?"
              rows={4}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Due date</span>
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            <span className="text-xs text-muted-foreground">Setting a date reschedules this obligation to that day.</span>
          </label>
        </div>

        {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
