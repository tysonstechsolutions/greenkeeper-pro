"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRoundRatings } from "@/lib/hooks/useRoundRatings";
import {
  Star,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  Send,
  Check,
  ChevronDown,
  Loader2,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RoundRating } from "@/types/member";

type RatingCategory = {
  key: keyof RoundRating;
  label: string;
};

const RATING_CATEGORIES: RatingCategory[] = [
  { key: "greens_rating", label: "Greens" },
  { key: "fairways_rating", label: "Fairways" },
  { key: "bunkers_rating", label: "Bunkers" },
  { key: "tees_rating", label: "Tee Boxes" },
  { key: "pace_rating", label: "Pace of Play" },
  { key: "setup_rating", label: "Course Setup" },
  { key: "cleanliness_rating", label: "Cleanliness" },
  { key: "value_rating", label: "Value" },
];

function StarRating({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange: (value: number) => void;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = {
    sm: "w-5 h-5",
    md: "w-8 h-8",
    lg: "w-10 h-10",
  };

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="focus:outline-none"
        >
          <Star
            className={cn(
              sizeClass[size],
              "transition-colors",
              star <= value
                ? "text-amber-500 fill-amber-500"
                : "text-muted-foreground"
            )}
          />
        </button>
      ))}
    </div>
  );
}

export default function MemberFeedbackPage() {
  const { profile, loading: authLoading } = useAuth();
  const { ratings, fetchMyRatings, submitRating, loading } = useRoundRatings();

  const [viewMode, setViewMode] = useState<"rate" | "history">("rate");
  const [roundDate, setRoundDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [overallRating, setOverallRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<Record<string, number>>(
    {}
  );
  const [favoriteHole, setFavoriteHole] = useState<number | null>(null);
  const [comments, setComments] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchMyRatings();
  }, [fetchMyRatings]);

  const handleSubmit = async () => {
    if (overallRating === 0) return;

    setSubmitting(true);

    const success = await submitRating({
      round_date: roundDate,
      overall_rating: overallRating,
      greens_rating: categoryRatings.greens_rating || null,
      fairways_rating: categoryRatings.fairways_rating || null,
      bunkers_rating: categoryRatings.bunkers_rating || null,
      tees_rating: categoryRatings.tees_rating || null,
      pace_rating: categoryRatings.pace_rating || null,
      setup_rating: categoryRatings.setup_rating || null,
      cleanliness_rating: categoryRatings.cleanliness_rating || null,
      value_rating: categoryRatings.value_rating || null,
      favorite_hole: favoriteHole,
      comments: comments.trim() || null,
      would_recommend: wouldRecommend,
    });

    setSubmitting(false);

    if (success) {
      setSubmitted(true);
      // Reset form after a delay
      setTimeout(() => {
        setSubmitted(false);
        setOverallRating(0);
        setCategoryRatings({});
        setFavoriteHole(null);
        setComments("");
        setWouldRecommend(null);
        setRoundDate(new Date().toISOString().split("T")[0]);
      }, 2000);
    }
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
          <h1 className="text-xl font-bold">Rate Your Round</h1>
          <p className="text-green-100 text-sm mt-1">
            Help us improve the course experience
          </p>
        </div>
      </div>

      {/* View Toggle */}
      <div className="px-4 -mt-3">
        <div className="max-w-lg mx-auto">
          <div className="bg-card rounded-xl border border-border p-1 flex">
            <button
              onClick={() => setViewMode("rate")}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2",
                viewMode === "rate"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Star className="w-4 h-4" />
              Rate Round
            </button>
            <button
              onClick={() => setViewMode("history")}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2",
                viewMode === "history"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <History className="w-4 h-4" />
              History
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 max-w-lg mx-auto">
        {viewMode === "rate" ? (
          <div className="space-y-4">
            {submitted ? (
              <div className="bg-card rounded-xl border border-green-500/30 p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Thank You!</h2>
                <p className="text-muted-foreground">
                  Your feedback helps us maintain championship conditions.
                </p>
              </div>
            ) : (
              <>
                {/* Date Selection */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Round Date
                  </label>
                  <input
                    type="date"
                    value={roundDate}
                    onChange={(e) => setRoundDate(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className="w-full px-4 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Overall Rating */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <label className="block text-sm font-medium mb-3">
                    Overall Experience
                  </label>
                  <div className="flex justify-center">
                    <StarRating
                      value={overallRating}
                      onChange={setOverallRating}
                      size="lg"
                    />
                  </div>
                  {overallRating > 0 && (
                    <p className="text-center text-sm text-muted-foreground mt-2">
                      {overallRating === 5
                        ? "Excellent!"
                        : overallRating === 4
                        ? "Very Good"
                        : overallRating === 3
                        ? "Good"
                        : overallRating === 2
                        ? "Fair"
                        : "Needs Improvement"}
                    </p>
                  )}
                </div>

                {/* Category Ratings */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <label className="block text-sm font-medium mb-4">
                    Rate Specific Areas
                  </label>
                  <div className="space-y-4">
                    {RATING_CATEGORIES.map((category) => (
                      <div
                        key={category.key}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm">{category.label}</span>
                        <StarRating
                          value={categoryRatings[category.key] || 0}
                          onChange={(value) =>
                            setCategoryRatings((prev) => ({
                              ...prev,
                              [category.key]: value,
                            }))
                          }
                          size="sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Favorite Hole */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <label className="block text-sm font-medium mb-2">
                    Favorite Hole Today
                  </label>
                  <div className="relative">
                    <select
                      value={favoriteHole || ""}
                      onChange={(e) =>
                        setFavoriteHole(
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                      className="w-full px-4 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                    >
                      <option value="">Select a hole...</option>
                      {Array.from({ length: 18 }, (_, i) => i + 1).map(
                        (hole) => (
                          <option key={hole} value={hole}>
                            Hole {hole}
                          </option>
                        )
                      )}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Comments */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <label className="block text-sm font-medium mb-2">
                    Comments
                  </label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Share your experience..."
                    rows={3}
                    className="w-full px-4 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                {/* Would Recommend */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <label className="block text-sm font-medium mb-3">
                    Would you recommend to a friend?
                  </label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setWouldRecommend(true)}
                      className={cn(
                        "flex-1 py-3 rounded-lg border transition-colors flex items-center justify-center gap-2",
                        wouldRecommend === true
                          ? "border-green-500 bg-green-500/10 text-green-600"
                          : "border-input hover:border-green-500/50"
                      )}
                    >
                      <ThumbsUp className="w-5 h-5" />
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setWouldRecommend(false)}
                      className={cn(
                        "flex-1 py-3 rounded-lg border transition-colors flex items-center justify-center gap-2",
                        wouldRecommend === false
                          ? "border-red-500 bg-red-500/10 text-red-600"
                          : "border-input hover:border-red-500/50"
                      )}
                    >
                      <ThumbsDown className="w-5 h-5" />
                      No
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  onClick={handleSubmit}
                  disabled={overallRating === 0 || submitting}
                  className="w-full"
                  size="lg"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit Rating
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {loading && ratings.length === 0 ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
              </div>
            ) : ratings.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-8 text-center">
                <Star className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No ratings yet</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode("rate")}
                  className="mt-3"
                >
                  Rate Your First Round
                </Button>
              </div>
            ) : (
              ratings.map((rating) => (
                <div
                  key={rating.id}
                  className="bg-card rounded-xl border border-border p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium">
                        {new Date(rating.round_date + "T12:00:00").toLocaleDateString(
                          "en-US",
                          {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              "w-4 h-4",
                              i < rating.overall_rating
                                ? "text-amber-500 fill-amber-500"
                                : "text-muted-foreground"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    {rating.would_recommend !== null && (
                      <div
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                          rating.would_recommend
                            ? "bg-green-500/10 text-green-600"
                            : "bg-red-500/10 text-red-600"
                        )}
                      >
                        {rating.would_recommend ? (
                          <>
                            <ThumbsUp className="w-3 h-3" />
                            Would recommend
                          </>
                        ) : (
                          <>
                            <ThumbsDown className="w-3 h-3" />
                            Would not recommend
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {rating.comments && (
                    <p className="text-sm text-muted-foreground">
                      &quot;{rating.comments}&quot;
                    </p>
                  )}

                  {rating.favorite_hole && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Favorite hole: #{rating.favorite_hole}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
