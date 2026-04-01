"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type {
  CommunityPost,
  CommunityComment,
  CommunityPostType,
} from "@/types/member";

interface UseCommunityReturn {
  posts: CommunityPost[];
  loading: boolean;
  fetchPosts: (filter?: CommunityPostType | "all") => Promise<CommunityPost[]>;
  createPost: (
    postType: CommunityPostType,
    content: string,
    photoUrl?: string,
    pollQuestion?: string,
    pollOptions?: string[]
  ) => Promise<{ success: boolean; error: string | null }>;
  likePost: (postId: string) => Promise<boolean>;
  unlikePost: (postId: string) => Promise<boolean>;
  voteOnPoll: (postId: string, option: string) => Promise<boolean>;
  fetchComments: (postId: string) => Promise<CommunityComment[]>;
  addComment: (postId: string, content: string) => Promise<boolean>;
  pinPost: (postId: string, isPinned: boolean) => Promise<boolean>;
}

export function useCommunity(): UseCommunityReturn {
  const supabase = createClient();
  const { profile, isSuper, isAsstSuper, isPro } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(false);

  const canPostOfficial = isSuper || isAsstSuper || isPro;

  // Fetch community posts with optional filter
  const fetchPosts = useCallback(
    async (filter?: CommunityPostType | "all"): Promise<CommunityPost[]> => {
      setLoading(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from("community_posts")
        .select(
          `
          *,
          author:profiles!community_posts_author_id_fkey(full_name, avatar_url, role),
          member_info:member_registrations!community_posts_author_id_fkey(member_type)
        `
        )
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);

      if (filter && filter !== "all") {
        query = query.eq("post_type", filter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching posts:", error);
        setLoading(false);
        return [];
      }

      // Get user likes and votes if logged in
      let postsWithUserData = (data || []) as CommunityPost[];

      if (profile) {
        // Get user's likes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: userLikes } = await (supabase as any)
          .from("community_likes")
          .select("post_id")
          .eq("user_id", profile.id);

        const likedPostIds = new Set((userLikes || []).map((l: { post_id: string }) => l.post_id));

        // Get user's poll votes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: userVotes } = await (supabase as any)
          .from("poll_votes")
          .select("post_id, option")
          .eq("user_id", profile.id);

        const votesByPost = new Map<string, string>(
          (userVotes || []).map((v: { post_id: string; option: string }) => [v.post_id, v.option])
        );

        postsWithUserData = postsWithUserData.map((post) => ({
          ...post,
          user_has_liked: likedPostIds.has(post.id),
          user_vote: votesByPost.get(post.id) ?? null,
        })) as CommunityPost[];
      }

      setPosts(postsWithUserData);
      setLoading(false);
      return postsWithUserData;
    },
    [supabase, profile]
  );

  // Create a new post
  const createPost = useCallback(
    async (
      postType: CommunityPostType,
      content: string,
      photoUrl?: string,
      pollQuestion?: string,
      pollOptions?: string[]
    ): Promise<{ success: boolean; error: string | null }> => {
      if (!profile) {
        return { success: false, error: "Please sign in to post" };
      }

      // Only super/asst_super/pro can create official or poll posts
      if ((postType === "official" || postType === "poll") && !canPostOfficial) {
        return { success: false, error: "You don't have permission to create this type of post" };
      }

      const isOfficial = postType === "official" || (canPostOfficial && postType === "poll");

      const postData: Record<string, unknown> = {
        author_id: profile.id,
        post_type: postType,
        content,
        photo_url: photoUrl || null,
        is_official: isOfficial,
        is_pinned: false,
        likes_count: 0,
        comments_count: 0,
      };

      if (postType === "poll" && pollQuestion && pollOptions) {
        postData.poll_question = pollQuestion;
        postData.poll_options = pollOptions;
        postData.poll_votes = pollOptions.reduce((acc, opt) => {
          acc[opt] = 0;
          return acc;
        }, {} as Record<string, number>);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("community_posts").insert(postData);

      if (error) {
        console.error("Error creating post:", error);
        return { success: false, error: "Failed to create post" };
      }

      await fetchPosts();
      return { success: true, error: null };
    },
    [supabase, profile, canPostOfficial, fetchPosts]
  );

  // Like a post
  const likePost = useCallback(
    async (postId: string): Promise<boolean> => {
      if (!profile) return false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("community_likes").insert({
        post_id: postId,
        user_id: profile.id,
      });

      if (error) {
        console.error("Error liking post:", error);
        return false;
      }

      // Update likes count
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc("increment_likes_count", { p_post_id: postId });

      // Update local state
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, likes_count: p.likes_count + 1, user_has_liked: true }
            : p
        )
      );

      return true;
    },
    [supabase, profile]
  );

  // Unlike a post
  const unlikePost = useCallback(
    async (postId: string): Promise<boolean> => {
      if (!profile) return false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("community_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", profile.id);

      if (error) {
        console.error("Error unliking post:", error);
        return false;
      }

      // Update likes count
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc("decrement_likes_count", { p_post_id: postId });

      // Update local state
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, likes_count: Math.max(0, p.likes_count - 1), user_has_liked: false }
            : p
        )
      );

      return true;
    },
    [supabase, profile]
  );

  // Vote on a poll
  const voteOnPoll = useCallback(
    async (postId: string, option: string): Promise<boolean> => {
      if (!profile) return false;

      // Check if already voted
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingVote } = await (supabase as any)
        .from("poll_votes")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", profile.id)
        .single();

      if (existingVote) {
        console.error("Already voted on this poll");
        return false;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("poll_votes").insert({
        post_id: postId,
        user_id: profile.id,
        option,
      });

      if (error) {
        console.error("Error voting on poll:", error);
        return false;
      }

      // Update poll votes count
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc("increment_poll_vote", {
        p_post_id: postId,
        p_option: option,
      });

      // Update local state
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id === postId && p.poll_votes) {
            const newVotes = { ...p.poll_votes };
            newVotes[option] = (newVotes[option] || 0) + 1;
            return { ...p, poll_votes: newVotes, user_vote: option };
          }
          return p;
        })
      );

      return true;
    },
    [supabase, profile]
  );

  // Fetch comments for a post
  const fetchComments = useCallback(
    async (postId: string): Promise<CommunityComment[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("community_comments")
        .select(
          `
          *,
          author:profiles!community_comments_author_id_fkey(full_name, avatar_url)
        `
        )
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching comments:", error);
        return [];
      }

      return (data || []) as CommunityComment[];
    },
    [supabase]
  );

  // Add a comment
  const addComment = useCallback(
    async (postId: string, content: string): Promise<boolean> => {
      if (!profile) return false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("community_comments").insert({
        post_id: postId,
        author_id: profile.id,
        content,
      });

      if (error) {
        console.error("Error adding comment:", error);
        return false;
      }

      // Update comments count
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc("increment_comments_count", { p_post_id: postId });

      // Update local state
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p
        )
      );

      return true;
    },
    [supabase, profile]
  );

  // Pin/unpin a post (super/pro only)
  const pinPost = useCallback(
    async (postId: string, isPinned: boolean): Promise<boolean> => {
      if (!profile || !canPostOfficial) return false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("community_posts")
        .update({ is_pinned: isPinned })
        .eq("id", postId);

      if (error) {
        console.error("Error pinning post:", error);
        return false;
      }

      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, is_pinned: isPinned } : p))
      );

      return true;
    },
    [supabase, profile, canPostOfficial]
  );

  return {
    posts,
    loading,
    fetchPosts,
    createPost,
    likePost,
    unlikePost,
    voteOnPoll,
    fetchComments,
    addComment,
    pinPost,
  };
}
