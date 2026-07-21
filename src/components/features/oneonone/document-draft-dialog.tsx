"use client";

import { useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
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
import { buildDocumentPrintHtml, type FollowUpDocument } from "@/lib/documents/follow-up-document";

interface Props {
  open: boolean;
  draft: FollowUpDocument | null;
  onClose: () => void;
}

export function DocumentDraftDialog({ open, draft, onClose }: Props) {
  const [seen, setSeen] = useState<FollowUpDocument | null>(draft);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [copied, setCopied] = useState(false);

  if (draft !== seen) {
    setSeen(draft);
    setTitle(draft?.title ?? "");
    setBody(draft?.body ?? "");
    setCopied(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function print() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(buildDocumentPrintHtml(title, body));
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <Dialog open={open && !!draft} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Document draft</DialogTitle>
          <DialogDescription>Edit anything you like, then print it or copy it. This is a starting draft — review it before use.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Title</span>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Document</span>
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={18} className="font-mono text-xs" />
          </label>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={copy}>{copied ? <><Check />Copied</> : <><Copy />Copy</>}</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={print}><Printer />Print</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
