"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRoundRatings } from "@/lib/hooks/useRoundRatings";
import { useTeeTimes } from "@/lib/hooks/useTeeTimes";
import { useCommunity } from "@/lib/hooks/useCommunity";
import { RoleGuard, ADMIN_ROLES } from "@/components/auth/role-guard";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  Users,
  UserPlus,
  Calendar,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  BarChart3,
  ChevronRight,
  Loader2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoundRating } from "@/types/member";

interface RatingStats {
  overall: number;
  greens: number;
  fairways: number;
  bunkers: number;
  tees: number;
  pace: number;
  setup: number;
  cleanliness: number;
  value: number;
  totalRatings: number;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            trend === "up"
              ? "bg-green-500/10"
              : trend === "down"
              ? "bg-red-500/10"
              : "bg-primary/10"
          )}
        >
          <Icon
            className={cn(
              "w-5 h-5",
              trend === "up"
                ? "text-green-600"
                : trend === "down"
                ? "text-red-600"
                : "text-primary"
            )}
          />
        </div>
      </div>
    </div>
  );
}

function RatingBar({
  label,
  rating,
  previousRating,
}: {
  label: string;
  rating: number;
  previousRating?: number;
}) {
  const percentage = (rating / 5) * 100;
  const trend =
    previousRating !== undefined
      ? rating > previousRating
        ? "up"
        : rating < previousRating
        ? "down"
        : "neutral"
      : undefined;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-medium">{rating.toFixed(1)}</span>
          {trend && (
            <span
              className={cn(
                "flex items-center text-xs",
                trend === "up"
                  ? "text-green-600"
                  : trend === "down"
                  ? "text-red-600"
                  : "text-muted-foreground"
              )}
            >
              {trend === "up" ? (
                <TrendingUp className="w-3 h-3" />
              ) : trend === "down" ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
            </span>
          )}
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            rating >= 4
              ? "bg-green-500"
              : rating >= 3
              ? "bg-yellow-500"
              : "bg-red-500"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function MemberInsightsPage() {
  const { loading: authLoading } = useAuth();
  const {
    fetchAllRatings,
    getAverageRatings,
    getMemberCount,
    getNewMembersThisMonth,
  } = useRoundRatings();
  const { posts, fetchPosts } = useCommunity();

  const [memberCount, setMemberCount] = useState(0);
  const [newMembersCount, setNewMembersCount] = useState(0);
  const [currentStats, setCurrentStats] = useState<RatingStats | null>(null);
  const [previousStats, setPreviousStats] = useState<RatingStats | null>(null);
  const [recentRatings, setRecentRatings] = useState<RoundRating[]>([]);
  const [teeTimesThisWeek, setTeeTimesThisWeek] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      // Get member counts
      const count = await getMemberCount();
      setMemberCount(count);

      const newMembers = await getNewMembersThisMonth();
      setNewMembersCount(newMembers);

      // Get current month ratings
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];

      const current = await getAverageRatings(startOfMonth, endOfMonth);
      setCurrentStats(current);

      // Get last month ratings for comparison
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        .toISOString()
        .split("T")[0];
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
        .toISOString()
        .split("T")[0];

      const previous = await getAverageRatings(startOfLastMonth, endOfLastMonth);
      setPreviousStats(previous);

      // Get recent ratings
      const ratings = await fetchAllRatings(10);
      setRecentRatings(ratings);

      // Fetch community posts
      await fetchPosts();

      setLoading(false);
    };

    loadData();
  }, [
    getMemberCount,
    getNewMembersThisMonth,
    getAverageRatings,
    fetchAllRatings,
    fetchPosts,
  ]);

  // Filter to polls only
  const activePolls = posts.filter(
    (p) => p.post_type === "poll" && p.poll_votes
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={ADMIN_ROLES} redirectTo="/dashboard">
      <div className="p-4 md:p-6 pb-24">
        <PageHeader
          title="Member Insights"
          description="Golfer engagement and feedback"
          icon={Users}
        >
          <Link href="/member/community">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Post Update
            </Button>
          </Link>
        </PageHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 mt-6">
            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Total Members"
                value={memberCount}
                subtitle="Registered golfers"
                icon={Users}
              />
              <StatCard
                title="New This Month"
                value={newMembersCount}
                subtitle="Member signups"
                icon={UserPlus}
                trend={newMembersCount > 0 ? "up" : "neutral"}
              />
              <StatCard
                title="Avg Rating"
                value={currentStats?.overall.toFixed(1) || "-"}
                subtitle="This month"
                icon={Star}
                trend={
                  currentStats && previousStats
                    ? currentStats.overall > previousStats.overall
                      ? "up"
                      : currentStats.overall < previousStats.overall
                      ? "down"
                      : "neutral"
                    : undefined
                }
              />
              <StatCard
                title="Ratings"
                value={currentStats?.totalRatings || 0}
                subtitle="This month"
                icon={BarChart3}
              />
            </div>

            {/* Rating Breakdown */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500" />
                Rating Breakdown (This Month)
              </h2>

              {currentStats ? (
                <div className="space-y-4">
                  <RatingBar
                    label="Greens"
                    rating={currentStats.greens}
                    previousRating={previousStats?.greens}
                  />
                  <RatingBar
                    label="Fairways"
                    rating={currentStats.fairways}
                    previousRating={previousStats?.fairways}
                  />
                  <RatingBar
                    label="Bunkers"
                    rating={currentStats.bunkers}
                    previousRating={previousStats?.bunkers}
                  />
                  <RatingBar
                    label="Tee Boxes"
                    rating={currentStats.tees}
                    previousRating={previousStats?.tees}
                  />
                  <RatingBar
                    label="Pace of Play"
                    rating={currentStats.pace}
                    previousRating={previousStats?.pace}
                  />
                  <RatingBar
                    label="Course Setup"
                    rating={currentStats.setup}
                    previousRating={previousStats?.setup}
                  />
                  <RatingBar
                    label="Cleanliness"
                    rating={currentStats.cleanliness}
                    previousRating={previousStats?.cleanliness}
                  />
                  <RatingBar
                    label="Value"
                    rating={currentStats.value}
                    previousRating={previousStats?.value}
                  />
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No ratings this month yet
                </p>
              )}
            </div>

            {/* Recent Feedback */}
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-500" />
                  Recent Feedback
                </h2>
                <Link
                  href="/feedback"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  View All <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              {recentRatings.length > 0 ? (
                <div className="space-y-3">
                  {recentRatings.slice(0, 5).map((rating) => (
                    <div
                      key={rating.id}
                      className="p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "w-3 h-3",
                                  i < rating.overall_rating
                                    ? "text-amber-500 fill-amber-500"
                                    : "text-muted-foreground"
                                )}
                              />
                            ))}
                          </div>
                          {rating.comments && (
                            <p className="text-sm text-muted-foreground mt-1">
                              &quot;{rating.comments}&quot;
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(rating.round_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No recent feedback
                </p>
              )}
            </div>

            {/* Active Polls */}
            {activePolls.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-4">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-purple-500" />
                  Active Polls
                </h2>

                <div className="space-y-4">
                  {activePolls.map((poll) => {
                    const totalVotes = poll.poll_votes
                      ? Object.values(poll.poll_votes).reduce((a, b) => a + b, 0)
                      : 0;

                    return (
                      <div
                        key={poll.id}
                        className="p-3 bg-muted/50 rounded-lg"
                      >
                        <p className="font-medium text-sm mb-2">
                          {poll.poll_question || poll.content}
                        </p>
                        <div className="space-y-2">
                          {poll.poll_options?.map((option) => {
                            const votes = poll.poll_votes![option] || 0;
                            const percentage =
                              totalVotes > 0
                                ? Math.round((votes / totalVotes) * 100)
                                : 0;

                            return (
                              <div key={option}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span>{option}</span>
                                  <span>
                                    {votes} ({percentage}%)
                                  </span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {totalVotes} total vote{totalVotes !== 1 ? "s" : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-4">
              <Link href="/member/community">
                <div className="bg-card rounded-xl border border-border p-4 hover:border-primary/50 transition-colors">
                  <Plus className="w-6 h-6 text-primary mb-2" />
                  <p className="font-medium">Post Official Update</p>
                  <p className="text-xs text-muted-foreground">
                    Share course news with members
                  </p>
                </div>
              </Link>
              <Link href="/member/community">
                <div className="bg-card rounded-xl border border-border p-4 hover:border-primary/50 transition-colors">
                  <BarChart3 className="w-6 h-6 text-purple-500 mb-2" />
                  <p className="font-medium">Create Poll</p>
                  <p className="text-xs text-muted-foreground">
                    Get member feedback on improvements
                  </p>
                </div>
              </Link>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
