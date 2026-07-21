"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
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
import { draftToMailto, type EmailDraft } from "@/lib/operational-work/email-draft";

interface Props {
  open: boolean;
  draft: EmailDraft | null;
  onClose: () => void;
}

const INPUT_CLASS = "text-xs font-semibold text-muted-foreground";

export function EmailDraftDialog({ open, draft, onClose }: Props) {
  const [seen, setSeen] = useState<EmailDraft | null>(draft);
  const [to, setTo] = useState(draft?.to ?? "");
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [copied, setCopied] = useState(false);

  // Re-initialize the editable fields whenever a new draft arrives (React's
  // recommended "reset state on prop change during render" pattern).
  if (draft !== seen) {
    setSeen(draft);
    setTo(draft?.to ?? "");
    setSubject(draft?.subject ?? "");
    setBody(draft?.body ?? "");
    setCopied(false);
  }

  async function copy() {
    const text = `To: ${to}\nSubject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog open={open && !!draft} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Email draft</DialogTitle>
          <DialogDescription>Review and edit, then copy it or open it in your email app. Nothing is sent for you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className={INPUT_CLASS}>To</span>
            <Input value={to} onChange={(event) => setTo(event.target.value)} placeholder="leadership@example.mil" />
          </label>
          <label className="block space-y-1.5">
            <span className={INPUT_CLASS}>Subject</span>
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className={INPUT_CLASS}>Message</span>
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} />
          </label>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={copy}>{copied ? <><Check />Copied</> : <><Copy />Copy</>}</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button asChild>
              <a href={draftToMailto({ to, subject, body })}><Mail />Open in email app</a>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
