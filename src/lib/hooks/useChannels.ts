"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
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
      // Get channels the user is a member of
       
      const { data: memberData, error: memberError } = await supabase.from("channel_members")
        .select("channel_id, last_read_at")
        .eq("user_id", user.id);

      if (memberError) {
        console.error("Error fetching channel memberships:", memberError);
        setError(memberError.message);
        return [];
      }

      if (!memberData || memberData.length === 0) {
        setChannels([]);
        setTotalUnread(0);
        setLoading(false);
        return [];
      }

      const channelIds = memberData.map((m: { channel_id: string; last_read_at: string | null }) => m.channel_id);
      const lastReadMap = new Map(
        memberData.map((m: { channel_id: string; last_read_at: string | null }) => [m.channel_id, m.last_read_at])
      );

      const topChannelIds = channelIds.slice(0, 20); // Limit to 20 channels

      // THREE PARALLEL BATCHED QUERIES instead of 3 per channel (was 60
      // requests for 20 channels — debug log showed ~100 firing on
      // dashboard boot). Recent messages are fetched once and partitioned
      // client-side, and member count comes from the already-loaded
      // membership rows for rare channels + a single aggregate query
      // otherwise.
      const [
        { data: channelsData, error: channelsError },
        { data: recentMessages },
        { data: allMemberships },
      ] = await Promise.all([
        supabase.from("channels")
          .select("*")
          .in("id", topChannelIds)
          .eq("is_active", true),
        // Fetch the N most-recent messages across all visible channels in
        // one query. 500 is well beyond what a chatty 20-channel group
        // should need for "last message" + unread detection on the
        // dashboard badge. If a user is severely behind, the unread count
        // is floored at 500 — acceptable UI behavior.
        supabase.from("messages")
          .select("channel_id, content, created_at, sender_id")
          .in("channel_id", topChannelIds)
          .order("created_at", { ascending: false })
          .limit(500),
        // One query for every membership row across the user's channels.
        // Rows are tiny (channel_id + user_id) so this is fast even with
        // big channels; aggregation happens client-side below.
        supabase.from("channel_members")
          .select("channel_id")
          .in("channel_id", topChannelIds),
      ]);

      if (channelsError) {
        console.error("Error fetching channels:", channelsError);
        setError(channelsError.message);
        return [];
      }

      // Partition recent messages by channel_id.
      const messagesByChannel = new Map<string, Array<{ content: string | null; created_at: string; sender_id: string }>>();
      for (const m of (recentMessages || []) as Array<{ channel_id: string; content: string | null; created_at: string; sender_id: string }>) {
        let list = messagesByChannel.get(m.channel_id);
        if (!list) {
          list = [];
          messagesByChannel.set(m.channel_id, list);
        }
        list.push({ content: m.content, created_at: m.created_at, sender_id: m.sender_id });
      }

      // Count memberships by channel_id.
      const memberCountByChannel = new Map<string, number>();
      for (const m of (allMemberships || []) as Array<{ channel_id: string }>) {
        memberCountByChannel.set(m.channel_id, (memberCountByChannel.get(m.channel_id) ?? 0) + 1);
      }

      const channelsWithDetails: ChannelWithDetails[] = (channelsData || []).map((channel: Channel) => {
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
      setError("An unexpected error occurred");
      return [];
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

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

         
        const { data: channel, error: insertError } = await supabase.from("channels")
          .insert(insertData)
          .select()
          .single();

        if (insertError) {
          console.error("Error creating channel:", insertError);
          setError(insertError.message);
          return null;
        }

        // Add creator as member
        const allMemberIds = [...new Set([user.id, ...memberIds])];
        const memberInserts = allMemberIds.map((userId) => ({
          channel_id: channel.id,
          user_id: userId,
          muted: false,
        }));

         
        const { error: membersError } = await supabase.from("channel_members")
          .insert(memberInserts);

        if (membersError) {
          console.error("Error adding channel members:", membersError);
          // Don't fail the whole operation, channel was created
        }

        // Refresh channels list
        await fetchChannels();

        return channel;
      } catch (err) {
        console.error("Unexpected error creating channel:", err);
        setError("Failed to create channel");
        return null;
      }
    },
    [user, supabase, fetchChannels]
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
         
        const { data: existingChannels } = await supabase.from("channels")
          .select("id")
          .eq("channel_type", "direct")
          .eq("is_active", true);

        if (existingChannels) {
          for (const channel of existingChannels as { id: string }[]) {
            // Check if both users are members
             
            const { data: members } = await supabase.from("channel_members")
              .select("user_id")
              .eq("channel_id", channel.id);

            if (members && members.length === 2) {
              const memberIds = (members as { user_id: string }[]).map((m) => m.user_id);
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
                 
                const { data } = await supabase.from("channels")
                  .select("*")
                  .eq("id", channel.id)
                  .single();

                return data;
              }
            }
          }
        }

        // Get other user's name for channel name
         
        const { data: otherProfile } = await supabase.from("profiles")
          .select("full_name, display_name")
          .eq("id", otherUserId)
          .single();

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

         
        const { data: channel, error: insertError } = await supabase.from("channels")
          .insert(insertData)
          .select()
          .single();

        if (insertError) {
          console.error("Error creating DM channel:", insertError);
          setError(insertError.message);
          return null;
        }

        // Add both users as members
         
        const { error: membersError } = await supabase.from("channel_members")
          .insert([
            { channel_id: channel.id, user_id: user.id, muted: false },
            { channel_id: channel.id, user_id: otherUserId, muted: false },
          ]);

        if (membersError) {
          console.error("Error adding DM members:", membersError);
        }

        // Refresh channels
        await fetchChannels();

        return channel;
      } catch (err) {
        console.error("Unexpected error creating DM channel:", err);
        setError("Failed to create direct message");
        return null;
      }
    },
    [user, profile, supabase, channels, fetchChannels]
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
         
        const { error: updateError } = await supabase.from("channels")
          .update(data)
          .eq("id", id);

        if (updateError) {
          console.error("Error updating channel:", updateError);
          setError(updateError.message);
          return false;
        }

        // Update local state
        setChannels((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...data } : c))
        );

        return true;
      } catch (err) {
        console.error("Unexpected error updating channel:", err);
        setError("Failed to update channel");
        return false;
      }
    },
    [user, supabase]
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
         
        const { error: deleteError } = await supabase.from("channels")
          .update({ is_active: false })
          .eq("id", id);

        if (deleteError) {
          console.error("Error deleting channel:", deleteError);
          setError(deleteError.message);
          return false;
        }

        // Update local state
        setChannels((prev) => prev.filter((c) => c.id !== id));

        return true;
      } catch (err) {
        console.error("Unexpected error deleting channel:", err);
        setError("Failed to delete channel");
        return false;
      }
    },
    [user, isSuper, supabase]
  );

  // Add members to channel
  const addMembers = useCallback(
    async (channelId: string, userIds: string[]): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        const memberInserts = userIds.map((userId) => ({
          channel_id: channelId,
          user_id: userId,
          muted: false,
        }));

         
        const { error: insertError } = await supabase.from("channel_members")
          .upsert(memberInserts, {
            onConflict: "channel_id,user_id",
          });

        if (insertError) {
          console.error("Error adding members:", insertError);
          setError(insertError.message);
          return false;
        }

        // Refresh channels to update member counts
        await fetchChannels();

        return true;
      } catch (err) {
        console.error("Unexpected error adding members:", err);
        setError("Failed to add members");
        return false;
      }
    },
    [user, supabase, fetchChannels]
  );

  // Remove member from channel
  const removeMember = useCallback(
    async (channelId: string, userId: string): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
         
        const { error: deleteError } = await supabase.from("channel_members")
          .delete()
          .eq("channel_id", channelId)
          .eq("user_id", userId);

        if (deleteError) {
          console.error("Error removing member:", deleteError);
          setError(deleteError.message);
          return false;
        }

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
        setError("Failed to remove member");
        return false;
      }
    },
    [user, supabase, fetchChannels]
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

         
        const { error: updateError } = await supabase.from("channel_members")
          .update({ last_read_at: now })
          .eq("channel_id", channelId)
          .eq("user_id", user.id);

        if (updateError) {
          console.error("Error marking as read:", updateError);
          setError(updateError.message);
          return false;
        }

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
        setError("Failed to mark as read");
        return false;
      }
    },
    [user, supabase]
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
