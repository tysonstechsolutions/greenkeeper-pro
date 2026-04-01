"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/resilient-fetch";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Trophy,
  Users,
  MessageSquare,
  Clock,
  Calendar,
  TrendingUp,
  CheckCircle,
  Loader2,
  Download,
  BarChart3,
  X,
} from "lucide-react";

interface Poll {
  id: string;
  created_by: string;
  title: string;
  description: string;
  poll_type: string;
  status: string;
  allow_comments: boolean;
  is_anonymous: boolean;
  max_choices: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
}

interface PollOption {
  id: string;
  poll_id: string;
  label: string;
  description: string;
  sort_order: number;
  poll_votes: Array<{
    id: string;
    user_id: string;
    created_at: string;
    profiles: { full_name: string; role: string } | null;
  }>;
}

interface Comment {
  id: string;
  poll_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

interface VoterDemographic {
  role: string;
  count: number;
}

const ROLE_COLORS: Record<string, string> = {
  member: "bg-blue-500",
  crew: "bg-purple-500",
  director: "bg-amber-600",
  pro: "bg-green-600",
  manager: "bg-red-600",
};

export default function PollResultsPage() {
  const params = useParams();
  const pollId = params.id as string;
  const { profile, user, isSuper, isAsstSuper } = useAuth();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Parallel fetch: poll, options with votes, comments, total members
        const [pollResult, optionsResult, commentsResult, membersResult] =
          await Promise.all([
            withTimeout(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (supabase.from("polls") as any)
                .select("*")
                .eq("id", pollId)
                .single(),
              8000,
              { data: null, error: null }
            ),
            withTimeout(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (supabase.from("poll_options") as any)
                .select(
                  "*, poll_votes(id, user_id, created_at, profiles:user_id(full_name, role))"
                )
                .eq("poll_id", pollId)
                .order("sort_order"),
              8000,
              { data: null, error: null }
            ),
            withTimeout(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (supabase.from("poll_comments") as any)
                .select("*, profiles:user_id(full_name)")
                .eq("poll_id", pollId)
                .order("created_at", { ascending: false }),
              8000,
              { data: null, error: null }
            ),
            withTimeout(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (supabase.from("profiles") as any).select("id", {
                count: "exact",
                head: true,
              }),
              8000,
              { data: null, error: null, count: 0 }
            ),
          ]);

        if (pollResult.error) throw pollResult.error;
        if (optionsResult.error) throw optionsResult.error;
        if (commentsResult.error) throw commentsResult.error;

        setPoll(pollResult.data);
        setOptions(optionsResult.data || []);
        setComments(commentsResult.data || []);
        setTotalMembers(membersResult.count || 0);
      } catch (err) {
        console.error("Failed to fetch poll results:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load poll results"
        );
      } finally {
        setLoading(false);
      }
    };

    if (pollId) fetchData();
  }, [pollId, supabase]);

  const stats = useMemo(() => {
    if (!options.length) return { totalVotes: 0, uniqueVoters: 0, responseRate: 0 };

    const allVotes = options.flatMap((opt) => opt.poll_votes);
    const uniqueVoterIds = new Set(allVotes.map((v) => v.user_id));
    const totalVotes = allVotes.length;
    const uniqueVoters = uniqueVoterIds.size;
    const responseRate = totalMembers ? ((uniqueVoters / totalMembers) * 100).toFixed(1) : 0;

    return { totalVotes, uniqueVoters, responseRate };
  }, [options, totalMembers]);

  const voterDemographics = useMemo(() => {
    if (poll?.is_anonymous) return [];

    const roleMap = new Map<string, number>();
    const allVotes = options.flatMap((opt) => opt.poll_votes);
    const uniqueVoters = new Map<string, string>();

    allVotes.forEach((vote) => {
      if (!uniqueVoters.has(vote.user_id)) {
        uniqueVoters.set(vote.user_id, vote.profiles?.role || "unknown");
      }
    });

    uniqueVoters.forEach((role) => {
      roleMap.set(role, (roleMap.get(role) || 0) + 1);
    });

    return Array.from(roleMap.entries()).map(([role, count]) => ({
      role,
      count,
    }));
  }, [options, poll?.is_anonymous]);

  const winner = useMemo(() => {
    if (options.length === 0) return null;
    return options.reduce((prev, current) =>
      current.poll_votes.length > prev.poll_votes.length ? current : prev
    );
  }, [options]);

  const voteTimeline = useMemo(() => {
    const allVotes = options.flatMap((opt) =>
      opt.poll_votes.map((v) => ({
        ...v,
        optionLabel: opt.label,
      }))
    );
    return allVotes.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [options]);

  const handleClosePoll = async () => {
    if (!poll) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("polls") as any)
        .update({ status: "closed", ends_at: new Date().toISOString() })
        .eq("id", pollId);

      if (error) throw error;
      setPoll({ ...poll, status: "closed" });
    } catch (err) {
      console.error("Failed to close poll:", err);
    }
  };

  const handleExportResults = () => {
    const data = {
      poll: poll,
      options: options,
      comments: comments,
      stats: stats,
    };
    const csv = JSON.stringify(data, null, 2);
    const blob = new Blob([csv], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `poll-results-${pollId}.json`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error || !poll) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Link
          href="/polls/manage"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Manage Polls
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error || "Poll not found"}
        </div>
      </div>
    );
  }

  const isManager = isSuper || isAsstSuper;
  const isClosed = poll.status === "closed";

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/polls/manage"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Manage Polls
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{poll.title}</h1>
            {poll.description && (
              <p className="text-muted-foreground mt-2">{poll.description}</p>
            )}
            <div className="flex gap-2 mt-4">
              <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                {poll.poll_type}
              </span>
              <span
                className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${
                  isClosed
                    ? "bg-gray-100 text-gray-800"
                    : "bg-green-100 text-green-800"
                }`}
              >
                {isClosed ? "Closed" : "Active"}
              </span>
            </div>
          </div>
          {isManager && (
            <div className="flex gap-2">
              {!isClosed && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClosePoll}
                >
                  Close Poll
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportResults}
              >
                <Download className="w-4 h-4 mr-2" /> Export
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Date Range */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          Started: {new Date(poll.starts_at).toLocaleDateString()}
        </div>
        {poll.ends_at && (
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Ended: {new Date(poll.ends_at).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold">{stats.totalVotes}</div>
          <div className="text-xs text-muted-foreground">Total Votes</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold">{stats.uniqueVoters}</div>
          <div className="text-xs text-muted-foreground">Unique Voters</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold">{stats.responseRate}%</div>
          <div className="text-xs text-muted-foreground">Response Rate</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold">{comments.length}</div>
          <div className="text-xs text-muted-foreground">Comments</div>
        </div>
      </div>

      {/* Winner Card */}
      {isClosed && winner && (
        <div className="border-2 border-green-400 bg-green-50 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <div>
              <div className="text-sm text-muted-foreground">Poll Winner</div>
              <div className="text-xl font-bold">{winner.label}</div>
              <div className="text-sm text-muted-foreground">
                {winner.poll_votes.length} votes
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Option Breakdown */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" /> Results Breakdown
        </h2>
        <div className="space-y-6">
          {options
            .sort((a, b) => b.poll_votes.length - a.poll_votes.length)
            .map((option, idx) => {
              const voteCount = option.poll_votes.length;
              const percentage =
                stats.totalVotes > 0
                  ? ((voteCount / stats.totalVotes) * 100).toFixed(1)
                  : 0;
              const colors = [
                "bg-green-500",
                "bg-blue-500",
                "bg-purple-500",
                "bg-yellow-500",
                "bg-pink-500",
              ];
              const barColor = colors[idx % colors.length];

              return (
                <div key={option.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-semibold">{option.label}</div>
                      {option.description && (
                        <div className="text-xs text-muted-foreground">
                          {option.description}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{percentage}%</div>
                      <div className="text-xs text-muted-foreground">
                        {voteCount} vote{voteCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`${barColor} h-2 rounded-full transition-all`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Voter Demographics */}
      {!poll.is_anonymous && voterDemographics.length > 0 && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Users className="w-5 h-5" /> Voter Demographics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {voterDemographics.map((demo) => (
              <div
                key={demo.role}
                className="bg-gray-50 rounded-lg p-4 text-center"
              >
                <div className="text-2xl font-bold">{demo.count}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {demo.role}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vote Timeline */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" /> Vote Timeline
        </h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {voteTimeline.slice(0, 50).map((vote) => (
            <div
              key={vote.id}
              className="flex items-center justify-between text-sm border-b pb-3"
            >
              <div className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <div>
                  <div className="font-medium">
                    {poll.is_anonymous ? "Anonymous voter" : vote.profiles?.full_name || "Unknown"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    voted for &quot;{vote.optionLabel}&quot;
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(vote.created_at).toLocaleDateString()} at{" "}
                {new Date(vote.created_at).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {voteTimeline.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No votes yet
            </div>
          )}
        </div>
      </div>

      {/* Comments Feed */}
      {poll.allow_comments && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <MessageSquare className="w-5 h-5" /> Comments ({comments.length})
          </h2>
          {comments.length > 0 ? (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="border-b pb-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-semibold">
                      {poll.is_anonymous
                        ? "Anonymous"
                        : comment.profiles?.full_name || "Unknown"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(comment.created_at).toLocaleDateString()} at{" "}
                      {new Date(comment.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <p className="text-sm text-gray-700">{comment.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No comments yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
