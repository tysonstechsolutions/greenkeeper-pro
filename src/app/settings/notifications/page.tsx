"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserPreferences } from "@/lib/hooks/useUserPreferences";

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const {
    preferences,
    loading,
    error,
    updateNotificationPreferences,
  } = useUserPreferences();

  const notificationPrefs = preferences.notifications;

  const handleToggle = async (
    key: keyof typeof notificationPrefs,
    value: boolean
  ) => {
    const success = await updateNotificationPreferences({ [key]: value });

    if (success) {
      setSaveMessage({ type: 'success', text: 'Settings saved' });
      setTimeout(() => setSaveMessage(null), 3000);
    } else {
      setSaveMessage({ type: 'error', text: 'Failed to save settings' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 pb-24 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Push and email preferences</p>
        </div>
      </div>

      {/* Persistent migration / load error */}
      {error && !saveMessage && (
        <div className="mb-4 p-3 rounded-lg flex items-start gap-2 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Save Message */}
      {saveMessage && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
          saveMessage.type === 'success'
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          {saveMessage.type === 'success' ? (
            <Check className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">{saveMessage.text}</span>
        </div>
      )}

      <div className="max-w-md space-y-6">
        {/* Push Notifications Master Toggle */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Push Notifications</CardTitle>
                <CardDescription>Receive notifications on your device</CardDescription>
              </div>
              <Switch
                checked={notificationPrefs.push_enabled}
                onCheckedChange={(checked) => handleToggle("push_enabled", checked)}
              />
            </div>
          </CardHeader>
        </Card>

        {/* Notification Types */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notification Types</CardTitle>
            <CardDescription>Choose what you want to be notified about</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="taskAssigned" className="flex-1">
                <div className="font-medium">Task Assigned</div>
                <div className="text-sm text-muted-foreground">When you are assigned a new task</div>
              </Label>
              <Switch
                id="taskAssigned"
                checked={notificationPrefs.task_assigned}
                onCheckedChange={(checked) => handleToggle("task_assigned", checked)}
                disabled={!notificationPrefs.push_enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="taskCompleted" className="flex-1">
                <div className="font-medium">Task Completed</div>
                <div className="text-sm text-muted-foreground">When a task you created is completed</div>
              </Label>
              <Switch
                id="taskCompleted"
                checked={notificationPrefs.task_completed}
                onCheckedChange={(checked) => handleToggle("task_completed", checked)}
                disabled={!notificationPrefs.push_enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="scheduleChanges" className="flex-1">
                <div className="font-medium">Schedule Changes</div>
                <div className="text-sm text-muted-foreground">When your schedule is updated</div>
              </Label>
              <Switch
                id="scheduleChanges"
                checked={notificationPrefs.schedule_changes}
                onCheckedChange={(checked) => handleToggle("schedule_changes", checked)}
                disabled={!notificationPrefs.push_enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="weatherAlerts" className="flex-1">
                <div className="font-medium">Weather Alerts</div>
                <div className="text-sm text-muted-foreground">Severe weather warnings</div>
              </Label>
              <Switch
                id="weatherAlerts"
                checked={notificationPrefs.weather_alerts}
                onCheckedChange={(checked) => handleToggle("weather_alerts", checked)}
                disabled={!notificationPrefs.push_enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="equipmentIssues" className="flex-1">
                <div className="font-medium">Equipment Issues</div>
                <div className="text-sm text-muted-foreground">When equipment needs attention</div>
              </Label>
              <Switch
                id="equipmentIssues"
                checked={notificationPrefs.equipment_issues}
                onCheckedChange={(checked) => handleToggle("equipment_issues", checked)}
                disabled={!notificationPrefs.push_enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="messages" className="flex-1">
                <div className="font-medium">Messages</div>
                <div className="text-sm text-muted-foreground">New messages in your channels</div>
              </Label>
              <Switch
                id="messages"
                checked={notificationPrefs.messages}
                onCheckedChange={(checked) => handleToggle("messages", checked)}
                disabled={!notificationPrefs.push_enabled}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
