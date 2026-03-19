"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { Header } from "./header";
import { CameraFAB, CameraCaptureModal } from "@/components/features/photos/camera-capture";
import { OnlineStatus } from "@/components/ui/online-status";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { useAuth } from "@/lib/hooks/useAuth";
import type { Photo } from "@/types/database";

interface AppShellProps {
  children: React.ReactNode;
}

// Pages where the camera FAB should be hidden
const HIDDEN_FAB_PATHS = [
  "/login",
  "/signup",
  "/onboarding",
  "/photos", // Photo page has its own FAB
];

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [lastSavedPhoto, setLastSavedPhoto] = useState<Photo | null>(null);
  const [showToast, setShowToast] = useState(false);

  // Determine if FAB should be shown
  const shouldShowFAB = user && !HIDDEN_FAB_PATHS.some((path) => pathname.startsWith(path));

  // Handle photo saved - show toast notification
  const handlePhotoSaved = useCallback((photo: Photo) => {
    setLastSavedPhoto(photo);
    setShowCameraModal(false);
    setShowToast(true);

    // Auto-hide toast after 3 seconds
    setTimeout(() => setShowToast(false), 3000);
  }, []);

  return (
    <div className="flex h-screen bg-background">
      {/* PWA Online Status Banner */}
      <OnlineStatus />

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav />

      {/* Global Camera FAB */}
      {shouldShowFAB && (
        <CameraFAB onClick={() => setShowCameraModal(true)} />
      )}

      {/* Camera Capture Modal */}
      {user && (
        <CameraCaptureModal
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onPhotoSaved={handlePhotoSaved}
          userId={user.id}
          addTimestamp={true}
        />
      )}

      {/* Success Toast */}
      {showToast && lastSavedPhoto && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
          role="alert"
        >
          <div className="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm font-medium">Photo saved successfully</span>
            <button
              onClick={() => setShowToast(false)}
              className="ml-2 text-white/80 hover:text-white"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* PWA Install Prompt */}
      <InstallPrompt />
    </div>
  );
}
