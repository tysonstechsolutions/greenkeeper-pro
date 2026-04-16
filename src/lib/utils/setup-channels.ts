"use client";

import { createClient } from "@/lib/supabase/client";
import type { Channel, ChannelType, UserRole } from "@/types/database";

interface DefaultChannel {
  name: string;
  description: string;
  type: ChannelType;
  roleFilter?: UserRole[]; // If specified, only add users with these roles
}

const DEFAULT_CHANNELS: DefaultChannel[] = [
  {
    name: "All Staff",
    description: "Announcements and updates for all team members",
    type: "announcement",
    // No roleFilter = all users
  },
  {
    name: "Foremen",
    description: "Discussion channel for foremen and supervisors",
    type: "role",
    roleFilter: ["foreman", "asst_super", "super", "director", "gm"],
  },
  {
    name: "Mechanics",
    description: "Equipment maintenance and repair coordination",
    type: "role",
    roleFilter: ["mechanic", "asst_super", "super", "director", "gm"],
  },
];

export interface SetupResult {
  success: boolean;
  channelsCreated: string[];
  channelsExisted: string[];
  errors: string[];
}

/**
 * Creates default channels for the course if they don't exist.
 * Should be called from settings page or on first super login.
 *
 * @param courseId - The course ID to create channels for
 * @param creatorId - The user ID creating the channels (usually super)
 * @returns SetupResult with details about what was created
 */
export async function createDefaultChannels(
  courseId: string,
  creatorId: string
): Promise<SetupResult> {
  const supabase = createClient();
  const result: SetupResult = {
    success: true,
    channelsCreated: [],
    channelsExisted: [],
    errors: [],
  };

  try {
    // Get all users for this course
    type CourseUserResult = { id: string; role: string };
    const { data: courseUsers, error: usersError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("course_id", courseId) as { data: CourseUserResult[] | null; error: Error | null };

    if (usersError) {
      result.success = false;
      result.errors.push(`Failed to fetch users: ${usersError.message}`);
      return result;
    }

    const allUsers = courseUsers || [];

    // Process each default channel
    for (const channelDef of DEFAULT_CHANNELS) {
      try {
        // Check if channel already exists
        const { data: existingChannel } = await supabase
          .from("channels")
          .select("id, name")
          .eq("course_id", courseId)
          .eq("name", channelDef.name)
          .single() as { data: { id: string; name: string } | null };

        if (existingChannel) {
          result.channelsExisted.push(channelDef.name);
          continue;
        }

        // Create the channel
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newChannel, error: createError } = await (supabase as any)
          .from("channels")
          .insert({
            course_id: courseId,
            name: channelDef.name,
            description: channelDef.description,
            channel_type: channelDef.type,
            created_by: creatorId,
            is_archived: false,
          })
          .select()
          .single() as { data: Channel | null; error: Error | null };

        if (createError || !newChannel) {
          result.errors.push(
            `Failed to create "${channelDef.name}": ${createError?.message || "Unknown error"}`
          );
          continue;
        }

        // Determine which users to add
        const usersToAdd = channelDef.roleFilter
          ? allUsers.filter((u) => channelDef.roleFilter!.includes(u.role as UserRole))
          : allUsers;

        // Add members to the channel
        if (usersToAdd.length > 0) {
          const memberInserts = usersToAdd.map((user) => ({
            channel_id: newChannel.id,
            user_id: user.id,
            role: user.id === creatorId ? "admin" : "member",
            is_muted: false,
          }));

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: membersError } = await (supabase as any)
            .from("channel_members")
            .insert(memberInserts) as { error: Error | null };

          if (membersError) {
            result.errors.push(
              `Created "${channelDef.name}" but failed to add members: ${membersError.message}`
            );
          }
        }

        result.channelsCreated.push(channelDef.name);
      } catch (err) {
        result.errors.push(
          `Unexpected error creating "${channelDef.name}": ${err instanceof Error ? err.message : "Unknown"}`
        );
      }
    }

    // If any errors occurred, mark as partial success
    if (result.errors.length > 0) {
      result.success = result.channelsCreated.length > 0;
    }

    return result;
  } catch (err) {
    result.success = false;
    result.errors.push(
      `Setup failed: ${err instanceof Error ? err.message : "Unknown error"}`
    );
    return result;
  }
}

/**
 * Checks if default channels have been set up for a course.
 *
 * @param courseId - The course ID to check
 * @returns Object with setup status
 */
export async function checkDefaultChannelsExist(
  courseId: string
): Promise<{ allExist: boolean; missing: string[] }> {
  const supabase = createClient();

  try {
    const { data: existingChannels } = await supabase
      .from("channels")
      .select("name")
      .eq("course_id", courseId)
      .in(
        "name",
        DEFAULT_CHANNELS.map((c) => c.name)
      ) as { data: { name: string }[] | null };

    const existingNames = new Set((existingChannels || []).map((c) => c.name));
    const missing = DEFAULT_CHANNELS.filter((c) => !existingNames.has(c.name)).map(
      (c) => c.name
    );

    return {
      allExist: missing.length === 0,
      missing,
    };
  } catch {
    return {
      allExist: false,
      missing: DEFAULT_CHANNELS.map((c) => c.name),
    };
  }
}

/**
 * Creates a crew channel for a specific crew.
 * Called when a new crew is created.
 *
 * @param courseId - The course ID
 * @param crewId - The crew ID
 * @param crewName - The crew name
 * @param creatorId - The user creating the channel
 * @param memberIds - Array of user IDs to add to the channel
 * @returns The created channel or null on error
 */
export async function createCrewChannel(
  courseId: string,
  crewId: string,
  crewName: string,
  creatorId: string,
  memberIds: string[]
): Promise<Channel | null> {
  const supabase = createClient();

  try {
    // Create the crew channel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: channel, error: createError } = await (supabase as any)
      .from("channels")
      .insert({
        course_id: courseId,
        name: `${crewName} Crew`,
        description: `Team channel for ${crewName} crew members`,
        channel_type: "crew" as ChannelType,
        created_by: creatorId,
        is_archived: false,
      })
      .select()
      .single() as { data: Channel | null; error: Error | null };

    if (createError || !channel) {
      console.error("Error creating crew channel:", createError);
      return null;
    }

    // Add members to the channel
    if (memberIds.length > 0) {
      const memberInserts = memberIds.map((userId) => ({
        channel_id: channel.id,
        user_id: userId,
        role: userId === creatorId ? "admin" : "member",
        is_muted: false,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: membersError } = await (supabase as any)
        .from("channel_members")
        .insert(memberInserts) as { error: Error | null };

      if (membersError) {
        console.error("Error adding crew channel members:", membersError);
        // Channel was created, but members failed - partial success
      }
    }

    return channel;
  } catch (err) {
    console.error("Unexpected error creating crew channel:", err);
    return null;
  }
}

/**
 * Syncs channel membership when crew members change.
 * Call this when adding/removing crew members.
 *
 * @param channelId - The crew channel ID
 * @param currentMemberIds - Current crew member user IDs
 * @returns Success status
 */
export async function syncCrewChannelMembers(
  channelId: string,
  currentMemberIds: string[]
): Promise<boolean> {
  const supabase = createClient();

  try {
    // Get current channel members
    type ChannelMemberResult = { user_id: string; role: string };
    const { data: existingMembers } = await supabase
      .from("channel_members")
      .select("user_id, role")
      .eq("channel_id", channelId) as { data: ChannelMemberResult[] | null };

    const existingIds = new Set((existingMembers || []).map((m) => m.user_id));
    const targetIds = new Set(currentMemberIds);

    // Find members to add
    const toAdd = currentMemberIds.filter((id) => !existingIds.has(id));

    // Find members to remove (except admins)
    const admins = new Set(
      (existingMembers || []).filter((m) => m.role === "admin").map((m) => m.user_id)
    );
    const toRemove = (existingMembers || [])
      .filter((m) => !targetIds.has(m.user_id) && !admins.has(m.user_id))
      .map((m) => m.user_id);

    // Add new members
    if (toAdd.length > 0) {
      const inserts = toAdd.map((userId) => ({
        channel_id: channelId,
        user_id: userId,
        role: "member",
        is_muted: false,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: addError } = await (supabase as any)
        .from("channel_members")
        .insert(inserts) as { error: Error | null };

      if (addError) {
        console.error("Error adding channel members:", addError);
        return false;
      }
    }

    // Remove old members
    if (toRemove.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: removeError } = await (supabase as any)
        .from("channel_members")
        .delete()
        .eq("channel_id", channelId)
        .in("user_id", toRemove) as { error: Error | null };

      if (removeError) {
        console.error("Error removing channel members:", removeError);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error("Unexpected error syncing crew channel members:", err);
    return false;
  }
}
