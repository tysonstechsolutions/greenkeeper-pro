"use client";

import { useState, useEffect } from "react";
import {
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  ChevronDown,
  Check,
  Loader2,
  Clock,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DetailPageHeader } from "@/components/ui/back-button";
import {
  useGolferFeedback,
  feedbackTypeLabels,
  feedbackAreaLabels,
  feedbackStatusLabels,
  type FeedbackType,
  type FeedbackArea,
  type FeedbackStatus,
} from "@/lib/hooks/useGolferFeedback";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const feedbackTypeIcons: Record<FeedbackType, React.ComponentType<{ className?: string }>> = {
  compliment: ThumbsUp,
  complaint: ThumbsDown,
  suggestion: Lightbulb,
};

export default function FeedbackPage() {
  const {
    feedback,
    loading,
    fetchFeedback,
    submitFeedback,
    updateFeedbackStatus,
    canRespond,
  } = useGolferFeedback();

  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");
  const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(null);
  const [area, setArea] = useState<FeedbackArea | null>(null);
  const [holeNumber, setHoleNumber] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">("all");

  const backHref = "/dashboard";

  // Load feedback history
  useEffect(() => {
    if (activeTab === "history") {
      fetchFeedback(statusFilter === "all" ? undefined : statusFilter);
    }
  }, [activeTab, statusFilter, fetchFeedback]);

  const handleSubmit = async () => {
    if (!feedbackType || !area || !notes.trim()) return;

    setSubmitting(true);
    const success = await submitFeedback(
      feedbackType,
      area,
      notes,
      holeNumber || undefined
    );

    if (success) {
      setSubmitted(true);
      // Reset form after delay
      setTimeout(() => {
        setSubmitted(false);
        setFeedbackType(null);
        setArea(null);
        setHoleNumber(null);
        setNotes("");
      }, 2000);
    }

    setSubmitting(false);
  };

  const handleStatusUpdate = async (
    feedbackId: string,
    newStatus: FeedbackStatus
  ) => {
    await updateFeedbackStatus(feedbackId, newStatus);
  };

  const isValid = feedbackType && area && notes.trim();

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <DetailPageHeader
        backHref={backHref}
        backLabel="Dashboard"
        title="Golfer Feedback"
        subtitle="Log customer feedback for the maintenance team"
        className="mb-6"
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "submit" | "history")}
        className="max-w-2xl mx-auto"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="submit">Submit Feedback</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Submit Tab */}
        <TabsContent value="submit" className="space-y-6 mt-6">
          {submitted ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Feedback Submitted</h2>
              <p className="text-muted-foreground">
                The superintendent will see this feedback in their dashboard.
              </p>
            </div>
          ) : (
            <>
              {/* Feedback Type */}
              <div className="space-y-2">
                <Label>Type of Feedback *</Label>
                <div className="grid grid-cols-3 gap-3">
                  {(Object.keys(feedbackTypeLabels) as FeedbackType[]).map((type) => {
                    const Icon = feedbackTypeIcons[type];
                    const isSelected = feedbackType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setFeedbackType(type)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <Icon
                          className={cn(
                            "w-6 h-6",
                            isSelected && type === "compliment" && "text-green-500",
                            isSelected && type === "complaint" && "text-red-500",
                            isSelected && type === "suggestion" && "text-blue-500"
                          )}
                        />
                        <span className="text-sm font-medium">
                          {feedbackTypeLabels[type]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Area */}
              <div className="space-y-2">
                <Label>Area *</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      {area ? (
                        <span>{feedbackAreaLabels[area]}</span>
                      ) : (
                        <span className="text-muted-foreground">Select area</span>
                      )}
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    {(Object.keys(feedbackAreaLabels) as FeedbackArea[]).map((a) => (
                      <DropdownMenuItem
                        key={a}
                        onClick={() => setArea(a)}
                        className={cn(area === a && "bg-primary/10")}
                      >
                        {feedbackAreaLabels[a]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Hole Number (optional) */}
              <div className="space-y-2">
                <Label>Hole Number (Optional)</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      {holeNumber ? (
                        <span>Hole {holeNumber}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          Select hole (if applicable)
                        </span>
                      )}
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    <DropdownMenuItem onClick={() => setHoleNumber(null)}>
                      No specific hole
                    </DropdownMenuItem>
                    <div className="grid grid-cols-3 gap-1 p-1">
                      {Array.from({ length: 18 }, (_, i) => i + 1).map((num) => (
                        <DropdownMenuItem
                          key={num}
                          onClick={() => setHoleNumber(num)}
                          className={cn(
                            "justify-center",
                            holeNumber === num && "bg-primary/10"
                          )}
                        >
                          {num}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Details *</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What did the golfer say? Include any specific details..."
                  rows={4}
                />
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleSubmit}
                disabled={!isValid || submitting}
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
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Submit Feedback
                  </>
                )}
              </Button>
            </>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          {/* Filter */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">
              {feedback.length} items
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  {statusFilter === "all" ? "All Status" : feedbackStatusLabels[statusFilter]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setStatusFilter("all")}>
                  All Status
                </DropdownMenuItem>
                {(Object.keys(feedbackStatusLabels) as FeedbackStatus[]).map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => setStatusFilter(status)}
                  >
                    {feedbackStatusLabels[status]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Feedback List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : feedback.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>No feedback submitted yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedback.map((item) => {
                const Icon = feedbackTypeIcons[item.feedback_type];
                return (
                  <div
                    key={item.id}
                    className="bg-card rounded-lg border border-border p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center",
                            item.feedback_type === "compliment" && "bg-green-500/10",
                            item.feedback_type === "complaint" && "bg-red-500/10",
                            item.feedback_type === "suggestion" && "bg-blue-500/10"
                          )}
                        >
                          <Icon
                            className={cn(
                              "w-4 h-4",
                              item.feedback_type === "compliment" && "text-green-500",
                              item.feedback_type === "complaint" && "text-red-500",
                              item.feedback_type === "suggestion" && "text-blue-500"
                            )}
                          />
                        </div>
                        <div>
                          <span className="font-medium">
                            {feedbackTypeLabels[item.feedback_type]}
                          </span>
                          <span className="text-muted-foreground mx-1">·</span>
                          <span className="text-sm text-muted-foreground">
                            {feedbackAreaLabels[item.area]}
                          </span>
                          {item.hole_number && (
                            <>
                              <span className="text-muted-foreground mx-1">·</span>
                              <span className="text-sm text-muted-foreground">
                                Hole {item.hole_number}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          item.status === "new" && "bg-blue-500/10 text-blue-700 border-blue-500/20",
                          item.status === "acknowledged" && "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
                          item.status === "in_progress" && "bg-orange-500/10 text-orange-700 border-orange-500/20",
                          item.status === "resolved" && "bg-green-500/10 text-green-700 border-green-500/20",
                          item.status === "dismissed" && "bg-gray-500/10 text-gray-500 border-gray-500/20"
                        )}
                      >
                        {feedbackStatusLabels[item.status]}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground mb-2">
                      {item.notes}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </div>

                      {/* Status actions for superintendents */}
                      {canRespond && item.status === "new" && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusUpdate(item.id, "acknowledged")}
                          >
                            Acknowledge
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusUpdate(item.id, "resolved")}
                          >
                            Resolve
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Superintendent response */}
                    {item.superintendent_response && (
                      <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Response:
                        </p>
                        <p className="text-sm">{item.superintendent_response}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
