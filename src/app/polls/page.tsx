"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/resilient-fetch";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  MessageSquare,
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  RefreshCw,
  Send,
  AlertCircle,
  CheckSquare,
} from "lucide-react";
import Link from "next/link";

interface PollOption {
  id: string;
  label: string;
  description?: string;
  image_url?: string;
  sort_order: number;
  poll_votes?: Array<{ id: string; user_id: string }>;
}

interface PollComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: { full_name: string };
}

interface Poll {
  id: string;
  title: string;
  description?: string;
  poll_type: "improvement" | "satisfaction" | "preference" | "ranking" | "general";
  status: "draft" | "active" | "closed" | "archived";
  allow_comments: boolean;
  is_anonymous: boolean;
  max_choices: number;
  starts_at?: string;
  ends_at?: string;
  created_at: string;
  poll_options?: PollOption[];
  poll_comments?: PollComment[];
}

export default function PollsPage() {
  const { profile, user } = useAuth();
  const supabase = createClient();

  const [activePolls, setActivePolls] = useState<Poll[]>([]);
  const [closedPolls, setClosedPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPoll, setExpandedPoll] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [userVotes, setUserVotes] = useState<Record<string, string[]>>({});
  const [submittingVote, setSubmittingVote] = useState<string | null>(null);
  const [addingComment, setAddingComment] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});

  const isManager = profile?.role && ["super", "asst_super", "director", "pro"].includes(profile.role);

  useEffect(() => {
    fetchPolls();
  }, []);

  const fetchPolls = async () => {
    setLoading(true);
    setError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = (supabase.from("polls") as any)
      .select(
        `
        id,
        title,
        description,
        poll_type,
        status,
        allow_comments,
        is_anonymous,
        max_choices,
        starts_at,
        ends_at,
        created_at,
        poll_options(id, label, description, image_url, sort_order, poll_votes(id, user_id)),
        poll_comments(id, user_id, content, created_at, profiles:user_id(full_name))
      `
      )
      .in("status", ["active", "closed"])
      .order("created_at", { ascending: false });

    const result = await withTimeout(query, 8000, { data: null, error: null });

    if (result.error) {
      setError("Failed to load polls. Please try again.");
      setLoading(false);
      return;
    }

    const polls = (result.data || []) as Poll[];

    // Separate active and closed
    const active = polls.filter((p) => p.status === "active");
    const closed = polls.filter((p) => p.status === "closed");

    setActivePolls(active);
    setClosedPolls(closed);

    // Track user's existing votes
    const votesMap: Record<string, string[]> = {};
    active.concat(closed).forEach((poll) => {
      votesMap[poll.id] = [];
      poll.poll_options?.forEach((option) => {
        const userVoted = option.poll_votes?.some((v) => v.user_id === user?.id);
        if (userVoted) {
          votesMap[poll.id].push(option.id);
        }
      });
    });
    setUserVotes(votesMap);

    setLoading(false);
  };

  const handleSelectOption = (pollId: string, optionId: string, poll: Poll) => {
    setSelections((prev) => {
      const current = prev[pollId] || [];
      const maxChoices = poll.max_choices || 1;

      if (current.includes(optionId)) {
        return { ...prev, [pollId]: current.filter((id) => id !== optionId) };
      }

      if (current.length >= maxChoices) {
        if (maxChoices === 1) {
          return { ...prev, [pollId]: [optionId] };
        }
        return prev;
      }

      return { ...prev, [pollId]: [...current, optionId] };
    });
  };

  const handleSubmitVote = async (pollId: string) => {
    const selectedOptions = selections[pollId] || [];
    if (!selectedOptions.length || !user?.id) return;

    setSubmittingVote(pollId);

    try {
      // Delete existing votes for this poll
      const existingVotes = userVotes[pollId] || [];
      if (existingVotes.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("poll_votes") as any)
          .delete()
          .in("option_id", existingVotes)
          .eq("user_id", user.id);
      }

      // Insert new votes
      const newVotes = selectedOptions.map((optionId) => ({
        poll_id: pollId,
        option_id: optionId,
        user_id: user.id,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertResult = await (supabase.from("poll_votes") as any).insert(newVotes);

      if (!insertResult.error) {
        setUserVotes((prev) => ({ ...prev, [pollId]: selectedOptions }));
        setSelections((prev) => ({ ...prev, [pollId]: [] }));
        await fetchPolls(); // Refresh to show updated vote counts
      }
    } catch (err) {
      console.error("Vote submission error:", err);
    } finally {
      setSubmittingVote(null);
    }
  };

  const handleAddComment = async (pollId: string) => {
    const text = commentText[pollId]?.trim();
    if (!text || !user?.id) return;

    setAddingComment((prev) => ({ ...prev, [pollId]: true }));

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supabase.from("poll_comments") as any).insert({
        poll_id: pollId,
        user_id: user.id,
        content: text,
      });

      if (!result.error) {
        setCommentText((prev) => ({ ...prev, [pollId]: "" }));
        await fetchPolls();
      }
    } catch (err) {
      console.error("Comment submission error:", err);
    } finally {
      setAddingComment((prev) => ({ ...prev, [pollId]: false }));
    }
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      improvement: "bg-blue-100 text-blue-700",
      satisfaction: "bg-purple-100 text-purple-700",
      preference: "bg-teal-100 text-teal-700",
      ranking: "bg-orange-100 text-orange-700",
      general: "bg-gray-100 text-gray-700",
    };
    return colors[type] || colors.general;
  };

  const getTotalVotes = (poll: Poll) => {
    let total = 0;
    poll.poll_options?.forEach((opt) => {
      total += opt.poll_votes?.length || 0;
    });
    return total;
  };

  const getOptionVoteCount = (option: PollOption) => {
    return option.poll_votes?.length || 0;
  };

  const getTimeRemaining = (endDate: string | undefined) => {
    if (!endDate) return null;
    const now = new Date();
    const end = new Date(endDate);
    const diff = end.getTime() - now.getTime();

    if (diff < 0) return "Closed";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h left`;
    return "Closes soon";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-center min-h-96">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading polls...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-primary" />
              Community Polls
            </h1>
            <p className="text-muted-foreground text-sm mt-2">
              Your voice matters — vote on what matters to you
            </p>
          </div>
          {isManager && (
            <Link href="/polls/manage">
              <Button variant="outline" size="sm">
                Manage Polls
              </Button>
            </Link>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-900">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchPolls}
                className="mt-2 h-auto p-0 text-red-700 hover:text-red-900"
              >
                Try Again
              </Button>
            </div>
          </div>
        )}

        {/* Active Polls Section */}
        {activePolls.length > 0 ? (
          <div className="space-y-4 mb-8">
            {activePolls.map((poll) => {
              const isExpanded = expandedPoll === poll.id;
              const userVoted = (userVotes[poll.id] || []).length > 0;
              const totalVotes = getTotalVotes(poll);
              const timeRemaining = getTimeRemaining(poll.ends_at);

              return (
                <div
                  key={poll.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden"
                >
                  {/* Poll Header */}
                  <button
                    onClick={() => setExpandedPoll(isExpanded ? null : poll.id)}
                    className="w-full p-5 text-left hover:bg-gray-50 transition-colors flex items-start justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-lg font-semibold text-gray-900">{poll.title}</h2>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(poll.poll_type)}`}>
                          {poll.poll_type}
                        </span>
                        {userVoted && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Voted
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{poll.description}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
                        </span>
                        {poll.allow_comments && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-4 h-4" />
                            {(poll.poll_comments || []).length} comment{poll.poll_comments?.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {timeRemaining && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {timeRemaining}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-5 space-y-5 bg-gray-50">
                      {/* Voting Options */}
                      <div>
                        <h3 className="font-semibold text-sm text-gray-900 mb-3">Your Vote</h3>
                        <div className="space-y-2">
                          {(poll.poll_options || [])
                            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                            .map((option) => {
                              const isSelected = (selections[poll.id] || []).includes(option.id);
                              const optionVotes = getOptionVoteCount(option);
                              const totalVotes = getTotalVotes(poll);
                              const percentage = totalVotes > 0 ? ((optionVotes / totalVotes) * 100).toFixed(0) : 0;

                              return (
                                <div key={option.id}>
                                  <button
                                    onClick={() => handleSelectOption(poll.id, option.id, poll)}
                                    disabled={submittingVote === poll.id}
                                    className={`w-full p-3 text-left rounded-lg border-2 transition-all ${
                                      isSelected
                                        ? "border-green-500 bg-green-50"
                                        : "border-gray-300 bg-white hover:border-gray-400"
                                    } disabled:opacity-50`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? "border-green-500 bg-green-500" : "border-gray-300"}`}>
                                        {isSelected && <Check className="w-3 h-3 text-white" />}
                                      </div>
                                      <div className="flex-1">
                                        <p className="font-medium text-gray-900">{option.label}</p>
                                        {option.description && (
                                          <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                                        )}
                                      </div>
                                    </div>
                                  </button>

                                  {/* Vote Results Bar (shown after user votes) */}
                                  {userVoted && totalVotes > 0 && (
                                    <div className="mt-2 ml-8">
                                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                        <div
                                          className="bg-green-500 h-full transition-all"
                                          style={{ width: `${percentage}%` }}
                                        />
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {percentage}% ({optionVotes})
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Submit Vote Button */}
                      {!userVoted && (selections[poll.id] || []).length > 0 && (
                        <Button
                          onClick={() => handleSubmitVote(poll.id)}
                          disabled={submittingVote === poll.id}
                          className="w-full"
                          size="lg"
                        >
                          {submittingVote === poll.id ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            <>
                              <CheckSquare className="w-4 h-4 mr-2" />
                              Submit Vote
                            </>
                          )}
                        </Button>
                      )}

                      {/* Comments Section */}
                      {poll.allow_comments && (
                        <div className="border-t border-gray-200 pt-5">
                          <h3 className="font-semibold text-sm text-gray-900 mb-3 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            Comments
                          </h3>

                          {/* Add Comment */}
                          <div className="mb-4 space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Add a comment..."
                                value={commentText[poll.id] || ""}
                                onChange={(e) =>
                                  setCommentText((prev) => ({ ...prev, [poll.id]: e.target.value }))
                                }
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                disabled={addingComment[poll.id]}
                              />
                              <Button
                                size="sm"
                                onClick={() => handleAddComment(poll.id)}
                                disabled={!commentText[poll.id]?.trim() || addingComment[poll.id]}
                              >
                                {addingComment[poll.id] ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Comments List */}
                          <div className="space-y-3 max-h-48 overflow-y-auto">
                            {(poll.poll_comments || []).map((comment) => (
                              <div key={comment.id} className="bg-white p-3 rounded-lg text-sm">
                                <p className="font-medium text-gray-900">
                                  {poll.is_anonymous ? "Anonymous" : comment.profiles?.full_name || "Member"}
                                </p>
                                <p className="text-gray-700 mt-1">{comment.content}</p>
                                <p className="text-xs text-muted-foreground mt-2">
                                  {new Date(comment.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200 mb-8">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No active polls right now. Check back soon!</p>
          </div>
        )}

        {/* Recently Closed Section */}
        {closedPolls.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recently Closed</h2>
            <div className="space-y-4">
              {closedPolls.map((poll) => {
                const totalVotes = getTotalVotes(poll);

                return (
                  <div
                    key={poll.id}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">{poll.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{poll.description}</p>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(poll.poll_type)}`}>
                        {poll.poll_type}
                      </span>
                    </div>

                    {/* Results */}
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Results ({totalVotes} votes)</p>
                      {(poll.poll_options || [])
                        .sort((a, b) => (b.poll_votes?.length || 0) - (a.poll_votes?.length || 0))
                        .map((option) => {
                          const optionVotes = getOptionVoteCount(option);
                          const percentage = totalVotes > 0 ? ((optionVotes / totalVotes) * 100).toFixed(1) : 0;
                          const isWinner = optionVotes === Math.max(...(poll.poll_options || []).map((o) => getOptionVoteCount(o)));

                          return (
                            <div key={option.id}>
                              <div className="flex items-center justify-between mb-1">
                                <p className={`text-sm ${isWinner ? "font-semibold text-green-700" : "text-gray-900"}`}>
                                  {option.label}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {percentage}% ({optionVotes})
                                </p>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-full transition-all ${isWinner ? "bg-green-500" : "bg-gray-400"}`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Refresh Button */}
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPolls}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}
