import { Settings, User, Bell, Palette, Database, Shield } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

const settingsSections = [
  {
    title: "Profile",
    description: "Your account information",
    icon: User,
  },
  {
    title: "Notifications",
    description: "Push and email preferences",
    icon: Bell,
  },
  {
    title: "Appearance",
    description: "Theme and display options",
    icon: Palette,
  },
  {
    title: "Course Setup",
    description: "Course info, zones, holes",
    icon: Database,
  },
  {
    title: "Staff & Permissions",
    description: "Manage team access",
    icon: Shield,
  },
];

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Settings"
        description="App configuration"
        icon={Settings}
      />

      <div className="space-y-3 max-w-2xl">
        {settingsSections.map((section) => (
          <div
            key={section.title}
            className="flex items-center gap-4 p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <section.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">{section.title}</h3>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* App Info */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>GreenKeeper Pro v0.1.0</p>
        <p>Veterans Memorial Golf Course</p>
      </div>
    </div>
  );
}
