import {
  Inbox,
  Send,
  ShieldCheck,
  ShoppingCart,
  PackageCheck,
  CheckCircle2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { PrAuditReviewStatus } from "@/types/database";

/** A distinct symbol for each lifecycle stage (builder-style). */
export const STAGE_ICON: Record<PrAuditReviewStatus, LucideIcon> = {
  pending: Inbox,
  sent_up: Send,
  approved: ShieldCheck,
  ordered: ShoppingCart,
  received: PackageCheck,
  receipt_signed: CheckCircle2,
  sent_back: Undo2,
};
