"use client";

import { WifiOff, RefreshCw, ClipboardCheck, MessageSquare, Camera, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      {/* Logo */}
      <div className="w-20 h-20 rounded-2xl bg-[#1B4332] flex items-center justify-center mb-6">
        <div className="text-center">
          <div className="text-[#B68D40] font-bold text-xl">GK</div>
          <div className="text-white text-xs">PRO</div>
        </div>
      </div>

      {/* Offline Icon */}
      <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
        <WifiOff className="w-8 h-8 text-orange-500" />
      </div>

      {/* Message */}
      <h1 className="text-2xl font-bold mb-2 text-center">You&apos;re Offline</h1>
      <p className="text-muted-foreground text-center mb-8 max-w-sm">
        It looks like you&apos;ve lost your internet connection. Don&apos;t worry —
        some features are still available offline.
      </p>

      {/* What you can still do */}
      <div className="w-full max-w-sm mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">
          What you can still do:
        </h2>
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
            <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
              <ClipboardCheck className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Update Task Status</p>
              <p className="text-xs text-muted-foreground">Changes sync when back online</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Camera className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Take Photos</p>
              <p className="text-xs text-muted-foreground">Photos saved for upload later</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
            <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Draft Messages</p>
              <p className="text-xs text-muted-foreground">Messages queued for sending</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
            <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
              <Settings className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium">View Cached Data</p>
              <p className="text-xs text-muted-foreground">Recently viewed pages available</p>
            </div>
          </div>
        </div>
      </div>

      {/* Retry button */}
      <Button onClick={handleRetry} className="gap-2">
        <RefreshCw className="w-4 h-4" />
        Try Again
      </Button>

      {/* Tip */}
      <p className="text-xs text-muted-foreground mt-8 text-center max-w-xs">
        Tip: Move to an area with better signal, or check your Wi-Fi connection.
      </p>
    </div>
  );
}
