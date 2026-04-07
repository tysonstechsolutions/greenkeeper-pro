"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useCommunity } from "@/lib/hooks/useCommunity";
import { memberTypeLabels } from "@/types/member";
import type { CommunityPostType, CommunityComment, MemberType } from "@/types/member";
import {
  Heart,
  MessageCircle,
  Send,
  Image,
  Plus,
  X,
  Pin,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Filter,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FilterType = CommunityPostType | "all";

export default function CommunityPage() {
  const { profile, isSuper, isAsstSuper, isPro, loading: authLoading } = useAuth();
  const {
    posts,
    fetchPosts,
    createPost,
    likePost,
    unlikePost,
    voteOnPoll,
    fetchComments,
    addComment,
    pinPost,
    loading,
  } = useCommunity();

  const [filter, setFilter] = useState<FilterType>("all");
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostType, setNewPostType] = useState<"discussion" | "photo" | "poll">("discussion");
  const [newPostContent, setNewPostContent] = useState("");
  const [newPollQuestion, setNewPollQuestion] = useState("");
  const [newPollOptions, setNewPollOptions] = useState(["", ""]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Comments state
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentsMap, setCommentsMap] = useState<Record<string, CommunityComment[]>>({});
  const [newComments, setNewComments] = useState<Record<string, string>>({});
  const [commentingOn, setCommentingOn] = useState<string | null>(null);

  const canPostOfficial = isSuper || isAsstSuper || isPro;

  useEffect(() => {
    fetchPosts(filter === "all" ? undefined : filter);
  }, [fetchPosts, filter]);

  const handleSubmitPost = async () => {
    if (!newPostContent.trim()) return;

    setPosting(true);
    setPostError(null);

    const result = await createPost(
      newPostType,
      newPostContent,
      undefined, // TODO: photo upload
      newPostType === "poll" ? newPollQuestion : undefined,
      newPostType === "poll" ? newPollOptions.filter((o) => o.trim()) : undefined
    );

    if (!result.success) {
      setPostError(result.error);
    } else {
      setShowNewPost(false);
      setNewPostContent("");
      setNewPollQuestion("");
      setNewPollOptions(["", ""]);
    }

    setPosting(false);
  };

  const handleCreatePoll = async () => {
    if (!newPollQuestion.trim() || newPollOptions.filter((o) => o.trim()).length < 2)
      return;

    setPosting(true);
    setPostError(null);

    const result = await createPost(
      "poll",
      newPollQuestion,
      undefined,
      newPollQuestion,
      newPollOptions.filter((o) => o.trim())
    );

    if (!result.success) {
      setPostError(result.error);
    } else {
      setShowNewPost(false);
      setNewPollQuestion("");
      setNewPollOptions(["", ""]);
    }

    setPosting(false);
  };

  const handleToggleLike = async (postId: string, hasLiked: boolean) => {
    if (hasLiked) {
      await unlikePost(postId);
    } else {
      await likePost(postId);
    }
  };

  const handleVote = async (postId: string, option: string) => {
    await voteOnPoll(postId, option);
  };

  const handleToggleComments = async (postId: string) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(postId)) {
      newExpanded.delete(postId);
    } else {
      newExpanded.add(postId);
      // Fetch comments if not already loaded
      if (!commentsMap[postId]) {
        const comments = await fetchComments(postId);
        setCommentsMap((prev) => ({ ...prev, [postId]: comments }));
      }
    }
    setExpandedComments(newExpanded);
  };

  const handleAddComment = async (postId: string) => {
    const content = newComments[postId]?.trim();
    if (!content) return;

    setCommentingOn(postId);
    const success = await addComment(postId, content);
    if (success) {
      setNewComments((prev) => ({ ...prev, [postId]: "" }));
      // Refresh comments
      const comments = await fetchComments(postId);
      setCommentsMap((prev) => ({ ...prev, [postId]: comments }));
    }
    setCommentingOn(null);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/50 to-background dark:from-green-950/20 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-green-700 to-emerald-800 text-white px-4 pt-6 pb-6">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold">Community</h1>
          <p className="text-green-100 text-sm mt-1">
            Connect with fellow golfers and course staff
          </p>
        </div>
      </div>

      {/* Filter & New Post */}
      <div className="px-4 -mt-3">
        <div className="max-w-lg mx-auto">
          <div className="bg-card rounded-xl border border-border p-3 flex items-center justify-between gap-3">
            {/* Filter */}
            <div className="flex items-center gap-2 overflow-x-auto">
              <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              {(["all", "official", "poll", "discussion", "photo"] as FilterType[]).map(
                (f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors",
                      filter === f
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {f === "all"
                      ? "All"
                      : f === "official"
                      ? "Official"
                      : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                )
              )}
            </div>

            {/* New Post Button */}
            <Button
              size="sm"
              onClick={() => setShowNewPost(true)}
              className="flex-shrink-0"
            >
              <Plus className="w-4 h-4 mr-1" />
              Post
            </Button>
          </div>
        </div>
      </div>

      {/* New Post Modal */}
      {showNewPost && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="w-full max-w-lg bg-card rounded-t-2xl sm:rounded-xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Create Post</h2>
              <button
                onClick={() => {
                  setShowNewPost(false);
                  setPostError(null);
                }}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Post Type Selection */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setNewPostType("discussion")}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                  newPostType === "discussion"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                Discussion
              </button>
              <button
                onClick={() => setNewPostType("photo")}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                  newPostType === "photo"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                Photo
              </button>
              {canPostOfficial && (
                <button
                  onClick={() => setNewPostType("poll")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                    newPostType === "poll"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  Poll
                </button>
              )}
            </div>

            {postError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{postError}</span>
              </div>
            )}

            {newPostType === "poll" ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={newPollQuestion}
                  onChange={(e) => setNewPollQuestion(e.target.value)}
                  placeholder="Poll question..."
                  className="w-full px-4 py-3 bg-background border border-input rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {newPollOptions.map((opt, i) => (
                  <input
                    key={i}
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...newPollOptions];
                      newOpts[i] = e.target.value;
                      setNewPollOptions(newOpts);
                    }}
                    placeholder={`Option ${i + 1}`}
                    className="w-full px-4 py-2 bg-background border border-input rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                ))}
                {newPollOptions.length < 4 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setNewPollOptions([...newPollOptions, ""])}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Option
                  </Button>
                )}
                <Button
                  onClick={handleCreatePoll}
                  disabled={
                    posting ||
                    !newPollQuestion.trim() ||
                    newPollOptions.filter((o) => o.trim()).length < 2
                  }
                  className="w-full"
                >
                  {posting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <BarChart3 className="w-4 h-4 mr-2" />
                  )}
                  Create Poll
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={4}
                  className="w-full px-4 py-3 bg-background border border-input rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />

                {newPostType === "photo" && (
                  <button className="w-full p-4 border-2 border-dashed border-input rounded-lg text-sm text-muted-foreground hover:border-primary/50 transition-colors">
                    <Image className="w-6 h-6 mx-auto mb-2" />
                    Tap to add photo
                  </button>
                )}

                <Button
                  onClick={handleSubmitPost}
                  disabled={posting || !newPostContent.trim()}
                  className="w-full"
                >
                  {posting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Post
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Posts Feed */}
      <div className="px-4 mt-4 max-w-lg mx-auto space-y-4">
        {loading && posts.length === 0 ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No posts yet</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewPost(true)}
              className="mt-3"
            >
              Be the first to post
            </Button>
          </div>
        ) : (
          posts.map((post) => {
            const memberType = post.member_info?.member_type as MemberType | undefined;
            const totalVotes = post.poll_votes
              ? Object.values(post.poll_votes).reduce((a, b) => a + b, 0)
              : 0;

            return (
              <div
                key={post.id}
                className={cn(
                  "bg-card rounded-xl border p-4",
                  post.is_official
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-border"
                )}
              >
                {/* Post Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {post.author?.avatar_url ? (
                      <img
                        src={post.author.avatar_url}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-medium text-primary">
                        {post.author?.full_name?.charAt(0) || "?"}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">
                        {post.author?.full_name || "Unknown"}
                      </span>
                      {post.is_official && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400">
                          Official
                        </span>
                      )}
                      {post.is_pinned && (
                        <Pin className="w-3 h-3 text-primary" />
                      )}
                      {memberType && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {memberTypeLabels[memberType]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatTimeAgo(post.created_at)}
                    </p>
                  </div>

                  {/* Pin button for admins */}
                  {canPostOfficial && (
                    <button
                      onClick={() => pinPost(post.id, !post.is_pinned)}
                      className={cn(
                        "p-1 rounded",
                        post.is_pinned
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Post Content */}
                <p className="text-sm whitespace-pre-wrap mb-3">{post.content}</p>

                {/* Photo */}
                {post.photo_url && (
                  <img
                    src={post.photo_url}
                    alt=""
                    className="w-full rounded-lg mb-3"
                  />
                )}

                {/* Poll */}
                {post.post_type === "poll" &&
                  post.poll_options &&
                  post.poll_votes && (
                    <div className="space-y-2 mb-3">
                      {post.poll_options.map((option) => {
                        const votes = post.poll_votes![option] || 0;
                        const percentage =
                          totalVotes > 0
                            ? Math.round((votes / totalVotes) * 100)
                            : 0;
                        const hasVoted = post.user_vote === option;

                        return (
                          <button
                            key={option}
                            onClick={() =>
                              !post.user_vote && handleVote(post.id, option)
                            }
                            disabled={!!post.user_vote}
                            className={cn(
                              "w-full p-3 rounded-lg text-left relative overflow-hidden transition-colors",
                              hasVoted
                                ? "border-2 border-primary"
                                : "border border-input hover:border-primary/50",
                              post.user_vote && "cursor-default"
                            )}
                          >
                            {/* Progress bar */}
                            {post.user_vote && (
                              <div
                                className="absolute inset-y-0 left-0 bg-primary/10 transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            )}
                            <div className="relative flex items-center justify-between">
                              <span className="text-sm">{option}</span>
                              {post.user_vote && (
                                <span className="text-sm font-medium">
                                  {percentage}%
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      <p className="text-xs text-muted-foreground text-center">
                        {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}

                {/* Actions */}
                <div className="flex items-center gap-4 pt-3 border-t border-border">
                  <button
                    onClick={() =>
                      handleToggleLike(post.id, post.user_has_liked || false)
                    }
                    className={cn(
                      "flex items-center gap-1.5 text-sm transition-colors",
                      post.user_has_liked
                        ? "text-red-500"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Heart
                      className={cn(
                        "w-4 h-4",
                        post.user_has_liked && "fill-current"
                      )}
                    />
                    {post.likes_count}
                  </button>
                  <button
                    onClick={() => handleToggleComments(post.id)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {post.comments_count}
                    {expandedComments.has(post.id) ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                </div>

                {/* Comments Section */}
                {expandedComments.has(post.id) && (
                  <div className="mt-3 pt-3 border-t border-border space-y-3">
                    {commentsMap[post.id]?.map((comment) => (
                      <div key={comment.id} className="flex gap-2">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium">
                            {comment.author?.full_name?.charAt(0) || "?"}
                          </span>
                        </div>
                        <div className="flex-1 bg-muted/50 rounded-lg p-2">
                          <p className="text-xs font-medium">
                            {comment.author?.full_name || "Unknown"}
                          </p>
                          <p className="text-sm">{comment.content}</p>
                        </div>
                      </div>
                    ))}

                    {/* Add Comment */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newComments[post.id] || ""}
                        onChange={(e) =>
                          setNewComments((prev) => ({
                            ...prev,
                            [post.id]: e.target.value,
                          }))
                        }
                        placeholder="Write a comment..."
                        className="flex-1 px-3 py-2 bg-background border border-input rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddComment(post.id);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleAddComment(post.id)}
                        disabled={
                          !newComments[post.id]?.trim() ||
                          commentingOn === post.id
                        }
                      >
                        {commentingOn === post.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
