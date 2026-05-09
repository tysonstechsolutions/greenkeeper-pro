"use client";

import { useState, useRef, useCallback } from "react";
import {
  CheckCircle2,
  Camera,
  Loader2,
  X,
  AlertTriangle,
  Image as ImageIcon,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { InlineCamera } from "@/components/ui/inline-camera";

export interface ResolveIssueResult {
  /** URLs of photos uploaded as resolution proof. */
  photos: string[];
  /** Notes describing what was done. */
  notes: string;
}

interface ResolveIssueDialogProps {
  open: boolean;
  /** Title shown in the dialog header — e.g. "Resolve Hole 3 Issue". */
  title: string;
  /** Issue title shown for context. */
  issueTitle: string;
  /** Photo upload function — accepts a File, returns the public URL. */
  uploadPhoto: (file: File) => Promise<string | null>;
  /** Submit handler invoked when the user confirms — should call status="resolved" + persist photos/notes. */
  onResolve: (result: ResolveIssueResult) => Promise<void> | void;
  /** Close without resolving. */
  onCancel: () => void;
}

/**
 * Dialog that captures resolution photos and notes before flipping an
 * observation to "resolved". The same component is used by hole and green
 * issue detail pages; the parent does the actual database write so it can
 * also update its local state.
 */
export function ResolveIssueDialog({
  open,
  title,
  issueTitle,
  uploadPhoto,
  onResolve,
  onCancel,
}: ResolveIssueDialogProps) {
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [uploadingCount, setUploadingCount] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPhotoUrls([]);
    setNotes("");
    setUploadingCount(0);
    setShowCamera(false);
    setSubmitting(false);
    setError(null);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploadingCount((c) => c + 1);
      try {
        const url = await uploadPhoto(file);
        if (url) {
          setPhotoUrls((prev) => [...prev, url]);
        } else {
          setError("Photo upload failed. Please try again.");
        }
      } catch (err) {
        console.error("Resolution photo upload error:", err);
        setError("Photo upload failed. Please try again.");
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    },
    [uploadPhoto],
  );

  const handleFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  const handleRemovePhoto = useCallback((url: string) => {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (photoUrls.length === 0) {
      setError("Add at least one resolution photo before resolving.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onResolve({ photos: photoUrls, notes: notes.trim() });
      // Reset only after a successful submission. The parent closes the dialog.
      reset();
    } catch (err) {
      console.error("Resolve issue error:", err);
      setError("Failed to mark resolved. Please try again.");
      setSubmitting(false);
    }
  }, [photoUrls, notes, onResolve, reset]);

  const handleCancel = useCallback(() => {
    if (submitting || uploadingCount > 0) return;
    reset();
    onCancel();
  }, [submitting, uploadingCount, reset, onCancel]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) handleCancel();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              {title}
            </DialogTitle>
            <DialogDescription>
              Take a photo of the area as proof the issue is fixed. Photos and
              notes will be saved to the Resolution History so you can prove
              what was done.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted/40 rounded-lg">
              <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">
                Issue
              </p>
              <p className="text-sm font-medium">{issueTitle}</p>
            </div>

            {/* Photo grid */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                Resolution Photos
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({photoUrls.length} added{uploadingCount > 0 ? `, ${uploadingCount} uploading…` : ""})
                </span>
              </Label>

              {photoUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photoUrls.map((url) => (
                    <div
                      key={url}
                      className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
                    >
                      <img
                        src={url}
                        alt="Resolution proof"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(url)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80"
                        aria-label="Remove photo"
                      >
                        <Trash2 className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={submitting}
                  onClick={() => setShowCamera(true)}
                >
                  <Camera className="w-3.5 h-3.5" />
                  Take Photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={submitting}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  From Gallery
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFilePicked}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="resolution-notes">
                Notes (what was done)
              </Label>
              <Textarea
                id="resolution-notes"
                rows={3}
                placeholder="e.g. Hand-pulled moss patches, pencil-tine vented, topdressed with kiln-dried sand, slit-seeded with bentgrass."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={submitting || uploadingCount > 0}
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button
              className="bg-emerald-700 hover:bg-emerald-600"
              onClick={handleSubmit}
              disabled={submitting || uploadingCount > 0 || photoUrls.length === 0}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              {submitting ? "Resolving…" : "Mark Resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InlineCamera
        open={showCamera}
        onCapture={(file) => {
          setShowCamera(false);
          handleFile(file);
        }}
        onClose={() => setShowCamera(false)}
      />
    </>
  );
}
