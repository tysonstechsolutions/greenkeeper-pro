"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeftRight,
  CalendarDays,
  Clock,
  User,
  Check,
  X,
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/resilient-fetch";
import { getDisplayName, getInitials } from "@/lib/hooks/useProfiles";

interface ShiftSwapPost {
  id: string;
  posted_by: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  shift_type: string;
  description: string;
  reason: string;
  status: "open" | "claimed" | "approved" | "denied" | "cancelled";
  claimed_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  poster?: {
    full_name: string;
    avatar_url: string | null;
  };
  claimer?: {
    full_name: string;
    avatar_url: string | null;
  };
  approver?: {
    full_name: string;
    avatar_url: string | null;
  };
}

type TabType = "available" | "my-posts" | "pending" | "approve";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":");
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "open":
      return "bg-blue-500/10 text-blue-600";
    case "claimed":
      return "bg-amber-500/10 text-amber-600";
    case "approved":
      return "bg-green-500/10 text-green-600";
    case "denied":
      return "bg-red-500/10 text-red-600";
    case "cancelled":
      return "bg-gray-500/10 text-gray-600";
    default:
      return "bg-gray-500/10 text-gray-600";
  }
}

interface PostFormState {
  shift_date: string;
  shift_start: string;
  shift_end: string;
  shift_type: string;
  reason: string;
  description: string;
}

const defaultFormState: PostFormState = {
  shift_date: "",
  shift_start: "",
  shift_end: "",
  shift_type: "morning",
  reason: "",
  description: "",
};

export default function ShiftSwapPage() {
  const { profile, user, isSuper, isAsstSuper } = useAuth();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabType>("available");
  const [posts, setPosts] = useState<ShiftSwapPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [showPostForm, setShowPostForm] = useState(false);
  const [formState, setFormState] = useState<PostFormState>(defaultFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isManager = isSuper || isAsstSuper;

  // Format today for date input
  const today = new Date().toISOString().split("T")[0];

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await withTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("shift_swap_posts") as any)
          .select(
            "*, poster:posted_by(full_name, avatar_url), claimer:claimed_by(full_name, avatar_url), approver:approved_by(full_name, avatar_url)"
          )
          .order("shift_date", { ascending: true })
          .order("shift_start", { ascending: true }),
        8000,
        { data: null, error: null }
      );

      if (result.error) {
        console.error("Error fetching shift swaps:", result.error);
        setPosts([]);
      } else {
        setPosts((result.data as ShiftSwapPost[]) || []);
      }
    } catch (err) {
      console.error("Unexpected error fetching shift swaps:", err);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handlePostShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsPosting(true);

    if (!formState.shift_date || !formState.shift_start || !formState.shift_end) {
      setFormError("Date and times are required");
      setIsPosting(false);
      return;
    }

    if (formState.shift_start >= formState.shift_end) {
      setFormError("End time must be after start time");
      setIsPosting(false);
      return;
    }

    try {
      const result = await withTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("shift_swap_posts") as any).insert([
          {
            posted_by: user?.id,
            shift_date: formState.shift_date,
            shift_start: formState.shift_start,
            shift_end: formState.shift_end,
            shift_type: formState.shift_type,
            reason: formState.reason || null,
            description: formState.description || null,
            status: "open",
          },
        ]),
        8000,
        { data: null, error: null }
      );

      if (result.error) {
        setFormError(result.error.message || "Failed to post shift");
      } else {
        setFormState(defaultFormState);
        setShowPostForm(false);
        await fetchPosts();
      }
    } catch (err) {
      console.error("Error posting shift:", err);
      setFormError("An error occurred while posting the shift");
    } finally {
      setIsPosting(false);
    }
  };

  const handleClaimShift = async (postId: string) => {
    setActionLoading(postId);
    try {
      const result = await withTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("shift_swap_posts") as any)
          .update({
            claimed_by: user?.id,
            status: "claimed",
          })
          .eq("id", postId),
        8000,
        { data: null, error: null }
      );

      if (result.error) {
        console.error("Error claiming shift:", result.error);
      } else {
        await fetchPosts();
      }
    } catch (err) {
      console.error("Error claiming shift:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelPost = async (postId: string) => {
    setActionLoading(postId);
    try {
      const result = await withTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("shift_swap_posts") as any)
          .update({ status: "cancelled" })
          .eq("id", postId),
        8000,
        { data: null, error: null }
      );

      if (result.error) {
        console.error("Error cancelling post:", result.error);
      } else {
        await fetchPosts();
      }
    } catch (err) {
      console.error("Error cancelling post:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveSwap = async (postId: string) => {
    setActionLoading(postId);
    try {
      const result = await withTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("shift_swap_posts") as any)
          .update({
            status: "approved",
            approved_by: user?.id,
            approved_at: new Date().toISOString(),
          })
          .eq("id", postId),
        8000,
        { data: null, error: null }
      );

      if (result.error) {
        console.error("Error approving swap:", result.error);
      } else {
        await fetchPosts();
      }
    } catch (err) {
      console.error("Error approving swap:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDenySwap = async (postId: string) => {
    setActionLoading(postId);
    try {
      const result = await withTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("shift_swap_posts") as any)
          .update({
            status: "denied",
            approved_by: user?.id,
            approved_at: new Date().toISOString(),
          })
          .eq("id", postId),
        8000,
        { data: null, error: null }
      );

      if (result.error) {
        console.error("Error denying swap:", result.error);
      } else {
        await fetchPosts();
      }
    } catch (err) {
      console.error("Error denying swap:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Filter logic
  const availablePosts = posts.filter(
    (p) =>
      p.status === "open" &&
      p.posted_by !== user?.id &&
      new Date(p.shift_date) >= new Date(today)
  );

  const myPosts = posts.filter((p) => p.posted_by === user?.id);

  const pendingClaims = posts.filter(
    (p) => p.claimed_by === user?.id && p.status === "claimed"
  );

  const allPending = posts.filter((p) => p.status === "claimed");

  const renderShiftCard = (post: ShiftSwapPost, showClaimButton?: boolean, showCancelButton?: boolean, showApproveButtons?: boolean) => {
    const isLoading = actionLoading === post.id;

    return (
      <div
        key={post.id}
        className="p-4 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold">{formatDate(post.shift_date)}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(post.status)}`}>
                {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>
                {formatTime(post.shift_start)} - {formatTime(post.shift_end)}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2 mb-3">
          <div className="text-sm">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Shift Type</div>
            <div className="font-medium capitalize">{post.shift_type}</div>
          </div>

          {post.reason && (
            <div className="text-sm">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Reason</div>
              <div>{post.reason}</div>
            </div>
          )}

          {post.description && (
            <div className="text-sm">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Details</div>
              <div className="line-clamp-2">{post.description}</div>
            </div>
          )}
        </div>

        {/* Posted by */}
        <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-muted/50">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
            {getInitials(post.poster?.full_name)}
          </div>
          <span className="text-sm">
            <span className="text-muted-foreground">Posted by </span>
            <span className="font-medium">{getDisplayName(post.poster || {})}</span>
          </span>
        </div>

        {/* Claimed by (if claimed) */}
        {post.claimed_by && post.claimer && (
          <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-amber-500/5">
            <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-medium">
              {getInitials(post.claimer.full_name)}
            </div>
            <span className="text-sm">
              <span className="text-muted-foreground">Claimed by </span>
              <span className="font-medium">{getDisplayName(post.claimer)}</span>
            </span>
          </div>
        )}

        {/* Approved by (if approved/denied) */}
        {(post.status === "approved" || post.status === "denied") && post.approver && (
          <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-muted/50">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
              {getInitials(post.approver.full_name)}
            </div>
            <span className="text-sm">
              <span className="text-muted-foreground">
                {post.status === "approved" ? "Approved by " : "Denied by "}
              </span>
              <span className="font-medium">{getDisplayName(post.approver)}</span>
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mt-4">
          {showClaimButton && post.status === "open" && (
            <Button
              size="sm"
              onClick={() => handleClaimShift(post.id)}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Check className="w-3 h-3 mr-1.5" />}
              Claim Shift
            </Button>
          )}

          {showCancelButton && post.status === "open" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCancelPost(post.id)}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <X className="w-3 h-3 mr-1.5" />}
              Cancel
            </Button>
          )}

          {showApproveButtons && post.status === "claimed" && (
            <>
              <Button
                size="sm"
                onClick={() => handleApproveSwap(post.id)}
                disabled={isLoading}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Check className="w-3 h-3 mr-1.5" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDenySwap(post.id)}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <X className="w-3 h-3 mr-1.5" />}
                Deny
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <h2 className="text-lg font-semibold">Loading shift board...</h2>
          <p className="text-sm text-muted-foreground mt-1">Fetching available shifts</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ArrowLeftRight className="w-6 h-6 text-primary" />
              Shift Swap Board
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Post and manage shift swaps</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchPosts}
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Post Shift Form (Collapsible) */}
      <div className="mb-6 p-4 rounded-lg bg-card border border-border">
        <button
          onClick={() => setShowPostForm(!showPostForm)}
          className="w-full flex items-center justify-between font-semibold hover:text-primary transition-colors"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Post a Shift
          </div>
          <ChevronDown
            className={`w-5 h-5 transition-transform ${showPostForm ? "rotate-180" : ""}`}
          />
        </button>

        {showPostForm && (
          <div className="mt-4 pt-4 border-t border-border">
            <form onSubmit={handlePostShift} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-500/10 text-red-600 text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Shift Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formState.shift_date}
                    onChange={(e) =>
                      setFormState({ ...formState, shift_date: e.target.value })
                    }
                    min={today}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Shift Type
                  </label>
                  <select
                    value={formState.shift_type}
                    onChange={(e) =>
                      setFormState({ ...formState, shift_type: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                  >
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="split">Split</option>
                    <option value="full">Full Day</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Start Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={formState.shift_start}
                    onChange={(e) =>
                      setFormState({ ...formState, shift_start: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    End Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={formState.shift_end}
                    onChange={(e) =>
                      setFormState({ ...formState, shift_end: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1.5">
                    Reason for Swap
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Personal appointment, Family event"
                    value={formState.reason}
                    onChange={(e) =>
                      setFormState({ ...formState, reason: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1.5">
                    Additional Details
                  </label>
                  <textarea
                    placeholder="Any extra information that might help someone pick up this shift..."
                    value={formState.description}
                    onChange={(e) =>
                      setFormState({ ...formState, description: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={isPosting}
                  className="flex-1"
                >
                  {isPosting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Post Shift
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowPostForm(false);
                    setFormState(defaultFormState);
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-border flex gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab("available")}
          className={`px-4 py-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === "available"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Available Shifts ({availablePosts.length})
        </button>
        <button
          onClick={() => setActiveTab("my-posts")}
          className={`px-4 py-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === "my-posts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          My Posts ({myPosts.length})
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-4 py-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === "pending"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          My Claims ({pendingClaims.length})
        </button>
        {isManager && (
          <button
            onClick={() => setActiveTab("approve")}
            className={`px-4 py-3 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === "approve"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Pending Approvals ({allPending.length})
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div>
        {/* Available Shifts Tab */}
        {activeTab === "available" && (
          <div>
            {availablePosts.length === 0 ? (
              <div className="text-center py-12 rounded-lg bg-muted/30 border border-dashed">
                <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <h3 className="font-semibold mb-1">No Available Shifts</h3>
                <p className="text-sm text-muted-foreground">
                  All posted shifts have been claimed or there are no shifts available to pick up right now.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availablePosts.map((post) =>
                  renderShiftCard(post, true, false, false)
                )}
              </div>
            )}
          </div>
        )}

        {/* My Posts Tab */}
        {activeTab === "my-posts" && (
          <div>
            {myPosts.length === 0 ? (
              <div className="text-center py-12 rounded-lg bg-muted/30 border border-dashed">
                <User className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <h3 className="font-semibold mb-1">No Posted Shifts</h3>
                <p className="text-sm text-muted-foreground">
                  You haven't posted any shifts yet. Use the form above to get started.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myPosts.map((post) =>
                  renderShiftCard(post, false, post.status === "open", false)
                )}
              </div>
            )}
          </div>
        )}

        {/* Pending Claims Tab */}
        {activeTab === "pending" && (
          <div>
            {pendingClaims.length === 0 ? (
              <div className="text-center py-12 rounded-lg bg-muted/30 border border-dashed">
                <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <h3 className="font-semibold mb-1">No Pending Claims</h3>
                <p className="text-sm text-muted-foreground">
                  You don't have any shifts pending manager approval. Check the available shifts to claim one.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingClaims.map((post) =>
                  renderShiftCard(post, false, false, false)
                )}
              </div>
            )}
          </div>
        )}

        {/* Approval Queue Tab (Managers Only) */}
        {activeTab === "approve" && isManager && (
          <div>
            {allPending.length === 0 ? (
              <div className="text-center py-12 rounded-lg bg-muted/30 border border-dashed">
                <Check className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <h3 className="font-semibold mb-1">No Pending Approvals</h3>
                <p className="text-sm text-muted-foreground">
                  All shift swaps have been reviewed.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allPending.map((post) =>
                  renderShiftCard(post, false, false, true)
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
