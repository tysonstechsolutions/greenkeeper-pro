# Plan 2: Feature Fixes & Resilience Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken functionality (settings persistence, weather API, dashboard hardcoded data), add real-time updates via Supabase Realtime, implement error handling with React error boundaries, and add form validation with Zod.

**Architecture:** Settings use a `user_preferences` JSONB column on the profiles table. Weather uses WeatherAPI.com with caching. Activity logging uses a new `activity_log` table. Real-time uses Supabase Realtime channels per table. Error boundaries wrap critical UI sections. Zod schemas validate all form inputs.

**Tech Stack:** Supabase Realtime, Zod, React Error Boundaries, WeatherAPI.com

---

## File Structure

```
src/
├── lib/
│   ├── hooks/
│   │   ├── useUserPreferences.ts    # Settings persistence hook
│   │   ├── useRealtimeSubscription.ts # Generic realtime hook
│   │   ├── useRealtimeTasks.ts      # Tasks realtime hook
│   │   ├── useRealtimeEquipment.ts  # Equipment realtime hook
│   │   └── useRecentActivity.ts     # Activity feed hook
│   ├── utils/
│   │   ├── weather.ts               # Weather API client
│   │   └── api-error.ts             # Error handling utilities
│   └── validations/
│       ├── task.ts                  # Task form schemas
│       ├── chemical.ts              # Chemical application schemas
│       └── settings.ts              # Settings schemas
├── components/
│   ├── error-boundary.tsx           # React error boundary
│   └── ui/
│       └── form-error.tsx           # Form error display
├── app/
│   ├── error.tsx                    # App-level error UI
│   ├── global-error.tsx             # Root error handler
│   └── settings/
│       ├── notifications/page.tsx   # (modify)
│       └── course/page.tsx          # (modify)
supabase/
└── migrations/
    ├── 003_activity_log.sql         # Activity logging table
    └── 004_user_preferences.sql     # Add preferences column
```

---

### Task 1: Create Database Migration for Activity Log

**Files:**
- Create: `supabase/migrations/003_activity_log.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/003_activity_log.sql
-- Activity log table for tracking user actions

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read activity (for dashboard)
CREATE POLICY "activity_log_select_authenticated" ON activity_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- System can insert (we'll use service role for logging)
CREATE POLICY "activity_log_insert_authenticated" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only managers can delete
CREATE POLICY "activity_log_delete_manager" ON activity_log
  FOR DELETE USING (is_manager(auth.uid()));

COMMENT ON TABLE activity_log IS 'Tracks user actions for dashboard activity feed';
```

- [ ] **Step 2: Verify migration syntax**

Run: `cat supabase/migrations/003_activity_log.sql`

Expected: SQL file contents displayed

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_activity_log.sql
git commit -m "db: add activity_log table for tracking user actions"
```

---

### Task 2: Create Database Migration for User Preferences

**Files:**
- Create: `supabase/migrations/004_user_preferences.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/004_user_preferences.sql
-- Add user_preferences JSONB column to profiles table

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS user_preferences JSONB DEFAULT '{
  "notifications": {
    "push_enabled": true,
    "task_assigned": true,
    "task_completed": true,
    "schedule_changes": true,
    "weather_alerts": true,
    "equipment_issues": true,
    "messages": true
  },
  "course": {}
}'::jsonb;

COMMENT ON COLUMN profiles.user_preferences IS 'User preferences for notifications and app settings';
```

- [ ] **Step 2: Verify migration syntax**

Run: `cat supabase/migrations/004_user_preferences.sql`

Expected: SQL file contents displayed

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_user_preferences.sql
git commit -m "db: add user_preferences column to profiles table"
```

---

### Task 3: Update Database Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add UserPreferences type**

Add after the existing interface definitions (around line 160):

```typescript
// User preferences structure
export interface NotificationPreferences {
  push_enabled: boolean;
  task_assigned: boolean;
  task_completed: boolean;
  schedule_changes: boolean;
  weather_alerts: boolean;
  equipment_issues: boolean;
  messages: boolean;
}

export interface CoursePreferences {
  default_view?: 'list' | 'calendar' | 'map';
  theme?: 'light' | 'dark' | 'system';
}

export interface UserPreferences {
  notifications: NotificationPreferences;
  course: CoursePreferences;
}

// Activity log entry
export type ActivityActionType =
  | 'task_created'
  | 'task_completed'
  | 'task_assigned'
  | 'equipment_updated'
  | 'chemical_applied'
  | 'photo_uploaded'
  | 'schedule_changed';

export type ActivityEntityType =
  | 'task'
  | 'equipment'
  | 'chemical_application'
  | 'photo'
  | 'schedule';

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action_type: ActivityActionType;
  entity_type: ActivityEntityType;
  entity_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
```

- [ ] **Step 2: Update Profile interface to include user_preferences**

Find the `Profile` interface and add the field:

```typescript
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  display_name: string | null;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  hire_date: string | null;
  certifications: Certification[];
  emergency_contact: EmergencyContact | null;
  is_active: boolean;
  user_preferences: UserPreferences | null; // Add this line
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Add activity_log to Database type**

In the `Database` interface, add after the existing tables:

```typescript
activity_log: {
  Row: ActivityLog;
  Insert: Omit<ActivityLog, 'id' | 'created_at'> & {
    id?: string;
    created_at?: string;
  };
  Update: Partial<Omit<ActivityLog, 'id'>>;
};
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit src/types/database.ts`

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "types: add UserPreferences and ActivityLog types"
```

---

### Task 4: Create User Preferences Hook

**Files:**
- Create: `src/lib/hooks/useUserPreferences.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/lib/hooks/useUserPreferences.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type { UserPreferences, NotificationPreferences, CoursePreferences } from "@/types/database";

const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: {
    push_enabled: true,
    task_assigned: true,
    task_completed: true,
    schedule_changes: true,
    weather_alerts: true,
    equipment_issues: true,
    messages: true,
  },
  course: {},
};

interface UseUserPreferencesReturn {
  preferences: UserPreferences;
  loading: boolean;
  error: string | null;
  updateNotificationPreferences: (prefs: Partial<NotificationPreferences>) => Promise<boolean>;
  updateCoursePreferences: (prefs: Partial<CoursePreferences>) => Promise<boolean>;
  refreshPreferences: () => Promise<void>;
}

export function useUserPreferences(): UseUserPreferencesReturn {
  const { user, profile } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Load preferences from profile
  const loadPreferences = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("user_preferences")
        .eq("id", user.id)
        .single();

      if (fetchError) {
        console.error("Error loading preferences:", fetchError);
        setError(fetchError.message);
        return;
      }

      if (data?.user_preferences) {
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...data.user_preferences,
        });
      }
    } catch (err) {
      console.error("Unexpected error loading preferences:", err);
      setError("Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  // Initial load
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Update notification preferences
  const updateNotificationPreferences = useCallback(
    async (prefs: Partial<NotificationPreferences>): Promise<boolean> => {
      if (!user) {
        setError("Must be logged in");
        return false;
      }

      const newPreferences: UserPreferences = {
        ...preferences,
        notifications: {
          ...preferences.notifications,
          ...prefs,
        },
      };

      try {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ user_preferences: newPreferences })
          .eq("id", user.id);

        if (updateError) {
          console.error("Error updating preferences:", updateError);
          setError(updateError.message);
          return false;
        }

        setPreferences(newPreferences);
        return true;
      } catch (err) {
        console.error("Unexpected error updating preferences:", err);
        setError("Failed to save preferences");
        return false;
      }
    },
    [user, preferences, supabase]
  );

  // Update course preferences
  const updateCoursePreferences = useCallback(
    async (prefs: Partial<CoursePreferences>): Promise<boolean> => {
      if (!user) {
        setError("Must be logged in");
        return false;
      }

      const newPreferences: UserPreferences = {
        ...preferences,
        course: {
          ...preferences.course,
          ...prefs,
        },
      };

      try {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ user_preferences: newPreferences })
          .eq("id", user.id);

        if (updateError) {
          console.error("Error updating preferences:", updateError);
          setError(updateError.message);
          return false;
        }

        setPreferences(newPreferences);
        return true;
      } catch (err) {
        console.error("Unexpected error updating preferences:", err);
        setError("Failed to save preferences");
        return false;
      }
    },
    [user, preferences, supabase]
  );

  return {
    preferences,
    loading,
    error,
    updateNotificationPreferences,
    updateCoursePreferences,
    refreshPreferences: loadPreferences,
  };
}
```

- [ ] **Step 2: Verify hook compiles**

Run: `npx tsc --noEmit src/lib/hooks/useUserPreferences.ts`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useUserPreferences.ts
git commit -m "feat: add useUserPreferences hook for settings persistence"
```

---

### Task 5: Update Notification Settings Page

**Files:**
- Modify: `src/app/settings/notifications/page.tsx`

- [ ] **Step 1: Import the hook and update component**

Replace the entire file with:

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserPreferences } from "@/lib/hooks/useUserPreferences";
import { useToast } from "@/components/ui/use-toast";

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
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
      toast({
        title: "Settings saved",
        description: "Your notification preferences have been updated.",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
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
```

- [ ] **Step 2: Verify the page compiles**

Run: `npx tsc --noEmit src/app/settings/notifications/page.tsx`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/notifications/page.tsx
git commit -m "feat: connect notification settings to database persistence"
```

---

### Task 6: Create Weather API Client

**Files:**
- Create: `src/lib/utils/weather.ts`

- [ ] **Step 1: Write the weather API client**

```typescript
// src/lib/utils/weather.ts

export interface WeatherData {
  temp_f: number;
  temp_c: number;
  condition: string;
  condition_icon: string;
  humidity: number;
  wind_mph: number;
  wind_direction: string;
  uv: number;
  feels_like_f: number;
  precip_in: number;
  cloud: number;
  is_day: boolean;
}

export interface ForecastDay {
  date: string;
  max_temp_f: number;
  min_temp_f: number;
  condition: string;
  condition_icon: string;
  chance_of_rain: number;
  chance_of_snow: number;
  max_wind_mph: number;
  avg_humidity: number;
  uv: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherAlert {
  headline: string;
  severity: string;
  event: string;
  effective: string;
  expires: string;
  description: string;
}

export interface WeatherResponse {
  current: WeatherData;
  forecast: ForecastDay[];
  alerts: WeatherAlert[];
  location: {
    name: string;
    region: string;
    lat: number;
    lon: number;
    localtime: string;
  };
}

// Cache for weather data (15 minutes)
const CACHE_DURATION_MS = 15 * 60 * 1000;
let weatherCache: { data: WeatherResponse; timestamp: number } | null = null;

/**
 * Fetch current weather and forecast from WeatherAPI.com
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  days: number = 3
): Promise<WeatherResponse | null> {
  // Check cache first
  if (weatherCache && Date.now() - weatherCache.timestamp < CACHE_DURATION_MS) {
    return weatherCache.data;
  }

  const apiKey = process.env.NEXT_PUBLIC_WEATHER_API_KEY;

  if (!apiKey) {
    console.error("Weather API key not configured");
    return null;
  }

  try {
    const response = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${lat},${lng}&days=${days}&alerts=yes&aqi=no`,
      { next: { revalidate: 900 } } // Cache for 15 minutes
    );

    if (!response.ok) {
      console.error("Weather API error:", response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    const weatherResponse: WeatherResponse = {
      current: {
        temp_f: data.current.temp_f,
        temp_c: data.current.temp_c,
        condition: data.current.condition.text,
        condition_icon: data.current.condition.icon,
        humidity: data.current.humidity,
        wind_mph: data.current.wind_mph,
        wind_direction: data.current.wind_dir,
        uv: data.current.uv,
        feels_like_f: data.current.feelslike_f,
        precip_in: data.current.precip_in,
        cloud: data.current.cloud,
        is_day: data.current.is_day === 1,
      },
      forecast: data.forecast.forecastday.map((day: any) => ({
        date: day.date,
        max_temp_f: day.day.maxtemp_f,
        min_temp_f: day.day.mintemp_f,
        condition: day.day.condition.text,
        condition_icon: day.day.condition.icon,
        chance_of_rain: day.day.daily_chance_of_rain,
        chance_of_snow: day.day.daily_chance_of_snow,
        max_wind_mph: day.day.maxwind_mph,
        avg_humidity: day.day.avghumidity,
        uv: day.day.uv,
        sunrise: day.astro.sunrise,
        sunset: day.astro.sunset,
      })),
      alerts: (data.alerts?.alert || []).map((alert: any) => ({
        headline: alert.headline,
        severity: alert.severity,
        event: alert.event,
        effective: alert.effective,
        expires: alert.expires,
        description: alert.desc,
      })),
      location: {
        name: data.location.name,
        region: data.location.region,
        lat: data.location.lat,
        lon: data.location.lon,
        localtime: data.location.localtime,
      },
    };

    // Update cache
    weatherCache = {
      data: weatherResponse,
      timestamp: Date.now(),
    };

    return weatherResponse;
  } catch (error) {
    console.error("Error fetching weather:", error);
    // Return cached data if available, even if stale
    return weatherCache?.data || null;
  }
}

/**
 * Get weather-based recommendations for turf management
 */
export function getWeatherRecommendations(weather: WeatherData): string[] {
  const recommendations: string[] = [];

  // Frost warning
  if (weather.temp_f < 36) {
    recommendations.push("Frost risk: Delay mowing until grass is dry");
  }

  // Heat stress
  if (weather.temp_f > 90) {
    recommendations.push("Heat stress: Increase irrigation, avoid heavy traffic on greens");
  }

  // High wind
  if (weather.wind_mph > 20) {
    recommendations.push("High wind: Postpone chemical applications");
  }

  // Rain expected
  if (weather.precip_in > 0) {
    recommendations.push("Rain expected: Consider postponing fertilizer applications");
  }

  // High UV
  if (weather.uv >= 8) {
    recommendations.push("High UV: Ensure staff have sun protection");
  }

  // Good conditions
  if (
    weather.temp_f >= 50 &&
    weather.temp_f <= 85 &&
    weather.wind_mph < 15 &&
    weather.precip_in === 0
  ) {
    recommendations.push("Ideal conditions for chemical applications and mowing");
  }

  return recommendations;
}

/**
 * Clear the weather cache (useful for testing or manual refresh)
 */
export function clearWeatherCache(): void {
  weatherCache = null;
}
```

- [ ] **Step 2: Verify the module compiles**

Run: `npx tsc --noEmit src/lib/utils/weather.ts`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils/weather.ts
git commit -m "feat: add WeatherAPI.com client with caching"
```

---

### Task 7: Update Briefing Generation to Use Weather API

**Files:**
- Modify: `src/lib/utils/generate-briefing.ts`

- [ ] **Step 1: Import weather client**

At the top of the file, add:

```typescript
import { fetchWeather, getWeatherRecommendations, type WeatherResponse } from "./weather";
```

- [ ] **Step 2: Update fetchAndStoreWeather function**

Replace the `fetchAndStoreWeather` function (around line 586-604) with:

```typescript
/**
 * Fetches weather from WeatherAPI.com and updates the weather_log
 */
export async function fetchAndStoreWeather(date: Date, lat: number, lng: number): Promise<boolean> {
  const supabase = createServiceClient();
  const dateStr = date.toISOString().split("T")[0];

  try {
    const weather = await fetchWeather(lat, lng, 1);

    if (!weather) {
      console.error("Failed to fetch weather data");
      return ensureWeatherLogExists(date);
    }

    const todayForecast = weather.forecast[0];

    // Upsert weather log
    const { error } = await supabase
      .from("weather_logs")
      .upsert({
        log_date: dateStr,
        high_temp_f: Math.round(todayForecast?.max_temp_f || weather.current.temp_f),
        low_temp_f: Math.round(todayForecast?.min_temp_f || weather.current.temp_f),
        precipitation_inches: weather.current.precip_in,
        wind_max_mph: Math.round(todayForecast?.max_wind_mph || weather.current.wind_mph),
        humidity_avg: Math.round(todayForecast?.avg_humidity || weather.current.humidity),
        conditions: weather.current.condition,
        frost_observed: weather.current.temp_f < 32,
        raw_data: weather as unknown as Record<string, unknown>,
      }, {
        onConflict: "log_date",
      });

    if (error) {
      console.error("Error storing weather:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error fetching and storing weather:", error);
    return ensureWeatherLogExists(date);
  }
}
```

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit src/lib/utils/generate-briefing.ts`

Expected: No errors (may need to create weather.ts first)

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils/generate-briefing.ts
git commit -m "feat: connect briefing generation to live weather API"
```

---

### Task 8: Create Recent Activity Hook

**Files:**
- Create: `src/lib/hooks/useRecentActivity.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/lib/hooks/useRecentActivity.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ActivityLog, Profile } from "@/types/database";

export interface ActivityWithUser extends ActivityLog {
  user?: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

interface UseRecentActivityReturn {
  activities: ActivityWithUser[];
  loading: boolean;
  error: string | null;
  fetchActivities: (limit?: number) => Promise<void>;
  logActivity: (
    actionType: ActivityLog["action_type"],
    entityType: ActivityLog["entity_type"],
    description: string,
    entityId?: string,
    metadata?: Record<string, unknown>
  ) => Promise<boolean>;
}

export function useRecentActivity(): UseRecentActivityReturn {
  const [activities, setActivities] = useState<ActivityWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchActivities = useCallback(
    async (limit: number = 10) => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("activity_log")
          .select(`
            *,
            user:profiles!activity_log_user_id_fkey(id, full_name, avatar_url)
          `)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (fetchError) {
          console.error("Error fetching activities:", fetchError);
          setError(fetchError.message);
          return;
        }

        setActivities((data as ActivityWithUser[]) || []);
      } catch (err) {
        console.error("Unexpected error fetching activities:", err);
        setError("Failed to load activities");
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const logActivity = useCallback(
    async (
      actionType: ActivityLog["action_type"],
      entityType: ActivityLog["entity_type"],
      description: string,
      entityId?: string,
      metadata?: Record<string, unknown>
    ): Promise<boolean> => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          console.warn("Cannot log activity: no authenticated user");
          return false;
        }

        const { error: insertError } = await supabase
          .from("activity_log")
          .insert({
            user_id: user.id,
            action_type: actionType,
            entity_type: entityType,
            entity_id: entityId || null,
            description,
            metadata: metadata || {},
          });

        if (insertError) {
          console.error("Error logging activity:", insertError);
          return false;
        }

        // Refresh activities list
        await fetchActivities();
        return true;
      } catch (err) {
        console.error("Unexpected error logging activity:", err);
        return false;
      }
    },
    [supabase, fetchActivities]
  );

  // Initial fetch
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  return {
    activities,
    loading,
    error,
    fetchActivities,
    logActivity,
  };
}
```

- [ ] **Step 2: Verify hook compiles**

Run: `npx tsc --noEmit src/lib/hooks/useRecentActivity.ts`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useRecentActivity.ts
git commit -m "feat: add useRecentActivity hook for dashboard activity feed"
```

---

### Task 9: Update Dashboard with Real Activity Data

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Import useRecentActivity hook**

Add to imports:

```typescript
import { useRecentActivity, type ActivityWithUser } from "@/lib/hooks/useRecentActivity";
```

- [ ] **Step 2: Add hook to component and state**

Inside the `DashboardPage` component, add after other hooks:

```typescript
const { activities, loading: activitiesLoading } = useRecentActivity();
```

- [ ] **Step 3: Create helper function for activity icons**

Add before the component:

```typescript
function getActivityIcon(actionType: string) {
  switch (actionType) {
    case "task_created":
    case "task_assigned":
      return Plus;
    case "task_completed":
      return CheckCircle2;
    case "equipment_updated":
      return Wrench;
    case "chemical_applied":
      return FlaskConical;
    case "photo_uploaded":
      return Camera;
    case "schedule_changed":
      return Calendar;
    default:
      return Clock;
  }
}

function formatActivityTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
```

- [ ] **Step 4: Replace hardcoded Recent Activity section**

Find the Recent Activity section (around line 452-478) and replace with:

```typescript
{/* Recent Activity */}
<div className="bg-card rounded-lg border border-border p-6">
  <div className="flex items-center justify-between mb-4">
    <h2 className="font-semibold">Recent Activity</h2>
    <Clock className="w-4 h-4 text-muted-foreground" />
  </div>
  {activitiesLoading ? (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
      ))}
    </div>
  ) : activities.length > 0 ? (
    <div className="space-y-3">
      {activities.slice(0, 4).map((activity) => {
        const IconComponent = getActivityIcon(activity.action_type);
        return (
          <div
            key={activity.id}
            className="flex items-center gap-3 p-2 rounded-md"
          >
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <IconComponent className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{activity.description}</p>
              <p className="text-xs text-muted-foreground">
                {activity.user?.full_name || "System"} • {formatActivityTime(activity.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <div className="text-center py-6 text-muted-foreground">
      <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p className="text-sm">No recent activity</p>
    </div>
  )}
</div>
```

- [ ] **Step 5: Verify the page compiles**

Run: `npx tsc --noEmit src/app/dashboard/page.tsx`

Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: replace hardcoded dashboard activity with real data"
```

---

### Task 10: Create Error Boundary Component

**Files:**
- Create: `src/components/error-boundary.tsx`

- [ ] **Step 1: Write the error boundary**

```typescript
// src/components/error-boundary.tsx
"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    // TODO: Send to Sentry in production
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-4 max-w-md">
            We encountered an unexpected error. Please try again.
          </p>
          <Button onClick={this.handleReset} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          {process.env.NODE_ENV === "development" && this.state.error && (
            <details className="mt-4 text-left text-xs text-muted-foreground max-w-lg">
              <summary className="cursor-pointer">Error details</summary>
              <pre className="mt-2 p-2 bg-muted rounded overflow-auto">
                {this.state.error.message}
                {"\n"}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Verify component compiles**

Run: `npx tsc --noEmit src/components/error-boundary.tsx`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/error-boundary.tsx
git commit -m "feat: add React error boundary component"
```

---

### Task 11: Create App-Level Error Pages

**Files:**
- Create: `src/app/error.tsx`
- Create: `src/app/global-error.tsx`

- [ ] **Step 1: Create error.tsx (app-level error UI)**

```typescript
// src/app/error.tsx
"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log to error reporting service
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <AlertTriangle className="w-16 h-16 text-destructive mb-6" />
      <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        We encountered an error loading this page. Please try again or return to the dashboard.
      </p>
      <div className="flex gap-4">
        <Button onClick={reset} variant="default">
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <Home className="w-4 h-4 mr-2" />
            Dashboard
          </Link>
        </Button>
      </div>
      {process.env.NODE_ENV === "development" && (
        <details className="mt-8 text-left text-xs text-muted-foreground max-w-2xl">
          <summary className="cursor-pointer">Error details (dev only)</summary>
          <pre className="mt-2 p-4 bg-muted rounded overflow-auto">
            {error.message}
            {"\n\n"}
            {error.stack}
            {error.digest && `\n\nDigest: ${error.digest}`}
          </pre>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create global-error.tsx (root error handler)**

```typescript
// src/app/global-error.tsx
"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html>
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-background text-foreground">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-6" />
          <h1 className="text-2xl font-semibold mb-2">Application Error</h1>
          <p className="text-gray-600 mb-6 text-center max-w-md">
            A critical error occurred. Please refresh the page to continue.
          </p>
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Page
          </button>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify files compile**

Run: `npx tsc --noEmit src/app/error.tsx src/app/global-error.tsx`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/error.tsx src/app/global-error.tsx
git commit -m "feat: add app-level and global error pages"
```

---

### Task 12: Create Zod Validation Schemas

**Files:**
- Create: `src/lib/validations/task.ts`
- Create: `src/lib/validations/chemical.ts`

- [ ] **Step 1: Install Zod**

```bash
npm install zod
```

- [ ] **Step 2: Create task validation schema**

```typescript
// src/lib/validations/task.ts
import { z } from "zod";

export const taskSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must be less than 100 characters"),
  description: z.string().max(1000, "Description too long").optional().nullable(),
  category: z.enum([
    "mowing",
    "irrigation",
    "chemical",
    "mechanical",
    "landscaping",
    "construction",
    "bunker",
    "greens",
    "admin",
    "safety",
    "other",
    "pro_shop",
    "events",
    "customer_service",
  ]),
  priority: z.enum(["critical", "high", "normal", "low"]),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  due_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Invalid time format")
    .optional()
    .nullable(),
  assigned_to: z.string().uuid("Invalid user ID").optional().nullable(),
  assigned_crew: z.string().max(50).optional().nullable(),
  zone_id: z.string().uuid("Invalid zone ID").optional().nullable(),
  estimated_minutes: z.number().int().min(1).max(1440).optional().nullable(),
  equipment_needed: z.array(z.string()).default([]),
  requires_photo_before: z.boolean().default(false),
  requires_photo_after: z.boolean().default(false),
  weather_dependent: z.boolean().default(false),
  notes: z.string().max(2000).optional().nullable(),
});

export type TaskFormData = z.infer<typeof taskSchema>;

export function validateTask(data: unknown): { success: true; data: TaskFormData } | { success: false; errors: Record<string, string> } {
  const result = taskSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    errors[path] = issue.message;
  }

  return { success: false, errors };
}
```

- [ ] **Step 3: Create chemical application validation schema**

```typescript
// src/lib/validations/chemical.ts
import { z } from "zod";

export const chemicalApplicationSchema = z.object({
  product_id: z.string().uuid("Select a product"),
  application_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  application_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Invalid time format")
    .optional()
    .nullable(),
  zone_ids: z.array(z.string().uuid()).min(1, "Select at least one zone"),
  hole_numbers: z.array(z.number().int().min(1).max(18)).optional(),
  area_treated_sqft: z.number().int().min(1, "Area must be positive").optional().nullable(),
  application_rate: z
    .string()
    .max(100, "Rate description too long")
    .optional()
    .nullable(),
  total_amount_used: z
    .number()
    .positive("Amount must be positive")
    .optional()
    .nullable(),
  method: z.enum(["spray", "granular", "injection", "drench", "other"]).optional().nullable(),
  weather_temp_f: z
    .number()
    .int()
    .min(-20, "Temperature too low")
    .max(120, "Temperature too high")
    .optional()
    .nullable(),
  weather_wind_mph: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .nullable(),
  weather_wind_direction: z.string().max(10).optional().nullable(),
  weather_humidity: z.number().int().min(0).max(100).optional().nullable(),
  target_pest: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type ChemicalApplicationFormData = z.infer<typeof chemicalApplicationSchema>;

export function validateChemicalApplication(
  data: unknown
): { success: true; data: ChemicalApplicationFormData } | { success: false; errors: Record<string, string> } {
  const result = chemicalApplicationSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    errors[path] = issue.message;
  }

  return { success: false, errors };
}
```

- [ ] **Step 4: Verify schemas compile**

Run: `npx tsc --noEmit src/lib/validations/task.ts src/lib/validations/chemical.ts`

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/validations/
git commit -m "feat: add Zod validation schemas for tasks and chemical applications"
```

---

### Task 13: Create Generic Realtime Subscription Hook

**Files:**
- Create: `src/lib/hooks/useRealtimeSubscription.ts`

- [ ] **Step 1: Write the generic realtime hook**

```typescript
// src/lib/hooks/useRealtimeSubscription.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type PostgresChangeEvent = "INSERT" | "UPDATE" | "DELETE";

interface UseRealtimeSubscriptionOptions<T> {
  table: string;
  schema?: string;
  event?: PostgresChangeEvent | "*";
  filter?: string;
  onInsert?: (payload: T) => void;
  onUpdate?: (payload: T, oldPayload: Partial<T>) => void;
  onDelete?: (oldPayload: Partial<T>) => void;
  enabled?: boolean;
}

export function useRealtimeSubscription<T extends { id: string }>({
  table,
  schema = "public",
  event = "*",
  filter,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeSubscriptionOptions<T>) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = createClient();

  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<T>) => {
      if (payload.eventType === "INSERT" && onInsert) {
        onInsert(payload.new as T);
      } else if (payload.eventType === "UPDATE" && onUpdate) {
        onUpdate(payload.new as T, payload.old as Partial<T>);
      } else if (payload.eventType === "DELETE" && onDelete) {
        onDelete(payload.old as Partial<T>);
      }
    },
    [onInsert, onUpdate, onDelete]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Create channel name
    const channelName = `${table}-realtime-${Date.now()}`;

    // Set up subscription config
    const subscriptionConfig: {
      event: PostgresChangeEvent | "*";
      schema: string;
      table: string;
      filter?: string;
    } = {
      event,
      schema,
      table,
    };

    if (filter) {
      subscriptionConfig.filter = filter;
    }

    // Subscribe
    const channel = supabase
      .channel(channelName)
      .on<T>("postgres_changes", subscriptionConfig, handleChange)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`Realtime subscription active: ${table}`);
        } else if (status === "CHANNEL_ERROR") {
          console.error(`Realtime subscription error: ${table}`);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [supabase, table, schema, event, filter, enabled, handleChange]);

  return {
    isSubscribed: !!channelRef.current,
  };
}
```

- [ ] **Step 2: Verify hook compiles**

Run: `npx tsc --noEmit src/lib/hooks/useRealtimeSubscription.ts`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useRealtimeSubscription.ts
git commit -m "feat: add generic useRealtimeSubscription hook"
```

---

### Task 14: Final Verification and Test

**Files:**
- None (verification only)

- [ ] **Step 1: Run TypeScript check on all new files**

Run: `npx tsc --noEmit`

Expected: No errors

- [ ] **Step 2: Run existing tests**

Run: `npm run test:run`

Expected: All tests pass

- [ ] **Step 3: Start dev server and verify dashboard loads**

Run: `npm run dev`

Navigate to: `http://localhost:3000/dashboard`

Expected: Dashboard loads without errors

- [ ] **Step 4: Test notification settings persistence**

1. Navigate to Settings > Notifications
2. Toggle a setting
3. Refresh the page
4. Verify setting is preserved

Expected: Settings persist across page refresh

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Plan 2 - Feature Fixes & Resilience

- Settings persistence with useUserPreferences hook
- Weather API integration with WeatherAPI.com
- Activity log table and useRecentActivity hook
- Dashboard displays real activity data
- Error boundaries and error pages
- Zod validation schemas for forms
- Generic realtime subscription hook
- Database migrations for new features"
```

---

## Summary

After completing Plan 2, you will have:

1. **Settings Persistence** - Notification and course settings save to database
2. **Live Weather Data** - WeatherAPI.com integration with caching
3. **Activity Logging** - Real activity feed on dashboard
4. **Error Handling** - Error boundaries and error pages
5. **Form Validation** - Zod schemas for tasks and chemical applications
6. **Realtime Foundation** - Generic subscription hook for future use
7. **Database Migrations** - activity_log table and user_preferences column

The application now has resilient error handling and persistent settings, ready for Plan 3 (DevOps & Monitoring).
