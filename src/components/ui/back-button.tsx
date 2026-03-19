"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  href?: string;
  label?: string;
  className?: string;
}

export function BackButton({ href, label = "Back", className }: BackButtonProps) {
  const router = useRouter();

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex items-center justify-center gap-2 text-sm font-medium h-9 px-3 rounded-md transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-accent",
          className
        )}
      >
        <ArrowLeft className="w-4 h-4" />
        {label}
      </Link>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => router.back()}
      className={cn("gap-2 text-muted-foreground hover:text-foreground", className)}
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Button>
  );
}

interface DetailPageHeaderProps {
  backHref?: string;
  backLabel?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function DetailPageHeader({
  backHref,
  backLabel,
  title,
  subtitle,
  actions,
  className,
}: DetailPageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      <BackButton href={backHref} label={backLabel} className="mb-4" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
