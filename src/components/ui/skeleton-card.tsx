"use client";

import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  className?: string;
  variant?: "default" | "task" | "message" | "photo" | "stat" | "widget";
}

/**
 * Reusable skeleton card with pulse animation
 */
export function SkeletonCard({ className, variant = "default" }: SkeletonCardProps) {
  const baseClasses = "bg-card rounded-lg border border-border animate-pulse";

  switch (variant) {
    case "task":
      return (
        <div className={cn(baseClasses, "p-4", className)}>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded bg-muted flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="h-5 w-3/4 bg-muted rounded mb-2" />
              <div className="flex items-center gap-2 mb-2">
                <div className="h-4 w-16 bg-muted rounded-full" />
                <div className="h-4 w-20 bg-muted rounded-full" />
              </div>
              <div className="h-4 w-1/2 bg-muted rounded" />
            </div>
            <div className="w-6 h-6 rounded bg-muted flex-shrink-0" />
          </div>
        </div>
      );

    case "message":
      return (
        <div className={cn(baseClasses, "p-4", className)}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-3 w-16 bg-muted rounded" />
              </div>
              <div className="h-4 w-full bg-muted rounded mb-1" />
              <div className="h-4 w-2/3 bg-muted rounded" />
            </div>
          </div>
        </div>
      );

    case "photo":
      return (
        <div className={cn("aspect-square bg-muted rounded-lg animate-pulse", className)} />
      );

    case "stat":
      return (
        <div className={cn(baseClasses, "p-4", className)}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 rounded bg-muted" />
            <div className="h-4 w-20 bg-muted rounded" />
          </div>
          <div className="h-8 w-16 bg-muted rounded mb-1" />
          <div className="h-4 w-24 bg-muted rounded" />
        </div>
      );

    case "widget":
      return (
        <div className={cn(baseClasses, "p-6", className)}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-5 h-5 rounded bg-muted" />
            <div className="h-5 w-32 bg-muted rounded" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-4 w-4/5 bg-muted rounded" />
            <div className="h-4 w-3/5 bg-muted rounded" />
          </div>
        </div>
      );

    default:
      return (
        <div className={cn(baseClasses, "p-4", className)}>
          <div className="h-5 w-1/3 bg-muted rounded mb-3" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-4 w-4/5 bg-muted rounded" />
          </div>
        </div>
      );
  }
}

/**
 * Skeleton list for multiple items
 */
export function SkeletonList({
  count = 3,
  variant = "default",
  className,
}: {
  count?: number;
  variant?: SkeletonCardProps["variant"];
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} variant={variant} />
      ))}
    </div>
  );
}

/**
 * Skeleton grid for photo galleries
 */
export function SkeletonPhotoGrid({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} variant="photo" />
      ))}
    </div>
  );
}

/**
 * Skeleton stat cards row
 */
export function SkeletonStatCards({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} variant="stat" />
      ))}
    </div>
  );
}

/**
 * Generic skeleton pulse element
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-muted animate-pulse rounded", className)} />;
}
