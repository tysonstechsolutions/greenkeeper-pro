"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/resilient-fetch";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Plus,
  Settings2,
  Trash2,
  Play,
  Square,
  Archive,
  Eye,
  MessageSquare,
  Users,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  ClipboardList,
} from "lucide-react";

interface PollOption {
  id: string;
  label: string;
  description?: string;
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
  updated_at: string;
  poll_options: PollOption[];
  poll_votes: Array<{ id: string }>;
  poll_comments: Array<{ id: string }>;
}

interface CreatePollForm {
  title: string;
  description: string;
  poll_type: "improvement" | "satisfaction" | "preference" | "ranking" | "general";
  options: Array<{ label: string; description: string }>;
  allow_comments: boolean;
  is_anonymous: boolean;
  max_choices: number;
  ends_at?: string;
}

const POLL_TYPES = {
  improvement: { label: "Improvement", color: "bg-blue-100 text-blue-800" },
  satisfaction: { label: "Satisfaction", color: "bg-purple-100 text-purple-800" },
  preference: { label: "Preference", color: "bg-teal-100 text-teal-800" },
  ranking: { label: "Ranking", color: "bg-orange-100 text-orange-800" },
  general: { label: "General", color: "bg-gray-100 text-gray-800" },
};

const STATUS_STYLES = {
  draft: "bg-gray-100 text-gray-800",
  active: "bg-green-100 text-green-800",
  closed: "bg-amber-100 text-amber-800",
  archived: "bg-slate-100 text-slate-800",
};

const AUTHORIZED_ROLES = ["super", "asst_super", "director", "pro"];

export default function ManagePollsPage() {
  const { profile, isSuper, isAsstSuper } = useAuth();
  const supabase = createClient();

  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "active" | "draft" | "closed">("all");

  const [formData, setFormData] = useState<CreatePollForm>({
    title: "",
    description: "",
    poll_type: "general",
    options: [
      { label: "", description: "" },
      { label: "", description: "" },
    ],
    allow_comments: true,
    is_anonymous: false,
    max_choices: 1,
    ends_at: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isAuthorized =
    isSuper ||
    isAsstSuper ||
    (profile?.role && AUTHORIZED_ROLES.includes(profile.role));

  useEffect(() => {
    if (isAuthorized) {
      fetchPolls();
    }
  }, [isAuthorized]);

  const fetchPolls = async () => {
    setLoading(true);
    setError(null);

    const query = supabase
      .from("polls")
      .select("*, poll_options(id, label, description), poll_votes(id), poll_comments(id)")
      .order("created_at", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await withTimeout(query as any, 8000, { data: null, error: null });

    if (result.error) {
      setError("Failed to load polls");
      setPolls([]);
    } else {
      setPolls(result.data || []);
    }
    setLoading(false);
  };

  const handleAddOption = () => {
    setFormData({
      ...formData,
      options: [...formData.options, { label: "", description: "" }],
    });
  };

  const handleRemoveOption = (index: number) => {
    const newOptions = formData.options.filter((_, i) => i !== index);
    setFormData({ ...formData, options: newOptions });
  };

  const handleOptionChange = (index: number, field: string, value: string) => {
    const newOptions = [...formData.options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setFormData({ ...formData, options: newOptions });
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      setError("Poll title is required");
      return false;
    }
    if (formData.options.filter((o) => o.label.trim()).length < 2) {
      setError("At least 2 options are required");
      return false;
    }
    setError(null);
    return true;
  };

  const createPoll = async (publishImmediately: boolean) => {
    if (!validateForm()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const cleanedOptions = formData.options.filter((o) => o.label.trim());

      // Insert poll
      const pollData = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        poll_type: formData.poll_type,
        status: publishImmediately ? "active" : "draft",
        allow_comments: formData.allow_comments,
        is_anonymous: formData.is_anonymous,
        max_choices: formData.max_choices,
        ends_at: formData.ends_at || null,
        created_by: profile?.id,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertPoll = (supabase.from("polls") as any).insert([pollData]).select().single();
      const pollResult = await withTimeout(insertPoll, 8000, { data: null, error: null });

      if (pollResult.error || !pollResult.data) {
        setError("Failed to create poll");
        setSubmitting(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const poll = pollResult.data as any;

      // Insert options
      const optionsToInsert = cleanedOptions.map((opt, idx) => ({
        poll_id: poll.id,
        label: opt.label.trim(),
        description: opt.description.trim() || null,
        sort_order: idx,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertOptions = (supabase.from("poll_options") as any).insert(optionsToInsert);
      await withTimeout(insertOptions, 8000, { data: null, error: null });

      setSuccess(
        publishImmediately
          ? "Poll published successfully!"
          : "Poll saved as draft successfully!"
      );

      // Reset form
      setFormData({
        title: "",
        description: "",
        poll_type: "general",
        options: [
          { label: "", description: "" },
          { label: "", description: "" },
        ],
        allow_comments: true,
        is_anonymous: false,
        max_choices: 1,
        ends_at: "",
      });
      setShowCreateForm(false);

      // Refresh polls
      await fetchPolls();
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const updatePollStatus = async (pollId: string, newStatus: string) => {
    setActionLoading(pollId);
    setError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateQuery = (supabase.from("polls") as any).update({ status: newStatus }).eq("id", pollId);
    const result = await withTimeout(updateQuery, 8000, { data: null, error: null });

    if (result.error) {
      setError(`Failed to update poll status`);
    } else {
      setSuccess(`Poll status updated to ${newStatus}`);
      await fetchPolls();
    }
    setActionLoading(null);
  };

  const deletePoll = async (pollId: string) => {
    if (!confirm("Are you sure you want to delete this draft poll? This action cannot be undone.")) {
      return;
    }

    setActionLoading(pollId);
    setError(null);

    const deleteQuery = supabase.from("polls").delete().eq("id", pollId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await withTimeout(deleteQuery as any, 8000, { data: null, error: null });

    if (result.error) {
      setError("Failed to delete poll");
    } else {
      setSuccess("Poll deleted successfully");
      await fetchPolls();
    }
    setActionLoading(null);
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-800 font-medium">Not authorized</p>
            <p className="text-red-700 text-sm mt-1">
              You must have manager permissions to access this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const filteredPolls = polls.filter((poll) => {
    if (filterTab === "all") return true;
    return poll.status === filterTab;
  });

  const getVoteCount = (poll: Poll) => poll.poll_votes?.length || 0;
  const getCommentCount = (poll: Poll) => poll.poll_comments?.length || 0;
  const getUniqueVoters = (poll: Poll) => {
    // In a real scenario, you'd need to fetch unique user_ids from poll_votes
    // For now, just return vote count as approximation
    return getVoteCount(poll);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Manage Polls
          </h1>
          <p className="text-gray-600 mt-1">Create and manage surveys for golf course members</p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800 text-sm">{success}</p>
          </div>
        )}

        {/* Create Poll Section */}
        <div className="mb-8 bg-white rounded-lg shadow">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition"
          >
            <div className="flex items-center gap-3">
              <Plus className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-900">Create New Poll</span>
            </div>
            {showCreateForm ? (
              <ChevronUp className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-600" />
            )}
          </button>

          {showCreateForm && (
            <div className="border-t border-gray-200 p-6">
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Poll Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Course Maintenance Priorities"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Optional context for voters"
                    rows={3}
                  />
                </div>

                {/* Poll Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Poll Type</label>
                  <select
                    value={formData.poll_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        poll_type: e.target.value as CreatePollForm["poll_type"],
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    {Object.entries(POLL_TYPES).map(([key, { label }]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Options */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Poll Options * (minimum 2)
                  </label>
                  <div className="space-y-3">
                    {formData.options.map((option, idx) => (
                      <div key={idx} className="flex gap-2">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={option.label}
                            onChange={(e) => handleOptionChange(idx, "label", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder={`Option ${idx + 1}`}
                          />
                        </div>
                        <div className="flex-1">
                          <input
                            type="text"
                            value={option.description}
                            onChange={(e) => handleOptionChange(idx, "description", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder="Description (optional)"
                          />
                        </div>
                        {formData.options.length > 2 && (
                          <button
                            onClick={() => handleRemoveOption(idx)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleAddOption}
                    className="mt-3 flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Option
                  </button>
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="datetime-local"
                    value={formData.ends_at}
                    onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Settings */}
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="allow_comments"
                      checked={formData.allow_comments}
                      onChange={(e) =>
                        setFormData({ ...formData, allow_comments: e.target.checked })
                      }
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <label htmlFor="allow_comments" className="ml-3 text-sm font-medium text-gray-700">
                      Allow comments on this poll
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="is_anonymous"
                      checked={formData.is_anonymous}
                      onChange={(e) =>
                        setFormData({ ...formData, is_anonymous: e.target.checked })
                      }
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <label htmlFor="is_anonymous" className="ml-3 text-sm font-medium text-gray-700">
                      Anonymous voting
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max choices per voter
                    </label>
                    <select
                      value={formData.max_choices}
                      onChange={(e) =>
                        setFormData({ ...formData, max_choices: parseInt(e.target.value) })
                      }
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} choice{n > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={() => createPoll(false)}
                    disabled={submitting}
                    variant="outline"
                    className="flex-1"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save as Draft"
                    )}
                  </Button>
                  <Button
                    onClick={() => createPoll(true)}
                    disabled={submitting}
                    className="flex-1"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Publish Now
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {(["all", "active", "draft", "closed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition ${
                filterTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Polls List */}
        <div>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          ) : filteredPolls.length === 0 ? (
            <div className="bg-white rounded-lg p-8 text-center">
              <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">
                {filterTab === "all" ? "No polls yet." : `No ${filterTab} polls.`}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredPolls.map((poll) => (
                <div key={poll.id} className="bg-white rounded-lg shadow hover:shadow-md transition p-6">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{poll.title}</h3>
                        <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${POLL_TYPES[poll.poll_type].color}`}>
                          {POLL_TYPES[poll.poll_type].label}
                        </span>
                        <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${STATUS_STYLES[poll.status]}`}>
                          {poll.status.charAt(0).toUpperCase() + poll.status.slice(1)}
                        </span>
                      </div>
                      {poll.description && (
                        <p className="text-gray-600 text-sm">{poll.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-3 gap-4 mb-4 py-3 border-y border-gray-200">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-gray-600 text-sm mb-1">
                        <ClipboardList className="w-4 h-4" />
                        Votes
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{getVoteCount(poll)}</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-gray-600 text-sm mb-1">
                        <Users className="w-4 h-4" />
                        Voters
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{getUniqueVoters(poll)}</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-gray-600 text-sm mb-1">
                        <MessageSquare className="w-4 h-4" />
                        Comments
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{getCommentCount(poll)}</p>
                    </div>
                  </div>

                  {/* Poll Options Preview */}
                  {poll.poll_options && poll.poll_options.length > 0 && (
                    <div className="mb-4 bg-gray-50 p-3 rounded">
                      <p className="text-xs font-medium text-gray-700 mb-2">Options:</p>
                      <div className="space-y-1">
                        {poll.poll_options.map((opt) => (
                          <p key={opt.id} className="text-sm text-gray-600">
                            • {opt.label}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Date Range */}
                  {(poll.starts_at || poll.ends_at) && (
                    <p className="text-xs text-gray-500 mb-4">
                      {poll.ends_at
                        ? `Ends: ${new Date(poll.ends_at).toLocaleDateString()}`
                        : "No end date"}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/polls/results/${poll.id}`}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    >
                      <Eye className="w-4 h-4" />
                      View Results
                    </a>

                    {poll.status === "draft" && (
                      <>
                        <button
                          onClick={() => updatePollStatus(poll.id, "active")}
                          disabled={actionLoading === poll.id}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-50"
                        >
                          {actionLoading === poll.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Activate
                        </button>
                        <button
                          onClick={() => deletePoll(poll.id)}
                          disabled={actionLoading === poll.id}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                        >
                          {actionLoading === poll.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                          Delete
                        </button>
                      </>
                    )}

                    {poll.status === "active" && (
                      <button
                        onClick={() => updatePollStatus(poll.id, "closed")}
                        disabled={actionLoading === poll.id}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition disabled:opacity-50"
                      >
                        {actionLoading === poll.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                        Close
                      </button>
                    )}

                    {poll.status === "closed" && (
                      <button
                        onClick={() => updatePollStatus(poll.id, "archived")}
                        disabled={actionLoading === poll.id}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition disabled:opacity-50"
                      >
                        {actionLoading === poll.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Archive className="w-4 h-4" />
                        )}
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <button
          onClick={fetchPolls}
          disabled={refreshing}
          className="fixed bottom-8 right-8 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
    </div>
  );
}
