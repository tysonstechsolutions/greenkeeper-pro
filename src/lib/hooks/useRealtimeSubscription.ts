// src/lib/hooks/useRealtimeSubscription.ts
"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type PostgresChangeEvent = "INSERT" | "UPDATE" | "DELETE";

interface UseRealtimeSubscriptionOptions<T> {
  table: string;
  schema?: string;
  event?: PostgresChangeEvent | "*";
  filter?: string;
  onInsert?: (payload: T) => void;
  onUpdate?: (payload: T, oldPayload: Partial<T>) => void;
  onDelete?: (oldPayload: Partial<T>) => void;
  enabled?: boolean;
}

export function useRealtimeSubscription<T extends { id: string }>({
  table,
  schema = "public",
  event = "*",
  filter,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeSubscriptionOptions<T>) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const supabase = createClient();

  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<T>) => {
      if (payload.eventType === "INSERT" && onInsert) {
        onInsert(payload.new as T);
      } else if (payload.eventType === "UPDATE" && onUpdate) {
        onUpdate(payload.new as T, payload.old as Partial<T>);
      } else if (payload.eventType === "DELETE" && onDelete) {
        onDelete(payload.old as Partial<T>);
      }
    },
    [onInsert, onUpdate, onDelete]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Create channel name
    const channelName = `${table}-realtime-${Date.now()}`;

    // Set up subscription config
    const subscriptionConfig: {
      event: PostgresChangeEvent | "*";
      schema: string;
      table: string;
      filter?: string;
    } = {
      event,
      schema,
      table,
    };

    if (filter) {
      subscriptionConfig.filter = filter;
    }

    // Subscribe
    const channel = supabase
      .channel(channelName)
      .on<T>("postgres_changes", subscriptionConfig, handleChange)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsSubscribed(true);
          console.debug(`[Realtime] Subscription active: ${table}`);
        } else if (status === "CHANNEL_ERROR") {
          setIsSubscribed(false);
          console.error(`Realtime subscription error: ${table}`);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        setIsSubscribed(false);
      }
    };
  }, [supabase, table, schema, event, filter, enabled, handleChange]);

  return {
    isSubscribed,
  };
}
