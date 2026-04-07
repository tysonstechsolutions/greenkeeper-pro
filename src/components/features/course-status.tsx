"use client";

import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Sun,
  Snowflake,
  Car,
  CloudRain,
  Flag,
  XCircle,
  Clock,
  ChevronDown,
  Check,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCourseStatus,
  courseStatusLabels,
  courseStatusColors,
  type CourseStatusType,
} from "@/lib/hooks/useCourseStatus";
import { cn } from "@/lib/utils";

const statusIcons: Record<CourseStatusType, React.ComponentType<{ className?: string }>> = {
  open: Sun,
  frost_delay: Snowflake,
  cart_path_only: Car,
  lift_clean_place: CloudRain,
  temporary_greens: Flag,
  closed: XCircle,
};

interface CourseStatusBannerProps {
  className?: string;
  showUpdateButton?: boolean;
}

export function CourseStatusBanner({
  className,
  showUpdateButton = false,
}: CourseStatusBannerProps) {
  const { courseStatus, loading, canUpdateStatus } = useCourseStatus();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (loading || !courseStatus) {
    return (
      <div className={cn("h-14 bg-muted animate-pulse rounded-lg", className)} />
    );
  }

  const colors = courseStatusColors[courseStatus.status];
  const Icon = statusIcons[courseStatus.status];
  const label = courseStatusLabels[courseStatus.status];

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3 rounded-lg border",
        colors.bg,
        colors.border,
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={cn("p-2 rounded-full shrink-0", colors.bg)}>
          <Icon className={cn("w-5 h-5", colors.text)} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("font-semibold", colors.text)}>{label}</span>
            {courseStatus.status === "frost_delay" && courseStatus.estimated_open_time && (
              <Badge variant="outline" className={cn("text-xs", colors.text, colors.border)}>
                <Clock className="w-3 h-3 mr-1" />
                Est. open: {courseStatus.estimated_open_time}
              </Badge>
            )}
          </div>
          {courseStatus.message && (
            <p className="text-sm text-muted-foreground truncate">{courseStatus.message}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {courseStatus.updated_by_name && (
          <span className="text-xs text-muted-foreground hidden lg:block whitespace-nowrap">
            Updated {formatDistanceToNow(new Date(courseStatus.updated_at), { addSuffix: true })}
          </span>
        )}

        {showUpdateButton && canUpdateStatus && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Update Status</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <CourseStatusEditor onClose={() => setIsDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

interface CourseStatusEditorProps {
  onClose?: () => void;
}

export function CourseStatusEditor({ onClose }: CourseStatusEditorProps) {
  const { courseStatus, updateCourseStatus } = useCourseStatus();
  const [selectedStatus, setSelectedStatus] = useState<CourseStatusType>(
    courseStatus?.status || "open"
  );
  const [message, setMessage] = useState(courseStatus?.message || "");
  const [estimatedTime, setEstimatedTime] = useState(
    courseStatus?.estimated_open_time || ""
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const success = await updateCourseStatus(
      selectedStatus,
      message,
      selectedStatus === "frost_delay" ? estimatedTime : undefined
    );
    setSaving(false);
    if (success && onClose) {
      onClose();
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Update Course Status</DialogTitle>
        <DialogDescription>
          Set the current course status. This will be visible to all staff including the pro shop.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {/* Status Selection */}
        <div className="space-y-2">
          <Label>Status</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  {(() => {
                    const Icon = statusIcons[selectedStatus];
                    const colors = courseStatusColors[selectedStatus];
                    return (
                      <>
                        <Icon className={cn("w-4 h-4", colors.text)} />
                        {courseStatusLabels[selectedStatus]}
                      </>
                    );
                  })()}
                </span>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              {(Object.keys(courseStatusLabels) as CourseStatusType[]).map((status) => {
                const Icon = statusIcons[status];
                const colors = courseStatusColors[status];
                return (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    className="flex items-center gap-2"
                  >
                    <Icon className={cn("w-4 h-4", colors.text)} />
                    <span>{courseStatusLabels[status]}</span>
                    {selectedStatus === status && (
                      <Check className="w-4 h-4 ml-auto" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Estimated Open Time (for frost delay) */}
        {selectedStatus === "frost_delay" && (
          <div className="space-y-2">
            <Label htmlFor="estimatedTime">Estimated Open Time</Label>
            <Input
              id="estimatedTime"
              type="time"
              value={estimatedTime}
              onChange={(e) => setEstimatedTime(e.target.value)}
              placeholder="e.g., 9:00 AM"
            />
          </div>
        )}

        {/* Optional Message */}
        <div className="space-y-2">
          <Label htmlFor="message">Message (optional)</Label>
          <Input
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g., Heavy frost expected until 9 AM"
          />
          <p className="text-xs text-muted-foreground">
            Add context or special instructions
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Update Status"}
        </Button>
      </DialogFooter>
    </>
  );
}

// Compact badge version for widgets
interface CourseStatusBadgeProps {
  className?: string;
}

export function CourseStatusBadge({ className }: CourseStatusBadgeProps) {
  const { courseStatus, loading } = useCourseStatus();

  if (loading || !courseStatus) {
    return <Badge variant="outline" className={cn("animate-pulse", className)}>Loading...</Badge>;
  }

  const colors = courseStatusColors[courseStatus.status];
  const Icon = statusIcons[courseStatus.status];
  const label = courseStatusLabels[courseStatus.status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1",
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
}
