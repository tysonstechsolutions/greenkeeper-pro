"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  /**
   * Fallback URL if there's nowhere to go back to in browser history
   * (e.g. the user opened this page from a bookmark / QR deeplink).
   * When history IS available, router.back() is preferred because it
   * preserves any query-string filters the previous page was using —
   * otherwise tapping Back would strip ?status=unverified etc. and the
   * user loses their list filter every time they open an item.
   */
  href?: string;
  label?: string;
  className?: string;
}

export function BackButton({ href, label = "Back", className }: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    // Prefer browser history — this preserves the filter query string
    // on the previous page. Only use the static href when there IS no
    // previous entry (length 1 means we were the first page loaded).
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    if (href) {
      router.push(href);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={cn(
        "gap-2 text-muted-foreground hover:text-foreground",
        className
      )}
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
