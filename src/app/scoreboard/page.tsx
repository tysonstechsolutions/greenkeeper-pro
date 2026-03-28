"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Trophy,
  Medal,
  Flame,
  Star,
  TrendingUp,
  CheckCircle2,
  Clock,
  Target,
  Users,
  ChevronRight,
  Loader2,
  Calendar,
  Zap,
  Award,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/resilient-fetch";
import { getDisplayName, getInitials, roleLabels, roleColors } from "@/lib/hooks/useProfiles";
import type { Profile } from "@/types/database";

interface CrewMemberStats {
  profile: Profile;
  tasksCompleted: number;
  tasksOnTime: number;
  totalAssigned: number;
  onTimeRate: number;
  currentStreak: number;
  photosUploaded: number;
  score: number;
}

type TimeRange = "week" | "month" | "all_time";

export default function ScoreboardPage() {
  const { profile: currentUser } = useAuth();
  const [stats, setStats] = useState<CrewMemberStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const supabase = createClient();

  const fetchStats = useCallback(async () => {
    setLoading(true);

    try {
      const now = new Date();
      let startDate: string;

      if (timeRange === "week") {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().split("T")[0];
      } else if (timeRange === "month") {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString().split("T")[0];
      } else {
        startDate = "2020-01-01";
      }

      // Fetch all active profiles, completed tasks, and photos in parallel
      const [profilesResult, completedTasksResult, allTasksResult, photosResult] = await Promise.all([
        withTimeout(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase.from("profiles") as any)
            .select("*")
            .eq("is_active", true)
            .in("role", ["super", "asst_super", "foreman", "mechanic", "crew", "seasonal"]),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase.from("tasks") as any)
            .select("id, assigned_to, completed_at, due_date, status")
            .eq("status", "completed")
            .gte("completed_at", startDate + "T00:00:00"),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase.from("tasks") as any)
            .select("id, assigned_to, status")
            .gte("created_at", startDate + "T00:00:00")
            .not("assigned_to", "is", null),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase.from("photos") as any)
            .select("id, uploaded_by")
            .gte("created_at", startDate + "T00:00:00"),
          8000,
          { data: null, error: null }
        ),
      ]);

      const profiles = (profilesResult.data || []) as Profile[];
      const completedTasks = (completedTasksResult.data || []) as Array<{
        id: string;
        assigned_to: string | null;
        completed_at: string;
        due_date: string;
        status: string;
      }>;
      const allTasks = (allTasksResult.data || []) as Array<{
        id: string;
        assigned_to: string | null;
        status: string;
      }>;
      const photos = (photosResult.data || []) as Array<{
        id: string;
        uploaded_by: string;
      }>;

      // Build stats per crew member
      const crewStats: CrewMemberStats[] = profiles.map((profile) => {
        const myCompleted = completedTasks.filter((t) => t.assigned_to === profile.id);
        const myTotal = allTasks.filter((t) => t.assigned_to === profile.id);
        const myPhotos = photos.filter((p) => p.uploaded_by === profile.id);

        const onTime = myCompleted.filter((t) => {
          if (!t.due_date || !t.completed_at) return true;
          return new Date(t.completed_at) <= new Date(t.due_date + "T23:59:59");
        });

        const tasksCompleted = myCompleted.length;
        const tasksOnTime = onTime.length;
        const totalAssigned = myTotal.length;
        const onTimeRate = tasksCompleted > 0 ? Math.round((tasksOnTime / tasksCompleted) * 100) : 0;
        const photosUploaded = myPhotos.length;

        // Score formula: completed tasks * 10 + on-time bonus * 5 + photos * 3
        const score = tasksCompleted * 10 + tasksOnTime * 5 + photosUploaded * 3;

        // Simple streak: count consecutive completed tasks (simplified)
        const currentStreak = Math.min(tasksCompleted, 7); // Cap display at 7

        return {
          profile,
          tasksCompleted,
          tasksOnTime,
          totalAssigned,
          onTimeRate,
          currentStreak,
          photosUploaded,
          score,
        };
      });

      // Sort by score descending
      crewStats.sort((a, b) => b.score - a.score);
      setStats(crewStats);
    } catch (err) {
      console.error("Error fetching scoreboard:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, timeRange]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Team totals
  const teamTotals = useMemo(() => {
    const totalCompleted = stats.reduce((sum, s) => sum + s.tasksCompleted, 0);
    const totalOnTime = stats.reduce((sum, s) => sum + s.tasksOnTime, 0);
    const totalPhotos = stats.reduce((sum, s) => sum + s.photosUploaded, 0);
    const avgOnTimeRate = stats.length > 0
      ? Math.round(stats.reduce((sum, s) => sum + s.onTimeRate, 0) / stats.filter(s => s.tasksCompleted > 0).length || 0)
      : 0;
    return { totalCompleted, totalOnTime, totalPhotos, avgOnTimeRate };
  }, [stats]);

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="w-6 h-6 text-amber-500" />;
    if (index === 1) return <Medal className="w-6 h-6 text-gray-400" />;
    if (index === 2) return <Medal className="w-6 h-6 text-amber-700" />;
    return <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground">{index + 1}</span>;
  };

  const getRankBg = (index: number) => {
    if (index === 0) return "bg-gradient-to-r from-amber-500/10 to-yellow-500/5 border-amber-300/50";
    if (index === 1) return "bg-gradient-to-r from-gray-300/10 to-gray-200/5 border-gray-300/50";
    if (index === 2) return "bg-gradient-to-r from-amber-700/10 to-orange-600/5 border-amber-600/30";
    return "bg-card border-border";
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500" />
            Crew Scoreboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Who's crushing it this {timeRange === "week" ? "week" : timeRange === "month" ? "month" : "season"}
          </p>
        </div>
      </div>

      {/* Time range tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-muted/60 rounded-lg w-fit">
        {([
          { value: "week" as TimeRange, label: "This Week" },
          { value: "month" as TimeRange, label: "This Month" },
          { value: "all_time" as TimeRange, label: "All Time" },
        ]).map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTimeRange(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              timeRange === opt.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Team stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-center">
          <CheckCircle2 className="w-5 h-5 text-primary mx-auto mb-1" />
          <div className="text-2xl font-bold">{teamTotals.totalCompleted}</div>
          <div className="text-xs text-muted-foreground">Tasks Done</div>
        </div>
        <div className="p-4 rounded-xl bg-green-500/5 border border-green-200/50 text-center">
          <Target className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <div className="text-2xl font-bold text-green-600">{teamTotals.avgOnTimeRate}%</div>
          <div className="text-xs text-muted-foreground">On-Time Rate</div>
        </div>
        <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-200/50 text-center">
          <Users className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <div className="text-2xl font-bold text-blue-600">{stats.filter(s => s.tasksCompleted > 0).length}</div>
          <div className="text-xs text-muted-foreground">Active Crew</div>
        </div>
        <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-200/50 text-center">
          <Zap className="w-5 h-5 text-purple-600 mx-auto mb-1" />
          <div className="text-2xl font-bold text-purple-600">{teamTotals.totalPhotos}</div>
          <div className="text-xs text-muted-foreground">Photos Logged</div>
        </div>
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-muted/60 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : stats.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>No activity yet for this period.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stats.map((member, index) => (
            <div
              key={member.profile.id}
              className={`p-4 rounded-xl border transition-colors ${getRankBg(index)} ${
                member.profile.id === currentUser?.id ? "ring-2 ring-primary/30" : ""
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Rank */}
                <div className="shrink-0">
                  {getRankIcon(index)}
                </div>

                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center shrink-0">
                  {member.profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.profile.avatar_url}
                      alt={member.profile.full_name || ""}
                      className="w-11 h-11 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-primary-foreground font-medium text-sm">
                      {getInitials(member.profile.full_name)}
                    </span>
                  )}
                </div>

                {/* Name and role */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">
                      {getDisplayName(member.profile)}
                    </span>
                    {member.profile.id === currentUser?.id && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-primary/10 text-primary font-medium">
                        You
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${roleColors[member.profile.role].bg} ${roleColors[member.profile.role].text}`}>
                      {roleLabels[member.profile.role]}
                    </span>
                    {member.currentStreak >= 3 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-orange-500 font-medium">
                        <Flame className="w-3 h-3" />
                        {member.currentStreak} streak
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-5 text-center">
                  <div>
                    <div className="text-lg font-bold">{member.tasksCompleted}</div>
                    <div className="text-[10px] text-muted-foreground">Done</div>
                  </div>
                  <div>
                    <div className={`text-lg font-bold ${
                      member.onTimeRate >= 90 ? "text-green-600" : member.onTimeRate >= 70 ? "text-amber-600" : "text-red-600"
                    }`}>
                      {member.onTimeRate}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">On Time</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-purple-600">{member.photosUploaded}</div>
                    <div className="text-[10px] text-muted-foreground">Photos</div>
                  </div>
                </div>

                {/* Score */}
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-amber-500" />
                    <span className="text-xl font-bold">{member.score}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">points</div>
                </div>
              </div>

              {/* Mobile stats row */}
              <div className="sm:hidden flex items-center justify-between mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                <span>{member.tasksCompleted} tasks done</span>
                <span className={member.onTimeRate >= 90 ? "text-green-600" : ""}>{member.onTimeRate}% on time</span>
                <span>{member.photosUploaded} photos</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
