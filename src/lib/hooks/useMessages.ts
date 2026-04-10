"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type {
  Message,
  MessageType,
  Profile,
  Database,
} from "@/types/database";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type RealtimePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

// Message with sender profile data
export interface MessageWithSender extends Message {
  sender: Pick<Profile, "id" | "full_name" | "display_name" | "avatar_url" | "role"> | null;
}

interface UseMessagesReturn {
  messages: MessageWithSender[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  fetchMessages: (
    channelId: string,
    limit?: number,
    before?: string
  ) => Promise<MessageWithSender[]>;
  sendMessage: (
    channelId: string,
    content: string,
    type?: MessageType,
    referenceId?: string
  ) => Promise<Message | null>;
  editMessage: (id: string, newContent: string) => Promise<boolean>;
  deleteMessage: (id: string) => Promise<boolean>;
  pinMessage: (id: string) => Promise<boolean>;
  unpinMessage: (id: string) => Promise<boolean>;
  clearMessages: () => void;
}

export function useMessages(): UseMessagesReturn {
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const { user, profile, isSuper } = useAuth();

  const supabase = createClient();
  const subscription = useRef<RealtimeChannel | null>(null);

  // Fetch messages for a channel with pagination
  const fetchMessages = useCallback(
    async (
      channelId: string,
      limit = 30, // Reduced default limit for better performance
      before?: string
    ): Promise<MessageWithSender[]> => {
      if (!user) {
        setError("You must be logged in");
        return [];
      }

      // If switching channels, clear messages
      if (channelId !== currentChannelId) {
        setMessages([]);
        setHasMore(true);
        setCurrentChannelId(channelId);
      }

      setLoading(true);
      setError(null);

      try {
        const baseQuery = supabase
          .from("messages")
          .select("*")
          .eq("channel_id", channelId)
          .order("created_at", { ascending: false })
          .limit(limit);

        // For pagination - get messages before a certain timestamp
        const { data: messagesData, error: fetchError } = before
          ? await baseQuery.lt("created_at", before)
          : await baseQuery;

        if (fetchError) {
          console.error("Error fetching messages:", fetchError);
          setError(fetchError.message);
          return [];
        }

        if (!messagesData || messagesData.length === 0) {
          setHasMore(false);
          if (!before) {
            setMessages([]);
          }
          return [];
        }

        // Check if we have more messages to load
        if (messagesData.length < limit) {
          setHasMore(false);
        }

        // Get unique sender IDs
        const senderIds = [...new Set(messagesData.map((m: Message) => m.sender_id))];

        // Fetch sender profiles
        type SenderProfile = Pick<Profile, "id" | "full_name" | "display_name" | "avatar_url" | "role">;
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, display_name, avatar_url, role")
          .in("id", senderIds) as { data: SenderProfile[] | null };

        const profileMap = new Map(
          (profiles || []).map((p) => [p.id, p])
        );

        // Combine messages with sender data
        const messagesWithSenders: MessageWithSender[] = messagesData.map(
          (msg: Message) => ({
            ...msg,
            sender: profileMap.get(msg.sender_id) || null,
          })
        );

        // Reverse to show oldest first (but we queried newest first for pagination)
        messagesWithSenders.reverse();

        if (before) {
          // Prepend older messages
          setMessages((prev) => [...messagesWithSenders, ...prev]);
        } else {
          // Initial load
          setMessages(messagesWithSenders);
        }

        return messagesWithSenders;
      } catch (err) {
        console.error("Unexpected error fetching messages:", err);
        setError("An unexpected error occurred");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [user, supabase, currentChannelId]
  );

  // Send a message
  const sendMessage = useCallback(
    async (
      channelId: string,
      content: string,
      type: MessageType = "text",
      referenceId?: string
    ): Promise<Message | null> => {
      if (!user) {
        setError("You must be logged in");
        return null;
      }

      try {
        const insertData = {
          channel_id: channelId,
          sender_id: user.id,
          content,
          message_type: type,
          reference_id: referenceId || null,
          attachments: [],
          is_pinned: false,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: message, error: insertError } = await (supabase as any)
          .from("messages")
          .insert(insertData)
          .select()
          .single() as { data: Message | null; error: Error | null };

        if (insertError) {
          console.error("Error sending message:", insertError);
          setError(insertError.message);
          return null;
        }

        // Create notifications for other channel members
        // Get channel members (excluding sender)
        const { data: members } = await supabase
          .from("channel_members")
          .select("user_id")
          .eq("channel_id", channelId)
          .neq("user_id", user.id) as { data: { user_id: string }[] | null };

        if (members && members.length > 0) {
          // Get channel name for notification
          const { data: channel } = await supabase
            .from("channels")
            .select("name")
            .eq("id", channelId)
            .single() as { data: { name: string } | null };

          const senderName =
            profile?.display_name || profile?.full_name || "Someone";
          const channelName = channel?.name || "a channel";

          // Create notifications for all members
          const notifications = members.map((m) => ({
            user_id: m.user_id,
            notification_type: "message" as const,
            title: `New message in ${channelName}`,
            body: `${senderName}: ${content.substring(0, 100)}${
              content.length > 100 ? "..." : ""
            }`,
            reference_type: "channel",
            reference_id: channelId,
            is_read: false,
            push_sent: false,
          }));

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("notifications").insert(notifications);
        }

        // Note: The realtime subscription will add the message to local state
        return message;
      } catch (err) {
        console.error("Unexpected error sending message:", err);
        setError("Failed to send message");
        return null;
      }
    },
    [user, profile, supabase]
  );

  // Edit a message
  const editMessage = useCallback(
    async (id: string, newContent: string): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        // Only allow editing own messages
        const message = messages.find((m) => m.id === id);
        if (message && message.sender_id !== user.id) {
          setError("You can only edit your own messages");
          return false;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("messages")
          .update({
            content: newContent,
            edited_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("sender_id", user.id) as { error: Error | null }; // Extra safety check

        if (updateError) {
          console.error("Error editing message:", updateError);
          setError(updateError.message);
          return false;
        }

        // Update local state
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, content: newContent, edited_at: new Date().toISOString() }
              : m
          )
        );

        return true;
      } catch (err) {
        console.error("Unexpected error editing message:", err);
        setError("Failed to edit message");
        return false;
      }
    },
    [user, supabase, messages]
  );

  // Delete a message
  const deleteMessage = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        const message = messages.find((m) => m.id === id);

        // Allow deletion by sender or super
        if (message && message.sender_id !== user.id && !isSuper) {
          setError("You can only delete your own messages");
          return false;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: deleteError } = await (supabase as any)
          .from("messages")
          .delete()
          .eq("id", id) as { error: Error | null };

        if (deleteError) {
          console.error("Error deleting message:", deleteError);
          setError(deleteError.message);
          return false;
        }

        // Update local state
        setMessages((prev) => prev.filter((m) => m.id !== id));

        return true;
      } catch (err) {
        console.error("Unexpected error deleting message:", err);
        setError("Failed to delete message");
        return false;
      }
    },
    [user, isSuper, supabase, messages]
  );

  // Pin a message
  const pinMessage = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("messages")
          .update({ is_pinned: true })
          .eq("id", id) as { error: Error | null };

        if (updateError) {
          console.error("Error pinning message:", updateError);
          setError(updateError.message);
          return false;
        }

        // Update local state
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, is_pinned: true } : m))
        );

        return true;
      } catch (err) {
        console.error("Unexpected error pinning message:", err);
        setError("Failed to pin message");
        return false;
      }
    },
    [user, supabase]
  );

  // Unpin a message
  const unpinMessage = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("messages")
          .update({ is_pinned: false })
          .eq("id", id) as { error: Error | null };

        if (updateError) {
          console.error("Error unpinning message:", updateError);
          setError(updateError.message);
          return false;
        }

        // Update local state
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, is_pinned: false } : m))
        );

        return true;
      } catch (err) {
        console.error("Unexpected error unpinning message:", err);
        setError("Failed to unpin message");
        return false;
      }
    },
    [user, supabase]
  );

  // Clear messages (when switching channels)
  const clearMessages = useCallback(() => {
    setMessages([]);
    setHasMore(true);
    setCurrentChannelId(null);
  }, []);

  // Set up realtime subscription for current channel
  useEffect(() => {
    if (!user || !currentChannelId) return;

    // Clean up previous subscription
    if (subscription.current) {
      supabase.removeChannel(subscription.current);
    }

    // Subscribe to messages for this channel
    subscription.current = supabase
      .channel(`messages:${currentChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${currentChannelId}`,
        },
        async (payload: RealtimePayload) => {
          const newMessage = payload.new as Message;

          // Don't add if it's from the current user (they already saw it via optimistic UI)
          // Actually, let's still add it to ensure consistency
          // But check if we already have it
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) {
              return prev;
            }

            // Fetch sender profile
            supabase
              .from("profiles")
              .select("id, full_name, display_name, avatar_url, role")
              .eq("id", newMessage.sender_id)
              .single()
              .then(({ data: sender }: { data: MessageWithSender["sender"] }) => {
                setMessages((current) => {
                  // Double-check we haven't added it already
                  if (current.some((m) => m.id === newMessage.id)) {
                    return current;
                  }
                  return [...current, { ...newMessage, sender }];
                });
              });

            return prev;
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${currentChannelId}`,
        },
        (payload: RealtimePayload) => {
          const updatedMessage = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updatedMessage.id
                ? {
                    ...m,
                    content: updatedMessage.content,
                    edited_at: updatedMessage.edited_at,
                    is_pinned: updatedMessage.is_pinned,
                  }
                : m
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${currentChannelId}`,
        },
        (payload: RealtimePayload) => {
          const deletedMessage = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== deletedMessage.id));
        }
      )
      .subscribe();

    // Cleanup on unmount or channel change
    return () => {
      if (subscription.current) {
        supabase.removeChannel(subscription.current);
      }
    };
  }, [user, currentChannelId, supabase]);

  return {
    messages,
    loading,
    error,
    hasMore,
    fetchMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    pinMessage,
    unpinMessage,
    clearMessages,
  };
}
