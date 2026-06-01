"use client";

import { useState, useEffect } from "react";
import {
  Smartphone,
  Share,
  Plus,
  MoreVertical,
  Download,
  CheckCircle2,
  Leaf,
  ArrowDown,
  Monitor,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/lib/hooks/usePwaInstall";

type Platform = "ios" | "android" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function InstallPage() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [installed, setInstalled] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [installing, setInstalling] = useState(false);
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();

  useEffect(() => {
    // Defer to next tick to avoid the cascading-render warning while
    // still reading window-only APIs on the client after mount.
    const id = requestAnimationFrame(() => {
      setPlatform(detectPlatform());
      setInstalled(isStandalone());
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const handleNativeInstall = async () => {
    setInstalling(true);
    const outcome = await promptInstall();
    setInstalling(false);
    if (outcome === "accepted") setInstalled(true);
  };

  if (installed || isInstalled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-xl font-bold mb-2">Already Installed!</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          You&apos;re already using VMGC as an app. You&apos;re all set.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 max-w-lg mx-auto">
      {/* Hero */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center shadow-lg mx-auto mb-4">
          <Leaf className="w-10 h-10 text-[#D4A853]" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">Install VMGC</h1>
        <p className="text-sm text-muted-foreground">
          Add VMGC to your home screen for instant access — no app store needed.
        </p>
      </div>

      {/* Benefits */}
      <div className="gk-card p-4 mb-6">
        <h2 className="text-sm font-semibold mb-3">Why install?</h2>
        <div className="space-y-3">
          {[
            { text: "Opens instantly — no browser chrome", icon: "fast" },
            { text: "Works offline on the course", icon: "offline" },
            { text: "Push notifications for tasks & messages", icon: "notify" },
            { text: "Quick access from your home screen", icon: "home" },
          ].map((benefit) => (
            <div key={benefit.text} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
              </div>
              <span className="text-sm">{benefit.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* One-tap native install (Android / desktop Chrome / Edge). Only
          rendered when the browser actually fired beforeinstallprompt, so it
          never shows a button that can't do anything. */}
      {canInstall && (
        <div className="gk-card p-4 mb-6 text-center">
          <p className="text-sm font-medium mb-3">
            Your browser supports one-tap install.
          </p>
          <Button
            onClick={handleNativeInstall}
            disabled={installing}
            className="w-full h-11 gap-2"
          >
            {installing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Installing…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Install VMGC
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Or follow the manual steps below.
          </p>
        </div>
      )}

      {/* Platform-specific instructions */}
      {(platform === "ios" || showAll) && (
        <InstallInstructions
          platform="ios"
          defaultOpen={platform === "ios"}
        />
      )}

      {(platform === "android" || showAll) && (
        <InstallInstructions
          platform="android"
          defaultOpen={platform === "android"}
        />
      )}

      {(platform === "desktop" || showAll) && (
        <InstallInstructions
          platform="desktop"
          defaultOpen={platform === "desktop"}
        />
      )}

      {!showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full text-center text-sm text-primary font-medium py-3 active:opacity-70"
        >
          Show instructions for all devices
        </button>
      )}

      {/* Help text */}
      <div className="text-center mt-8">
        <p className="text-xs text-muted-foreground/60">
          Having trouble? Ask your superintendent for help, or visit this page on your phone.
        </p>
        <p className="text-xs text-muted-foreground/40 mt-2">
          URL: vmgc-greenkeeper.vercel.app/install
        </p>
      </div>
    </div>
  );
}

function InstallInstructions({
  platform,
  defaultOpen,
}: {
  platform: "ios" | "android" | "desktop";
  defaultOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const configs = {
    ios: {
      title: "iPhone / iPad",
      subtitle: "Safari browser required",
      icon: Smartphone,
      steps: [
        {
          number: 1,
          title: "Open in Safari",
          description: "Make sure you're viewing this page in Safari (not Chrome or another browser). Safari is the only browser that supports installing web apps on iOS.",
          visual: (
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl text-sm text-blue-700 dark:text-blue-300">
              <span className="font-mono text-xs bg-white dark:bg-blue-900 px-2 py-1 rounded">vmgc-greenkeeper.vercel.app</span>
            </div>
          ),
        },
        {
          number: 2,
          title: "Tap the Share button",
          description: "Look for the share icon at the bottom of Safari (square with an arrow pointing up).",
          visual: (
            <div className="flex items-center justify-center gap-3 p-4 bg-muted/50 rounded-xl">
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-white shadow-md">
                <Share className="w-6 h-6" />
              </div>
              <ArrowDown className="w-5 h-5 text-muted-foreground animate-bounce" />
              <span className="text-sm font-medium">Bottom toolbar</span>
            </div>
          ),
        },
        {
          number: 3,
          title: 'Scroll down and tap "Add to Home Screen"',
          description: "Scroll through the share menu options until you see it.",
          visual: (
            <div className="p-3 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Add to Home Screen</span>
              </div>
            </div>
          ),
        },
        {
          number: 4,
          title: 'Tap "Add"',
          description: "Confirm by tapping Add in the top-right corner. VMGC will appear on your home screen.",
          visual: (
            <div className="flex items-center justify-center p-4 bg-muted/50 rounded-xl">
              <div className="px-6 py-2 bg-blue-500 text-white rounded-lg font-semibold text-sm shadow-md">
                Add
              </div>
            </div>
          ),
        },
      ],
    },
    android: {
      title: "Android Phone",
      subtitle: "Chrome browser recommended",
      icon: Smartphone,
      steps: [
        {
          number: 1,
          title: "Open in Chrome",
          description: "Open this page in Google Chrome for the best experience.",
          visual: null,
        },
        {
          number: 2,
          title: "Tap the three-dot menu",
          description: "Look for the three dots (⋮) in the top-right corner of Chrome.",
          visual: (
            <div className="flex items-center justify-center gap-3 p-4 bg-muted/50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center shadow-sm">
                <MoreVertical className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium">Top-right corner</span>
            </div>
          ),
        },
        {
          number: 3,
          title: 'Tap "Install app" or "Add to Home screen"',
          description: "The wording varies by Android version. Look for either option in the menu.",
          visual: (
            <div className="p-3 bg-muted/50 rounded-xl space-y-2">
              <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
                <Download className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Install app</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
                <Plus className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Add to Home screen</span>
              </div>
            </div>
          ),
        },
        {
          number: 4,
          title: "Confirm install",
          description: "Tap Install on the confirmation dialog. The app will be added to your home screen and app drawer.",
          visual: (
            <div className="flex items-center justify-center p-4 bg-muted/50 rounded-xl">
              <div className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-semibold text-sm shadow-md">
                Install
              </div>
            </div>
          ),
        },
      ],
    },
    desktop: {
      title: "Desktop Computer",
      subtitle: "Chrome or Edge browser",
      icon: Monitor,
      steps: [
        {
          number: 1,
          title: "Look for the install icon",
          description: "In Chrome or Edge, look for a small install icon in the address bar (right side). It may look like a monitor with a download arrow.",
          visual: null,
        },
        {
          number: 2,
          title: "Click Install",
          description: "Click the install icon, then confirm by clicking Install in the popup. The app opens in its own window.",
          visual: null,
        },
      ],
    },
  };

  const config = configs[platform];
  const Icon = config.icon;

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-card rounded-xl border border-border active:bg-muted/30 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm">{config.title}</p>
            <p className="text-xs text-muted-foreground">{config.subtitle}</p>
          </div>
        </div>
        <ChevronRight
          className={`w-5 h-5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="mt-2 space-y-4 pl-2">
          {config.steps.map((step) => (
            <div key={step.number} className="flex gap-3">
              {/* Step number */}
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
                {step.number}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm mb-1">{step.title}</h3>
                <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                  {step.description}
                </p>
                {step.visual}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
