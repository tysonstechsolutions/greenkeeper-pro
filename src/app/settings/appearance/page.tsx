"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Palette, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Theme = "light" | "dark" | "system";

export default function AppearanceSettingsPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme") as Theme | null;
      if (stored) return stored;
    }
    return "system";
  });

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);

    const root = document.documentElement;
    root.classList.remove("light", "dark");

    if (newTheme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(newTheme);
    }
  };

  const themeOptions = [
    {
      value: "light" as Theme,
      label: "Light",
      description: "Always use light theme",
      icon: Sun,
    },
    {
      value: "dark" as Theme,
      label: "Dark",
      description: "Always use dark theme",
      icon: Moon,
    },
    {
      value: "system" as Theme,
      label: "System",
      description: "Follow your device settings",
      icon: Monitor,
    },
  ];

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Appearance</h1>
          <p className="text-sm text-muted-foreground">Theme and display options</p>
        </div>
      </div>

      <div className="max-w-md space-y-6">
        {/* Theme Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Theme
            </CardTitle>
            <CardDescription>Select your preferred color theme</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleThemeChange(option.value)}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                  theme === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  theme === option.value ? "bg-primary/10" : "bg-muted"
                }`}>
                  <option.icon className={`w-5 h-5 ${
                    theme === option.value ? "text-primary" : "text-muted-foreground"
                  }`} />
                </div>
                <div className="text-left">
                  <p className="font-medium">{option.label}</p>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
                {theme === option.value && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary" />
                <div>
                  <div className="h-3 w-24 bg-foreground/20 rounded" />
                  <div className="h-2 w-16 bg-foreground/10 rounded mt-2" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
