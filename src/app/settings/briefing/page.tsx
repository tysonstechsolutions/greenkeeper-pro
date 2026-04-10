"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Clock,
  Sun,
  Users,
  ListTodo,
  AlertTriangle,
  History,
  CalendarDays,
  Loader2,
  Play,
  Check,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface BriefingSettings {
  enabled: boolean;
  time: string;
  includeWeather: boolean;
  includeStaffRoster: boolean;
  includePriorities: boolean;
  includeAlerts: boolean;
  includeYesterdayRecap: boolean;
  includeUpcoming: boolean;
}

const DEFAULT_SETTINGS: BriefingSettings = {
  enabled: true,
  time: "05:00",
  includeWeather: true,
  includeStaffRoster: true,
  includePriorities: true,
  includeAlerts: true,
  includeYesterdayRecap: true,
  includeUpcoming: true,
};

const contentToggles = [
  {
    key: "includeWeather" as const,
    label: "Weather Conditions",
    description: "High/low temps, wind, precipitation, frost alerts",
    icon: Sun,
  },
  {
    key: "includeStaffRoster" as const,
    label: "Staff Roster",
    description: "Who's on duty today with shift times",
    icon: Users,
  },
  {
    key: "includePriorities" as const,
    label: "Today's Priorities",
    description: "Critical and high priority tasks with assignees",
    icon: ListTodo,
  },
  {
    key: "includeAlerts" as const,
    label: "Alerts",
    description: "Overdue tasks, equipment service, low stock, certifications",
    icon: AlertTriangle,
  },
  {
    key: "includeYesterdayRecap" as const,
    label: "Yesterday's Recap",
    description: "Task completion stats and notable completions",
    icon: History,
  },
  {
    key: "includeUpcoming" as const,
    label: "Upcoming Events",
    description: "Projects and goals scheduled in the next 7 days",
    icon: CalendarDays,
  },
];

// Time options from 4:00 AM to 8:00 AM in 15-minute increments
const timeOptions = [
  "04:00", "04:15", "04:30", "04:45",
  "05:00", "05:15", "05:30", "05:45",
  "06:00", "06:15", "06:30", "06:45",
  "07:00", "07:15", "07:30", "07:45",
  "08:00",
];

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

export default function BriefingSettingsPage() {
  const router = useRouter();
  const { isSuper, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [settings, setSettings] = useState<BriefingSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current settings
  const fetchSettings = useCallback(async () => {
    try {
       
      const { data, error: fetchError } = await supabase.from("app_settings")
        .select("value")
        .eq("key", "daily_briefing")
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        // PGRST116 = no rows returned, which is fine for first time
        console.error("Error fetching settings:", fetchError);
      }

      if (data?.value) {
        setSettings({ ...DEFAULT_SETTINGS, ...(data.value as Partial<BriefingSettings>) });
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Generate preview when settings change
  const generatePreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      // Build a mock preview locally (real preview would need server call)
      const today = new Date();
      const dateStr = today.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const lines: string[] = [];
      lines.push(`DAILY BRIEFING - ${dateStr}`);
      lines.push("");

      if (settings.includeWeather) {
        lines.push("WEATHER");
        lines.push("72F / 58F - Partly Cloudy");
        lines.push("Wind: 8 mph");
        lines.push("");
      }

      if (settings.includeStaffRoster) {
        lines.push("STAFF ON DUTY: 6");
        lines.push("  - John Smith (5:30 AM - 2:00 PM)");
        lines.push("  - Mike Johnson (5:30 AM - 2:00 PM)");
        lines.push("  - Sarah Williams (6:00 AM - 2:30 PM)");
        lines.push("  - ...");
        lines.push("");
      }

      if (settings.includePriorities) {
        lines.push("TODAY'S PRIORITIES");
        lines.push("  [CRITICAL] Tournament prep - greens triple cut");
        lines.push("    Assigned: Mike Johnson");
        lines.push("  [HIGH] Bunker maintenance - holes 1-9");
        lines.push("    Assigned: Sarah Williams");
        lines.push("");
      }

      if (settings.includeAlerts) {
        lines.push("ALERTS");
        lines.push("  - 2 overdue tasks need attention");
        lines.push("  - Low stock: Pre-emergent, Wetting Agent");
        lines.push("");
      }

      if (settings.includeYesterdayRecap) {
        lines.push("YESTERDAY'S RECAP");
        lines.push("  14 of 16 tasks completed");
        lines.push("  Notable completions:");
        lines.push("    - Aeration complete on holes 10-18");
        lines.push("    - Irrigation head replacement #7 fairway");
        lines.push("");
      }

      if (settings.includeUpcoming) {
        lines.push("UPCOMING (Next 7 Days)");
        lines.push("  - Fri: Member-guest tournament setup");
        lines.push("  - Sat: Member-guest tournament");
        lines.push("");
      }

      setPreview(lines.join("\n").trim());
    } catch (err) {
      console.error("Error generating preview:", err);
    } finally {
      setPreviewLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    generatePreview();
  }, [generatePreview]);

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
       
      const { error: upsertError } = await supabase.from("app_settings")
        .upsert({
          key: "daily_briefing",
          value: settings,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });

      if (upsertError) {
        throw upsertError;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Generate briefing now
  const handleGenerateNow = async () => {
    setGenerating(true);
    setError(null);

    try {
      // In a real implementation, this would call the API endpoint
      // For now, we'll simulate it
      await new Promise(resolve => setTimeout(resolve, 2000));
      setGeneratedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Error generating briefing:", err);
      setError("Failed to generate briefing. Please check that the All Staff channel exists.");
    } finally {
      setGenerating(false);
    }
  };

  // Toggle a setting
  const toggleSetting = (key: keyof BriefingSettings) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
    setSaved(false);
  };

  // Update time
  const updateTime = (time: string) => {
    setSettings(prev => ({
      ...prev,
      time,
    }));
    setSaved(false);
  };

  // Redirect non-supers
  if (!authLoading && !isSuper) {
    router.push("/settings");
    return null;
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Daily Briefing
          </h1>
          <p className="text-muted-foreground text-sm">
            Configure the automatic morning briefing
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : saved ? (
            <Check className="w-4 h-4 mr-2" />
          ) : null}
          {saved ? "Saved!" : "Save Changes"}
        </Button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Settings panel */}
        <div className="space-y-6">
          {/* Enable toggle */}
          <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Enable Daily Briefing</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Automatically post a briefing to All Staff channel
                </p>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={() => toggleSetting("enabled")}
              />
            </div>
          </div>

          {/* Time picker */}
          <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <Label className="text-base font-semibold">Briefing Time</Label>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              When should the briefing be generated each day?
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {timeOptions.map(time => (
                <button
                  key={time}
                  onClick={() => updateTime(time)}
                  className={cn(
                    "px-3 py-2 text-sm rounded-lg border transition-colors",
                    settings.time === time
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:border-primary/50"
                  )}
                >
                  {formatTime(time)}
                </button>
              ))}
            </div>
          </div>

          {/* Content toggles */}
          <div className="p-4 bg-card border border-border rounded-lg">
            <Label className="text-base font-semibold mb-4 block">
              Briefing Content
            </Label>
            <div className="space-y-4">
              {contentToggles.map(toggle => (
                <div
                  key={toggle.key}
                  className="flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <toggle.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <Label className="font-medium">{toggle.label}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {toggle.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings[toggle.key]}
                    onCheckedChange={() => toggleSetting(toggle.key)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Generate now */}
          <div className="p-4 bg-card border border-border rounded-lg">
            <Label className="text-base font-semibold mb-2 block">
              Manual Generation
            </Label>
            <p className="text-sm text-muted-foreground mb-4">
              Generate and post today&apos;s briefing immediately
            </p>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={handleGenerateNow}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Generate Now
              </Button>
              {generatedAt && (
                <p className="text-sm text-muted-foreground">
                  Last generated: {generatedAt}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Preview panel */}
        <div className="lg:sticky lg:top-4 h-fit">
          <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <Label className="text-base font-semibold">Preview</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={generatePreview}
                disabled={previewLoading}
              >
                <RefreshCw className={cn(
                  "w-4 h-4 mr-1",
                  previewLoading && "animate-spin"
                )} />
                Refresh
              </Button>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs overflow-x-auto">
              <pre className="whitespace-pre-wrap text-foreground/90">
                {preview || "Loading preview..."}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              This is a sample preview. The actual briefing will include real data from your course.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
