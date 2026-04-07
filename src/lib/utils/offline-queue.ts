/**
 * Offline Queue Utility
 *
 * Manages offline actions in IndexedDB, syncs when back online.
 * Handles task updates, checklist toggles, photo captures, and notes.
 */

import { openDB, DBSchema, IDBPDatabase } from "idb";
import { createClient } from "@/lib/supabase/client";

// Action types that can be queued
export type OfflineAction =
  | "task_status_update"
  | "task_start"
  | "task_complete"
  | "checklist_toggle"
  | "photo_capture"
  | "note_add"
  | "message_send";

// Queued item structure
export interface QueuedItem {
  id: string;
  action: OfflineAction;
  table: string;
  data: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
  blobData?: Blob; // For photos
}

// IndexedDB schema
interface OfflineQueueDB extends DBSchema {
  queue: {
    key: string;
    value: QueuedItem;
    indexes: { "by-timestamp": number };
  };
  photos: {
    key: string;
    value: {
      id: string;
      blob: Blob;
      metadata: Record<string, unknown>;
      timestamp: number;
    };
  };
}

const DB_NAME = "vmgc-offline-queue";
const DB_VERSION = 1;

let db: IDBPDatabase<OfflineQueueDB> | null = null;

/**
 * Initialize the IndexedDB database
 */
async function getDB(): Promise<IDBPDatabase<OfflineQueueDB>> {
  if (db) return db;

  db = await openDB<OfflineQueueDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Create queue store
      if (!database.objectStoreNames.contains("queue")) {
        const queueStore = database.createObjectStore("queue", { keyPath: "id" });
        queueStore.createIndex("by-timestamp", "timestamp");
      }
      // Create photos store for blob data
      if (!database.objectStoreNames.contains("photos")) {
        database.createObjectStore("photos", { keyPath: "id" });
      }
    },
  });

  return db;
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if online
 */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/**
 * Add item to offline queue
 */
export async function queueAction(
  action: OfflineAction,
  table: string,
  data: Record<string, unknown>,
  blobData?: Blob
): Promise<string> {
  const database = await getDB();

  const item: QueuedItem = {
    id: generateId(),
    action,
    table,
    data,
    timestamp: Date.now(),
    retryCount: 0,
    blobData,
  };

  // Store photo blob separately if present
  if (blobData) {
    await database.put("photos", {
      id: item.id,
      blob: blobData,
      metadata: data,
      timestamp: item.timestamp,
    });
    // Remove blob from queue item (store reference only)
    delete item.blobData;
  }

  await database.put("queue", item);

  // Dispatch event for UI updates
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("offlineQueueChanged", {
        detail: { count: await getQueueCount() },
      })
    );
  }

  return item.id;
}

/**
 * Get all queued items
 */
export async function getQueuedItems(): Promise<QueuedItem[]> {
  const database = await getDB();
  return database.getAllFromIndex("queue", "by-timestamp");
}

/**
 * Get queue count
 */
export async function getQueueCount(): Promise<number> {
  const database = await getDB();
  return database.count("queue");
}

/**
 * Remove item from queue
 */
export async function removeFromQueue(id: string): Promise<void> {
  const database = await getDB();
  await database.delete("queue", id);
  await database.delete("photos", id);

  // Dispatch event for UI updates
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("offlineQueueChanged", {
        detail: { count: await getQueueCount() },
      })
    );
  }
}

/**
 * Clear entire queue
 */
export async function clearQueue(): Promise<void> {
  const database = await getDB();
  await database.clear("queue");
  await database.clear("photos");

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("offlineQueueChanged", { detail: { count: 0 } })
    );
  }
}

/**
 * Process a single queued item
 */
async function processQueueItem(item: QueuedItem): Promise<boolean> {
  const supabase = createClient();

  try {
    switch (item.action) {
      case "task_status_update":
      case "task_start":
      case "task_complete": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from(item.table)
          .update(item.data)
          .eq("id", item.data.id as string) as { error: Error | null };
        if (error) throw error;
        break;
      }

      case "checklist_toggle": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from(item.table)
          .update({ completed: item.data.completed })
          .eq("id", item.data.id as string) as { error: Error | null };
        if (error) throw error;
        break;
      }

      case "photo_capture": {
        // Get photo blob from photos store
        const database = await getDB();
        const photoData = await database.get("photos", item.id);

        if (photoData?.blob) {
          // Upload photo to storage
          const fileName = `offline_${item.id}_${Date.now()}.jpg`;
          const path = `photos/${item.data.course_id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("photos")
            .upload(path, photoData.blob, {
              contentType: "image/jpeg",
            });

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: urlData } = supabase.storage
            .from("photos")
            .getPublicUrl(path);

          // Insert photo record
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: insertError } = await (supabase as any)
            .from("course_photos")
            .insert({
              ...item.data,
              photo_url: urlData.publicUrl,
            }) as { error: Error | null };

          if (insertError) throw insertError;
        }
        break;
      }

      case "note_add": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from(item.table).insert(item.data) as { error: Error | null };
        if (error) throw error;
        break;
      }

      case "message_send": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("messages").insert(item.data) as { error: Error | null };
        if (error) throw error;
        break;
      }

      default:
        console.warn(`Unknown action type: ${item.action}`);
        return false;
    }

    return true;
  } catch (error) {
    console.error(`Failed to process queue item ${item.id}:`, error);
    return false;
  }
}

/**
 * Sync all queued items when back online
 */
export async function syncQueue(): Promise<{
  synced: number;
  failed: number;
  total: number;
}> {
  if (!isOnline()) {
    return { synced: 0, failed: 0, total: 0 };
  }

  const items = await getQueuedItems();
  const total = items.length;
  let synced = 0;
  let failed = 0;

  // Dispatch sync start event
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("offlineSyncStart", { detail: { total } })
    );
  }

  // Process items in order
  for (const item of items) {
    const success = await processQueueItem(item);

    if (success) {
      await removeFromQueue(item.id);
      synced++;
    } else {
      // Update retry count
      const database = await getDB();
      item.retryCount++;

      // Remove after 3 failed attempts
      if (item.retryCount >= 3) {
        await removeFromQueue(item.id);
        failed++;
      } else {
        await database.put("queue", item);
      }
    }

    // Dispatch progress event
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("offlineSyncProgress", {
          detail: { synced, failed, total },
        })
      );
    }
  }

  // Dispatch sync complete event
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("offlineSyncComplete", {
        detail: { synced, failed, total },
      })
    );
  }

  return { synced, failed, total };
}

/**
 * Setup online/offline event listeners
 */
export function setupOfflineListeners(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleOnline = async () => {
    console.info("[OfflineQueue] Back online, syncing queue...");
    await syncQueue();
  };

  const handleOffline = () => {
    console.info("[OfflineQueue] Gone offline, queue mode active");
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

/**
 * Hook-friendly helpers for common offline operations
 */
export const offlineQueue = {
  // Queue a task status update
  async updateTaskStatus(taskId: string, status: string, data?: Record<string, unknown>) {
    if (isOnline()) {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("tasks")
        .update({ status, ...data })
        .eq("id", taskId) as { error: Error | null };
      if (error) throw error;
      return { queued: false };
    }

    await queueAction("task_status_update", "tasks", {
      id: taskId,
      status,
      ...data,
    });
    return { queued: true };
  },

  // Queue a task start
  async startTask(taskId: string) {
    const data = {
      id: taskId,
      status: "in_progress",
      started_at: new Date().toISOString(),
    };

    if (isOnline()) {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("tasks").update(data).eq("id", taskId) as { error: Error | null };
      if (error) throw error;
      return { queued: false };
    }

    await queueAction("task_start", "tasks", data);
    return { queued: true };
  },

  // Queue a task completion
  async completeTask(taskId: string) {
    const data = {
      id: taskId,
      status: "completed",
      completed_at: new Date().toISOString(),
    };

    if (isOnline()) {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("tasks").update(data).eq("id", taskId) as { error: Error | null };
      if (error) throw error;
      return { queued: false };
    }

    await queueAction("task_complete", "tasks", data);
    return { queued: true };
  },

  // Queue a checklist item toggle
  async toggleChecklistItem(itemId: string, completed: boolean) {
    const data = { id: itemId, completed };

    if (isOnline()) {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("task_checklist_items")
        .update({ completed })
        .eq("id", itemId) as { error: Error | null };
      if (error) throw error;
      return { queued: false };
    }

    await queueAction("checklist_toggle", "task_checklist_items", data);
    return { queued: true };
  },

  // Queue a photo capture
  async capturePhoto(
    photoBlob: Blob,
    metadata: {
      course_id: string;
      zone_id?: string;
      task_id?: string;
      caption?: string;
      taken_by: string;
    }
  ) {
    if (isOnline()) {
      const supabase = createClient();
      const fileName = `photo_${Date.now()}.jpg`;
      const path = `photos/${metadata.course_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(path, photoBlob, { contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("photos").getPublicUrl(path);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any).from("course_photos").insert({
        ...metadata,
        photo_url: urlData.publicUrl,
      }) as { error: Error | null };

      if (insertError) throw insertError;
      return { queued: false };
    }

    await queueAction("photo_capture", "course_photos", metadata, photoBlob);
    return { queued: true };
  },

  // Queue a note/comment
  async addNote(
    taskId: string,
    content: string,
    authorId: string
  ) {
    const data = {
      task_id: taskId,
      content,
      author_id: authorId,
      created_at: new Date().toISOString(),
    };

    if (isOnline()) {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("task_notes").insert(data) as { error: Error | null };
      if (error) throw error;
      return { queued: false };
    }

    await queueAction("note_add", "task_notes", data);
    return { queued: true };
  },
};
