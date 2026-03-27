"use client";

import { useEffect, useState, useCallback } from "react";
import { WifiOff, Wifi, RefreshCw, CloudOff } from "lucide-react";
import { syncQueue, getQueueCount, setupOfflineListeners } from "@/lib/utils/offline-queue";

type ConnectionStatus = "online" | "offline" | "syncing" | "synced";

interface SyncProgress {
  synced: number;
  failed: number;
  total: number;
}

export function OnlineStatus() {
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    typeof navigator !== "undefined"
      ? navigator.onLine ? "online" : "offline"
      : "online"
  );
  const [queueCount, setQueueCount] = useState(0);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [showSyncedMessage, setShowSyncedMessage] = useState(false);

  // Update queue count
  const updateQueueCount = useCallback(async () => {
    const count = await getQueueCount();
    setQueueCount(count);
  }, []);

  useEffect(() => {
    updateQueueCount(); // eslint-disable-line react-hooks/set-state-in-effect

    // Setup offline listeners
    const cleanupOfflineListeners = setupOfflineListeners();

    // Online/offline event handlers
    const handleOnline = async () => {
      setStatus("syncing");
      const result = await syncQueue();

      if (result.synced > 0) {
        setShowSyncedMessage(true);
        setTimeout(() => setShowSyncedMessage(false), 3000);
      }

      setStatus("online");
      updateQueueCount();
    };

    const handleOffline = () => {
      setStatus("offline");
    };

    // Queue change handler
    const handleQueueChange = (e: CustomEvent<{ count: number }>) => {
      setQueueCount(e.detail.count);
    };

    // Sync progress handlers
    const handleSyncStart = (e: CustomEvent<{ total: number }>) => {
      setSyncProgress({ synced: 0, failed: 0, total: e.detail.total });
    };

    const handleSyncProgress = (e: CustomEvent<SyncProgress>) => {
      setSyncProgress(e.detail);
    };

    const handleSyncComplete = (e: CustomEvent<SyncProgress>) => {
      setSyncProgress(null);
      if (e.detail.synced > 0) {
        setShowSyncedMessage(true);
        setTimeout(() => setShowSyncedMessage(false), 3000);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offlineQueueChanged", handleQueueChange as EventListener);
    window.addEventListener("offlineSyncStart", handleSyncStart as EventListener);
    window.addEventListener("offlineSyncProgress", handleSyncProgress as EventListener);
    window.addEventListener("offlineSyncComplete", handleSyncComplete as EventListener);

    return () => {
      cleanupOfflineListeners();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offlineQueueChanged", handleQueueChange as EventListener);
      window.removeEventListener("offlineSyncStart", handleSyncStart as EventListener);
      window.removeEventListener("offlineSyncProgress", handleSyncProgress as EventListener);
      window.removeEventListener("offlineSyncComplete", handleSyncComplete as EventListener);
    };
  }, [updateQueueCount]);

  // Show synced message briefly after syncing
  if (showSyncedMessage) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[60] animate-in slide-in-from-top duration-300">
        <div className="bg-green-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
          <Wifi className="w-4 h-4" />
          Back online — changes synced successfully
        </div>
      </div>
    );
  }

  // Show syncing progress
  if (status === "syncing" && syncProgress) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[60]">
        <div className="bg-blue-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Syncing... ({syncProgress.synced}/{syncProgress.total})
        </div>
        <div className="h-1 bg-blue-700">
          <div
            className="h-full bg-blue-400 transition-all duration-300"
            style={{
              width: `${syncProgress.total > 0 ? (syncProgress.synced / syncProgress.total) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
    );
  }

  // Show offline banner
  if (status === "offline") {
    return (
      <div className="fixed top-0 left-0 right-0 z-[60]">
        <div className="bg-orange-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          <span>
            You&apos;re offline
            {queueCount > 0 && ` — ${queueCount} change${queueCount !== 1 ? "s" : ""} pending`}
          </span>
        </div>
      </div>
    );
  }

  // Show pending sync badge when online but items queued
  if (status === "online" && queueCount > 0) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[60]">
        <div className="bg-yellow-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
          <CloudOff className="w-4 h-4" />
          {queueCount} offline change{queueCount !== 1 ? "s" : ""} waiting to sync
          <button
            onClick={() => syncQueue()}
            className="ml-2 px-2 py-0.5 bg-yellow-700 hover:bg-yellow-800 rounded text-xs font-medium transition-colors"
          >
            Sync Now
          </button>
        </div>
      </div>
    );
  }

  // Online with no pending items - don't show anything
  return null;
}

/**
 * Offline badge indicator for showing in nav or headers
 */
export function OfflineBadge() {
  const [queueCount, setQueueCount] = useState(0);
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  useEffect(() => {
    const updateCount = async () => {
      const count = await getQueueCount();
      setQueueCount(count);
    };
    updateCount();

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    const handleQueueChange = (e: CustomEvent<{ count: number }>) => {
      setQueueCount(e.detail.count);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offlineQueueChanged", handleQueueChange as EventListener);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offlineQueueChanged", handleQueueChange as EventListener);
    };
  }, []);

  if (!isOffline && queueCount === 0) return null;

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
        isOffline
          ? "bg-orange-500/10 text-orange-600"
          : "bg-yellow-500/10 text-yellow-600"
      }`}
    >
      {isOffline ? (
        <>
          <WifiOff className="w-3 h-3" />
          Offline
        </>
      ) : (
        <>
          <CloudOff className="w-3 h-3" />
          {queueCount} pending
        </>
      )}
    </div>
  );
}
