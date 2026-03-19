"use client";

import Link from "next/link";
import { type LucideIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
  variant?: "default" | "compact";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  variant = "default",
}: EmptyStateProps) {
  const isCompact = variant === "compact";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isCompact ? "py-8 px-4" : "py-16 px-6",
        className
      )}
    >
      <div
        className={cn(
          "rounded-full bg-muted flex items-center justify-center",
          isCompact ? "w-12 h-12 mb-3" : "w-16 h-16 mb-4"
        )}
      >
        <Icon
          className={cn(
            "text-muted-foreground",
            isCompact ? "w-6 h-6" : "w-8 h-8"
          )}
        />
      </div>
      <h3
        className={cn(
          "font-semibold text-foreground",
          isCompact ? "text-base mb-1" : "text-lg mb-2"
        )}
      >
        {title}
      </h3>
      <p
        className={cn(
          "text-muted-foreground max-w-sm",
          isCompact ? "text-sm mb-4" : "text-sm mb-6"
        )}
      >
        {description}
      </p>
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className={cn(
              "inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground font-medium transition-colors hover:bg-primary/90",
              isCompact ? "text-sm h-9 px-3" : "h-10 px-4"
            )}
          >
            <Plus className="w-4 h-4 mr-2" />
            {action.label}
          </Link>
        ) : action.onClick ? (
          <Button onClick={action.onClick} size={isCompact ? "sm" : "default"}>
            <Plus className="w-4 h-4 mr-2" />
            {action.label}
          </Button>
        ) : null
      )}
    </div>
  );
}
