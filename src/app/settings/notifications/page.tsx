"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Notification preferences state
  const [pushEnabled, setPushEnabled] = useState(true);
  const [taskAssigned, setTaskAssigned] = useState(true);
  const [taskCompleted, setTaskCompleted] = useState(true);
  const [scheduleChanges, setScheduleChanges] = useState(true);
  const [weatherAlerts, setWeatherAlerts] = useState(true);
  const [equipmentIssues, setEquipmentIssues] = useState(true);
  const [messages, setMessages] = useState(true);

  const handleSave = async () => {
    setSaving(true);
    // TODO: Save notification preferences to database
    await new Promise(resolve => setTimeout(resolve, 500));
    setSaving(false);
    router.back();
  };

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

      <div className="max-w-md space-y-6">
        {/* Push Notifications Master Toggle */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Push Notifications</CardTitle>
                <CardDescription>Receive notifications on your device</CardDescription>
              </div>
              <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} />
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
                checked={taskAssigned}
                onCheckedChange={setTaskAssigned}
                disabled={!pushEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="taskCompleted" className="flex-1">
                <div className="font-medium">Task Completed</div>
                <div className="text-sm text-muted-foreground">When a task you created is completed</div>
              </Label>
              <Switch
                id="taskCompleted"
                checked={taskCompleted}
                onCheckedChange={setTaskCompleted}
                disabled={!pushEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="scheduleChanges" className="flex-1">
                <div className="font-medium">Schedule Changes</div>
                <div className="text-sm text-muted-foreground">When your schedule is updated</div>
              </Label>
              <Switch
                id="scheduleChanges"
                checked={scheduleChanges}
                onCheckedChange={setScheduleChanges}
                disabled={!pushEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="weatherAlerts" className="flex-1">
                <div className="font-medium">Weather Alerts</div>
                <div className="text-sm text-muted-foreground">Severe weather warnings</div>
              </Label>
              <Switch
                id="weatherAlerts"
                checked={weatherAlerts}
                onCheckedChange={setWeatherAlerts}
                disabled={!pushEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="equipmentIssues" className="flex-1">
                <div className="font-medium">Equipment Issues</div>
                <div className="text-sm text-muted-foreground">When equipment needs attention</div>
              </Label>
              <Switch
                id="equipmentIssues"
                checked={equipmentIssues}
                onCheckedChange={setEquipmentIssues}
                disabled={!pushEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="messages" className="flex-1">
                <div className="font-medium">Messages</div>
                <div className="text-sm text-muted-foreground">New messages in your channels</div>
              </Label>
              <Switch
                id="messages"
                checked={messages}
                onCheckedChange={setMessages}
                disabled={!pushEnabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Preferences
        </Button>
      </div>
    </div>
  );
}
