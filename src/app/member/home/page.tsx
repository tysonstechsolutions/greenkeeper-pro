"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { useCourseStatus, courseStatusLabels, courseStatusColors } from "@/lib/hooks/useCourseStatus";
import { useWeather } from "@/lib/hooks/useWeather";
import { useTeeTimes, formatTeeTime } from "@/lib/hooks/useTeeTimes";
import { useCommunity } from "@/lib/hooks/useCommunity";
import { usePhotos } from "@/lib/hooks/usePhotos";
import {
  Calendar,
  Users,
  Star,
  Sun,
  Wind,
  Droplets,
  Clock,
  ChevronRight,
  Flag,
  Thermometer,
  Image,
  MessageCircle,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function MemberHomePage() {
  const { profile, loading: authLoading } = useAuth();
  const { courseStatus, loading: statusLoading } = useCourseStatus();
  const { currentWeather, loading: weatherLoading } = useWeather();
  const { teeTimes, fetchMyTeeTimes, loading: teeTimesLoading } = useTeeTimes();
  const { posts, fetchPosts, loading: postsLoading } = useCommunity();
  const { photos, fetchPhotos, loading: photosLoading } = usePhotos();

  useEffect(() => {
    void fetchMyTeeTimes();
    void fetchPosts();
    void fetchPhotos({}, 0);
  }, [fetchMyTeeTimes, fetchPosts, fetchPhotos]);

  // Filter to upcoming tee times
  const upcomingTeeTimes = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return teeTimes
      .filter((t) => t.tee_date >= today && t.status === "confirmed")
      .slice(0, 3);
  }, [teeTimes]);

  const recentPosts = posts.slice(0, 3);
  const recentPhotos = photos.slice(0, 3);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const statusColor = courseStatus
    ? courseStatusColors[courseStatus.status]
    : courseStatusColors.open;

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/50 to-background dark:from-green-950/20 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-green-700 to-emerald-800 text-white px-4 pt-6 pb-8">
        <div className="max-w-lg mx-auto">
          <p className="text-green-100 text-sm">Welcome back,</p>
          <h1 className="text-2xl font-bold">
            {profile?.full_name?.split(" ")[0] || "Golfer"}
          </h1>

          {/* Weather */}
          {currentWeather && (
            <div className="flex items-center gap-4 mt-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Thermometer className="w-4 h-4 text-green-200" />
                <span>{currentWeather.temp_f}°F</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Wind className="w-4 h-4 text-green-200" />
                <span>{currentWeather.wind_mph} mph</span>
              </div>
              {currentWeather.precipitation_chance > 0 && (
                <div className="flex items-center gap-1.5">
                  <Droplets className="w-4 h-4 text-green-200" />
                  <span>{currentWeather.precipitation_chance}%</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Course Status Banner */}
      {courseStatus && (
        <div className="px-4 -mt-4">
          <div className="max-w-lg mx-auto">
            <div
              className={cn(
                "rounded-xl border p-4",
                statusColor.bg,
                statusColor.border
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full",
                      courseStatus.status === "open"
                        ? "bg-green-500"
                        : courseStatus.status === "closed"
                        ? "bg-red-500"
                        : "bg-yellow-500"
                    )}
                  />
                  <div>
                    <p className={cn("font-semibold", statusColor.text)}>
                      {courseStatusLabels[courseStatus.status]}
                    </p>
                    {courseStatus.message && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {courseStatus.message}
                      </p>
                    )}
                  </div>
                </div>
                {courseStatus.estimated_open_time && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Est. Open</p>
                    <p className={cn("font-medium", statusColor.text)}>
                      {courseStatus.estimated_open_time}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 mt-6 max-w-lg mx-auto space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          <Link href="/member/tee-times">
            <div className="flex flex-col items-center p-4 bg-card rounded-xl border border-border hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <span className="text-sm font-medium text-center">
                Book Tee Time
              </span>
            </div>
          </Link>
          <Link href="/member/community">
            <div className="flex flex-col items-center p-4 bg-card rounded-xl border border-border hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-2">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-center">
                Community
              </span>
            </div>
          </Link>
          <Link href="/member/feedback">
            <div className="flex flex-col items-center p-4 bg-card rounded-xl border border-border hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                <Star className="w-6 h-6 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-center">
                Rate Round
              </span>
            </div>
          </Link>
        </div>

        {/* Course Conditions */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Today&apos;s Conditions</h2>
            <Link
              href="/course-map"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View Map <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">10.5</div>
              <p className="text-xs text-muted-foreground">Green Speed</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">Good</div>
              <p className="text-xs text-muted-foreground">Condition</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600">Middle</div>
              <p className="text-xs text-muted-foreground">Pin Position</p>
            </div>
          </div>

          {/* Recent Course Photos */}
          {recentPhotos.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <Image className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Recent Photos
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {recentPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="aspect-square rounded-lg bg-muted overflow-hidden"
                  >
                    <img
                      src={photo.storage_path}
                      alt={photo.caption || "Course photo"}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Upcoming Tee Times */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Your Tee Times</h2>
            <Link
              href="/member/tee-times"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {teeTimesLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
            </div>
          ) : upcomingTeeTimes.length > 0 ? (
            <div className="space-y-3">
              {upcomingTeeTimes.map((teeTime) => (
                <div
                  key={teeTime.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Flag className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {new Date(teeTime.tee_date).toLocaleDateString(
                          "en-US",
                          {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatTeeTime(teeTime.tee_time)} •{" "}
                        {teeTime.num_players} player
                        {teeTime.num_players > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-600 font-medium">
                    Confirmed
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">
                No upcoming tee times
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link href="/member/tee-times">Book Now</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Community Feed Preview */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Community</h2>
            <Link
              href="/member/community"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              See All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {postsLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
            </div>
          ) : recentPosts.length > 0 ? (
            <div className="space-y-3">
              {recentPosts.map((post) => (
                <div
                  key={post.id}
                  className={cn(
                    "p-3 rounded-lg",
                    post.is_official
                      ? "bg-amber-500/5 border border-amber-500/20"
                      : "bg-muted/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-primary">
                        {post.author?.full_name?.charAt(0) || "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {post.author?.full_name || "Unknown"}
                        </span>
                        {post.is_official && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400">
                            Official
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                        {post.content}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          {post.likes_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          {post.comments_count}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">
                No posts yet. Be the first!
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href="/member/community">Join Discussion</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
