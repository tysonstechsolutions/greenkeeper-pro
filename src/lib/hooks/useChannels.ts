"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import {
  directDeleteByFilter,
  directInsertRow,
  directInsertRows,
  directPatchByFilter,
  directSelectList,
  directSelectRow,
} from "@/lib/supabase/rest";
import type {
  Channel,
  ChannelMember,
  ChannelType,
  Profile,
  Database,
} from "@/types/database";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// Channel with unread count and last message info
export interface ChannelWithDetails extends Channel {
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  member_count: number;
}

interface UseChannelsReturn {
  channels: ChannelWithDetails[];
  totalUnread: number;
  loading: boolean;
  error: string | null;
  fetchChannels: () => Promise<ChannelWithDetails[]>;
  createChannel: (
    name: string,
    type: ChannelType,
    memberIds: string[]
  ) => Promise<Channel | null>;
  createDirectChannel: (otherUserId: string) => Promise<Channel | null>;
  updateChannel: (
    id: string,
    data: { name?: string; description?: string }
  ) => Promise<boolean>;
  deleteChannel: (id: string) => Promise<boolean>;
  addMembers: (channelId: string, userIds: string[]) => Promise<boolean>;
  removeMember: (channelId: string, userId: string) => Promise<boolean>;
  markAsRead: (channelId: string) => Promise<boolean>;
  getChannel: (id: string) => ChannelWithDetails | undefined;
}

export function useChannels(): UseChannelsReturn {
  const [channels, setChannels] = useState<ChannelWithDetails[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, profile, isSuper } = useAuth();

  const supabase = createClient();
  const channelsSubscription = useRef<RealtimeChannel | null>(null);
  const messagesSubscription = useRef<RealtimeChannel | null>(null);

  // Fetch all channels the user belongs to
  const fetchChannels = useCallback(async (): Promise<ChannelWithDetails[]> => {
    if (!user) {
      setChannels([]);
      setTotalUnread(0);
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      // Get channels the user is a member of (direct REST — wedge-resistant)
      const memberData = await directSelectList<{
        channel_id: string;
        last_read_at: string | null;
      }>("channel_members", {
        columns: "channel_id,last_read_at",
        filters: [`user_id=eq.${encodeURIComponent(user.id)}`],
        label: "useChannels.fetchMemberships",
      });

      if (memberData.length === 0) {
        setChannels([]);
        setTotalUnread(0);
        setLoading(false);
        return [];
      }

      const channelIds = memberData.map((m) => m.channel_id);
      const lastReadMap = new Map(memberData.map((m) => [m.channel_id, m.last_read_at]));

      const topChannelIds = channelIds.slice(0, 20); // Limit to 20 channels
      const inList = `(${topChannelIds.map((id) => encodeURIComponent(id)).join(",")})`;

      // THREE PARALLEL BATCHED QUERIES — see prior comment for rationale.
      const [channelsData, recentMessages, allMemberships] = await Promise.all([
        directSelectList<Channel>("channels", {
          columns: "*",
          filters: [`id=in.${inList}`, `is_active=eq.true`],
          label: "useChannels.fetchChannels",
        }),
        directSelectList<{
          channel_id: string;
          content: string | null;
          created_at: string;
          sender_id: string;
        }>("messages", {
          columns: "channel_id,content,created_at,sender_id",
          filters: [`channel_id=in.${inList}`],
          orderBy: [{ column: "created_at", ascending: false }],
          limit: 500,
          label: "useChannels.fetchRecentMessages",
        }),
        directSelectList<{ channel_id: string }>("channel_members", {
          columns: "channel_id",
          filters: [`channel_id=in.${inList}`],
          label: "useChannels.fetchAllMemberships",
        }),
      ]);

      // Partition recent messages by channel_id.
      const messagesByChannel = new Map<
        string,
        Array<{ content: string | null; created_at: string; sender_id: string }>
      >();
      for (const m of recentMessages) {
        let list = messagesByChannel.get(m.channel_id);
        if (!list) {
          list = [];
          messagesByChannel.set(m.channel_id, list);
        }
        list.push({
          content: m.content,
          created_at: m.created_at,
          sender_id: m.sender_id,
        });
      }

      // Count memberships by channel_id.
      const memberCountByChannel = new Map<string, number>();
      for (const m of allMemberships) {
        memberCountByChannel.set(
          m.channel_id,
          (memberCountByChannel.get(m.channel_id) ?? 0) + 1,
        );
      }

      const channelsWithDetails: ChannelWithDetails[] = channelsData.map((channel) => {
        const msgs = messagesByChannel.get(channel.id) ?? [];
        const lastMessage = msgs[0]; // Already sorted by created_at DESC
        const lastReadAt = lastReadMap.get(channel.id);
        const unreadCount = lastReadAt
          ? msgs.filter((m) => m.created_at > lastReadAt && m.sender_id !== user.id).length
          : 0;

        return {
          ...channel,
          unread_count: unreadCount,
          last_message_at: lastMessage?.created_at ?? null,
          last_message_preview: lastMessage?.content
            ? lastMessage.content.substring(0, 50) +
              (lastMessage.content.length > 50 ? "..." : "")
            : null,
          member_count: memberCountByChannel.get(channel.id) ?? 0,
        };
      });

      // Sort by last message (most recent first)
      channelsWithDetails.sort((a, b) => {
        if (!a.last_message_at && !b.last_message_at) return 0;
        if (!a.last_message_at) return 1;
        if (!b.last_message_at) return -1;
        return (
          new Date(b.last_message_at).getTime() -
          new Date(a.last_message_at).getTime()
        );
      });

      setChannels(channelsWithDetails);
      setTotalUnread(
        channelsWithDetails.reduce((sum, c) => sum + c.unread_count, 0)
      );

      return channelsWithDetails;
    } catch (err) {
      console.error("Unexpected error fetching channels:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Create a new channel
  const createChannel = useCallback(
    async (
      name: string,
      type: ChannelType,
      memberIds: string[]
    ): Promise<Channel | null> => {
      if (!user) {
        setError("You must be logged in");
        return null;
      }

      try {
        // Create the channel
        const insertData = {
          name,
          channel_type: type,
          created_by: user.id,
          is_active: true,
          description: null,
        };

        const channel = await directInsertRow<Channel>(
          "channels",
          insertData,
          "useChannels.createChannel",
        );

        // Add creator as member
        const allMemberIds = [...new Set([user.id, ...memberIds])];
        const memberInserts = allMemberIds.map((userId) => ({
          channel_id: channel.id,
          user_id: userId,
          muted: false,
        }));

        try {
          await directInsertRows(
            "channel_members",
            memberInserts,
            "useChannels.createChannel.addMembers",
          );
        } catch (membersError) {
          console.error("Error adding channel members:", membersError);
          // Don't fail the whole operation, channel was created
        }

        // Refresh channels list
        await fetchChannels();

        return channel;
      } catch (err) {
        console.error("Unexpected error creating channel:", err);
        setError(err instanceof Error ? err.message : "Failed to create channel");
        return null;
      }
    },
    [user, fetchChannels]
  );

  // Create or find direct message channel
  const createDirectChannel = useCallback(
    async (otherUserId: string): Promise<Channel | null> => {
      if (!user || !profile) {
        setError("You must be logged in");
        return null;
      }

      try {
        // Check if DM channel already exists between these users
        const existingChannels = await directSelectList<{ id: string }>(
          "channels",
          {
            columns: "id",
            filters: [`channel_type=eq.direct`, `is_active=eq.true`],
            label: "useChannels.createDirectChannel.findExisting",
          },
        );

        for (const channel of existingChannels) {
          // Check if both users are members
          const members = await directSelectList<{ user_id: string }>(
            "channel_members",
            {
              columns: "user_id",
              filters: [`channel_id=eq.${encodeURIComponent(channel.id)}`],
              label: "useChannels.createDirectChannel.checkMembers",
            },
          );

          if (members.length === 2) {
            const memberIds = members.map((m) => m.user_id);
            if (
              memberIds.includes(user.id) &&
              memberIds.includes(otherUserId)
            ) {
              // Found existing DM channel
              const existingChannel = channels.find(
                (c) => c.id === channel.id
              );
              if (existingChannel) {
                return existingChannel;
              }

              // Fetch the channel details
              const data = await directSelectRow<Channel>(
                "channels",
                "id",
                channel.id,
                "*",
                "useChannels.createDirectChannel.fetchExisting",
              );
              return data;
            }
          }
        }

        // Get other user's name for channel name
        const otherProfile = await directSelectRow<{
          full_name: string | null;
          display_name: string | null;
        }>(
          "profiles",
          "id",
          otherUserId,
          "full_name,display_name",
          "useChannels.createDirectChannel.fetchOtherProfile",
        );

        const otherName =
          otherProfile?.display_name || otherProfile?.full_name || "User";
        const myName = profile.display_name || profile.full_name || "User";
        const channelName = `${myName} & ${otherName}`;

        // Create new DM channel
        const insertData = {
          name: channelName,
          channel_type: "direct",
          created_by: user.id,
          is_active: true,
          description: null,
        };

        const channel = await directInsertRow<Channel>(
          "channels",
          insertData,
          "useChannels.createDirectChannel.create",
        );

        // Add both users as members
        try {
          await directInsertRows(
            "channel_members",
            [
              { channel_id: channel.id, user_id: user.id, muted: false },
              { channel_id: channel.id, user_id: otherUserId, muted: false },
            ],
            "useChannels.createDirectChannel.addMembers",
          );
        } catch (membersError) {
          console.error("Error adding DM members:", membersError);
        }

        // Refresh channels
        await fetchChannels();

        return channel;
      } catch (err) {
        console.error("Unexpected error creating DM channel:", err);
        setError(err instanceof Error ? err.message : "Failed to create direct message");
        return null;
      }
    },
    [user, profile, channels, fetchChannels]
  );

  // Update channel
  const updateChannel = useCallback(
    async (
      id: string,
      data: { name?: string; description?: string }
    ): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        await directPatchByFilter(
          "channels",
          [`id=eq.${encodeURIComponent(id)}`],
          data,
          "useChannels.updateChannel",
        );

        // Update local state
        setChannels((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...data } : c))
        );

        return true;
      } catch (err) {
        console.error("Unexpected error updating channel:", err);
        setError(err instanceof Error ? err.message : "Failed to update channel");
        return false;
      }
    },
    [user]
  );

  // Delete channel (super only)
  const deleteChannel = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user || !isSuper) {
        setError("Only superintendents can delete channels");
        return false;
      }

      try {
        // Soft delete - just mark as inactive
        await directPatchByFilter(
          "channels",
          [`id=eq.${encodeURIComponent(id)}`],
          { is_active: false },
          "useChannels.deleteChannel",
        );

        // Update local state
        setChannels((prev) => prev.filter((c) => c.id !== id));

        return true;
      } catch (err) {
        console.error("Unexpected error deleting channel:", err);
        setError(err instanceof Error ? err.message : "Failed to delete channel");
        return false;
      }
    },
    [user, isSuper]
  );

  // Add members to channel
  const addMembers = useCallback(
    async (channelId: string, userIds: string[]): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        // Upsert via raw POST with Prefer: resolution=merge-duplicates +
        // an on_conflict query param. Going direct to PostgREST keeps us
        // off supabase-js's wedge-prone auth wrapper.
        const memberInserts = userIds.map((userId) => ({
          channel_id: channelId,
          user_id: userId,
          muted: false,
        }));
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
        let token = "";
        try {
          const keys = Object.keys(localStorage).filter((k) =>
            k.includes("auth-token"),
          );
          for (const k of keys) {
            const v = JSON.parse(localStorage.getItem(k) ?? "null");
            if (v?.access_token) {
              token = v.access_token;
              break;
            }
          }
        } catch {
          // SSR/no localStorage — falls back to anon role.
        }
        const res = await fetch(
          `${supabaseUrl}/rest/v1/channel_members?on_conflict=channel_id,user_id`,
          {
            method: "POST",
            headers: {
              apikey: anonKey,
              Authorization: token ? `Bearer ${token}` : `Bearer ${anonKey}`,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(memberInserts),
          },
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(
            `useChannels.addMembers failed: ${res.status} ${body.slice(0, 200)}`,
          );
        }

        // Refresh channels to update member counts
        await fetchChannels();

        return true;
      } catch (err) {
        console.error("Unexpected error adding members:", err);
        setError(err instanceof Error ? err.message : "Failed to add members");
        return false;
      }
    },
    [user, fetchChannels]
  );

  // Remove member from channel
  const removeMember = useCallback(
    async (channelId: string, userId: string): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        await directDeleteByFilter(
          "channel_members",
          [
            `channel_id=eq.${encodeURIComponent(channelId)}`,
            `user_id=eq.${encodeURIComponent(userId)}`,
          ],
          "useChannels.removeMember",
        );

        // If user removed themselves, refresh to remove channel from list
        if (userId === user.id) {
          await fetchChannels();
        } else {
          // Just update member count
          setChannels((prev) =>
            prev.map((c) =>
              c.id === channelId
                ? { ...c, member_count: Math.max(0, c.member_count - 1) }
                : c
            )
          );
        }

        return true;
      } catch (err) {
        console.error("Unexpected error removing member:", err);
        setError(err instanceof Error ? err.message : "Failed to remove member");
        return false;
      }
    },
    [user, fetchChannels]
  );

  // Mark channel as read
  const markAsRead = useCallback(
    async (channelId: string): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        const now = new Date().toISOString();

        await directPatchByFilter(
          "channel_members",
          [
            `channel_id=eq.${encodeURIComponent(channelId)}`,
            `user_id=eq.${encodeURIComponent(user.id)}`,
          ],
          { last_read_at: now },
          "useChannels.markAsRead",
        );

        // Update local state
        setChannels((prev) => {
          const updated = prev.map((c) =>
            c.id === channelId ? { ...c, unread_count: 0 } : c
          );
          setTotalUnread(updated.reduce((sum, c) => sum + c.unread_count, 0));
          return updated;
        });

        return true;
      } catch (err) {
        console.error("Unexpected error marking as read:", err);
        setError(err instanceof Error ? err.message : "Failed to mark as read");
        return false;
      }
    },
    [user]
  );

  // Get channel by ID
  const getChannel = useCallback(
    (id: string): ChannelWithDetails | undefined => {
      return channels.find((c) => c.id === id);
    },
    [channels]
  );

  // Set up realtime subscriptions
  useEffect(() => {
    if (!user) return;

    // Subscribe to channels table changes
    channelsSubscription.current = supabase
      .channel("channels-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channels",
        },
        () => {
          // Refetch channels on any change
          fetchChannels();
        }
      )
      .subscribe();

    // Subscribe to messages for unread count updates
    messagesSubscription.current = supabase
      .channel("messages-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const newMessage = payload.new as { channel_id: string; sender_id: string; content: string; created_at: string };

          // Update the channel's last message and unread count
          setChannels((prev) => {
            const updated = prev.map((c) => {
              if (c.id === newMessage.channel_id) {
                return {
                  ...c,
                  last_message_at: newMessage.created_at,
                  last_message_preview:
                    newMessage.content.substring(0, 50) +
                    (newMessage.content.length > 50 ? "..." : ""),
                  // Only increment unread if message is from someone else
                  unread_count:
                    newMessage.sender_id !== user.id
                      ? c.unread_count + 1
                      : c.unread_count,
                };
              }
              return c;
            });

            // Re-sort by last message
            updated.sort((a, b) => {
              if (!a.last_message_at && !b.last_message_at) return 0;
              if (!a.last_message_at) return 1;
              if (!b.last_message_at) return -1;
              return (
                new Date(b.last_message_at).getTime() -
                new Date(a.last_message_at).getTime()
              );
            });

            setTotalUnread(updated.reduce((sum, c) => sum + c.unread_count, 0));

            return updated;
          });
        }
      )
      .subscribe();

    // Cleanup on unmount
    return () => {
      if (channelsSubscription.current) {
        supabase.removeChannel(channelsSubscription.current);
      }
      if (messagesSubscription.current) {
        supabase.removeChannel(messagesSubscription.current);
      }
    };
  }, [user, supabase, fetchChannels]);

  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchChannels();
    }
  }, [user, fetchChannels]);

  return {
    channels,
    totalUnread,
    loading,
    error,
    fetchChannels,
    createChannel,
    createDirectChannel,
    updateChannel,
    deleteChannel,
    addMembers,
    removeMember,
    markAsRead,
    getChannel,
  };
}
