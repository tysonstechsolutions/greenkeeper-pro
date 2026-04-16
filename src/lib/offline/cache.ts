/**
 * Offline cache using IndexedDB via `idb` library.
 * Caches Supabase query results so the app works in dead zones.
 * Write-through: reads go to cache first (if fresh), writes go to a queue.
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "greenkeeper-offline";
const DB_VERSION = 1;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  key: string;
  data: unknown;
  fetchedAt: number;
  expiresAt: number;
}

interface QueuedWrite {
  id: string;
  table: string;
  operation: "insert" | "update" | "delete";
  payload: unknown;
  createdAt: number;
  status: "pending" | "syncing" | "failed";
  retries: number;
}

interface GreenkeeperDB {
  cache: {
    key: string;
    value: CacheEntry;
  };
  writeQueue: {
    key: string;
    value: QueuedWrite;
  };
}

let dbPromise: Promise<IDBPDatabase<GreenkeeperDB>> | null = null;

/** Opens (or upgrades) the IndexedDB database with cache and writeQueue stores. */
export function initDB(): Promise<IDBPDatabase<GreenkeeperDB>> {
  if (dbPromise) return dbPromise;

  dbPromise = openDB<GreenkeeperDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("writeQueue")) {
        db.createObjectStore("writeQueue", { keyPath: "id" });
      }
    },
  });

  return dbPromise;
}

/** Returns cached data if it exists and has not expired, null otherwise. */
export async function getCached<T>(key: string): Promise<T | null> {
  const db = await initDB();
  const entry = await db.get("cache", key);

  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    // Expired -- remove stale entry and return null
    await db.delete("cache", key);
    return null;
  }

  return entry.data as T;
}

/** Stores a value in the cache with an optional TTL (default 5 minutes). */
export async function setCached(
  key: string,
  data: unknown,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<void> {
  const db = await initDB();
  const now = Date.now();

  const entry: CacheEntry = {
    key,
    data,
    fetchedAt: now,
    expiresAt: now + ttlMs,
  };

  await db.put("cache", entry);
}

/** Wipes all cached data (does not touch the write queue). */
export async function clearCache(): Promise<void> {
  const db = await initDB();
  await db.clear("cache");
}

/** Adds an operation to the offline write queue. Returns the generated ID. */
export async function queueWrite(
  table: string,
  operation: "insert" | "update" | "delete",
  payload: unknown,
): Promise<string> {
  const db = await initDB();
  const id = crypto.randomUUID();

  const entry: QueuedWrite = {
    id,
    table,
    operation,
    payload,
    createdAt: Date.now(),
    status: "pending",
    retries: 0,
  };

  await db.put("writeQueue", entry);
  return id;
}

/** Returns all writes in the queue that still have status "pending". */
export async function getPendingWrites(): Promise<QueuedWrite[]> {
  const db = await initDB();
  const all = await db.getAll("writeQueue");
  return all.filter((w) => w.status === "pending");
}

/** Removes a write from the queue (call after successful sync). */
export async function removeWrite(id: string): Promise<void> {
  const db = await initDB();
  await db.delete("writeQueue", id);
}

/** Marks a write as failed and increments its retry counter. */
export async function markWriteFailed(id: string): Promise<void> {
  const db = await initDB();
  const entry = await db.get("writeQueue", id);
  if (!entry) return;

  entry.status = "failed";
  entry.retries += 1;
  await db.put("writeQueue", entry);
}

export type { CacheEntry, QueuedWrite };
