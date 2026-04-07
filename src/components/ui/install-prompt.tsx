"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window !== "undefined") {
      return isInStandaloneMode();
    }
    return false;
  });
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  useEffect(() => {
    // If already installed (standalone mode), do nothing
    if (isInstalled) return;

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      if (Date.now() - dismissedTime < DISMISS_DURATION) {
        return;
      }
    }

    // iOS: Show custom prompt since beforeinstallprompt doesn't fire
    if (isIOS()) {
      // Delay showing on iOS to not interrupt initial page load
      const timer = setTimeout(() => {
        setShowIOSPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Android/Desktop: Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setShowIOSPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [isInstalled]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === "accepted") {
        setShowPrompt(false);
        setDeferredPrompt(null);
      }
    } catch (error) {
      console.error("Install prompt error:", error);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShowPrompt(false);
    setShowIOSPrompt(false);
  };

  // Don't render if installed
  if (isInstalled) return null;

  // iOS prompt
  if (showIOSPrompt) {
    return (
      <div className="fixed bottom-[calc(88px+env(safe-area-inset-bottom,0px))] left-3 right-3 z-50 md:left-auto md:right-4 md:bottom-4 md:max-w-sm animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-card border border-border rounded-2xl shadow-xl shadow-black/10 p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center flex-shrink-0 shadow-md">
              <Leaf className="w-6 h-6 text-[#D4A853]" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-[15px]">Install VMGC</h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Tap <Share className="w-3 h-3 inline -mt-0.5 text-blue-500" /> then &quot;Add to Home Screen&quot; to install
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="p-1.5 hover:bg-muted active:bg-muted/80 rounded-lg -mt-1 -mr-1"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismiss}
              className="flex-1 h-10 rounded-xl"
            >
              Maybe Later
            </Button>
            <Link href="/install" className="flex-1">
              <Button
                size="sm"
                className="w-full gap-1.5 h-10 rounded-xl"
                onClick={handleDismiss}
              >
                <Share className="w-3.5 h-3.5" />
                How to Install
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Android/Desktop prompt (native install available)
  if (!showPrompt || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-[calc(88px+env(safe-area-inset-bottom,0px))] left-3 right-3 z-50 md:left-auto md:right-4 md:bottom-4 md:max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border rounded-2xl shadow-xl shadow-black/10 p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center flex-shrink-0 shadow-md">
            <Leaf className="w-6 h-6 text-[#D4A853]" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[15px]">Install VMGC</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Add to your home screen for instant, full-screen access
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="p-1.5 hover:bg-muted active:bg-muted/80 rounded-lg -mt-1 -mr-1"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDismiss}
            className="flex-1 h-10 rounded-xl"
          >
            Maybe Later
          </Button>
          <Button
            size="sm"
            onClick={handleInstall}
            className="flex-1 gap-1.5 h-10 rounded-xl"
          >
            <Download className="w-3.5 h-3.5" />
            Install App
          </Button>
        </div>
      </div>
    </div>
  );
}
