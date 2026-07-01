"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Flag,
  Camera,
  MapPin,
  X,
  Check,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { DetailPageHeader } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTasks } from "@/lib/hooks/useTasks";
import { cn } from "@/lib/utils";
import { todayLocal } from "@/lib/utils/date";

type IssueLocation =
  | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18"
  | "clubhouse" | "practice" | "cart_path" | "parking_lot";

type IssueCategory =
  | "turf_damage"
  | "irrigation_problem"
  | "bunker_issue"
  | "cart_path_damage"
  | "tree_landscape"
  | "equipment_left"
  | "safety_hazard"
  | "cleanliness"
  | "other";

type Urgency = "low" | "normal" | "urgent";

const locationLabels: Record<IssueLocation, string> = {
  "1": "Hole 1",
  "2": "Hole 2",
  "3": "Hole 3",
  "4": "Hole 4",
  "5": "Hole 5",
  "6": "Hole 6",
  "7": "Hole 7",
  "8": "Hole 8",
  "9": "Hole 9",
  "10": "Hole 10",
  "11": "Hole 11",
  "12": "Hole 12",
  "13": "Hole 13",
  "14": "Hole 14",
  "15": "Hole 15",
  "16": "Hole 16",
  "17": "Hole 17",
  "18": "Hole 18",
  clubhouse: "Clubhouse Area",
  practice: "Practice Facility",
  cart_path: "Cart Path",
  parking_lot: "Parking Lot",
};

const categoryLabels: Record<IssueCategory, string> = {
  turf_damage: "Turf Damage",
  irrigation_problem: "Irrigation Problem",
  bunker_issue: "Bunker Issue",
  cart_path_damage: "Cart Path Damage",
  tree_landscape: "Tree/Landscape",
  equipment_left: "Equipment Left on Course",
  safety_hazard: "Safety Hazard",
  cleanliness: "Cleanliness",
  other: "Other",
};

const urgencyLabels: Record<Urgency, string> = {
  low: "Low",
  normal: "Normal",
  urgent: "Urgent",
};

const urgencyColors: Record<Urgency, string> = {
  low: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  normal: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  urgent: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

// Map issue categories to task categories
const categoryToTaskCategory: Record<IssueCategory, string> = {
  turf_damage: "greens",
  irrigation_problem: "irrigation",
  bunker_issue: "bunker",
  cart_path_damage: "construction",
  tree_landscape: "landscaping",
  equipment_left: "other",
  safety_hazard: "safety",
  cleanliness: "other",
  other: "other",
};

export default function ReportIssuePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { createTask } = useTasks();

  const [location, setLocation] = useState<IssueLocation | null>(null);
  const [category, setCategory] = useState<IssueCategory | null>(null);
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [description, setDescription] = useState("");
  const [, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setPhoto(null);
    setPhotoPreview(null);
  };

  const handleSubmit = async () => {
    if (!location || !category || !description.trim()) return;

    setSubmitting(true);

    try {
      // Create task for superintendent
      const holeNumbers = location.match(/^\d+$/) ? [parseInt(location)] : [];
      const taskCategory = categoryToTaskCategory[category] as "mowing" | "irrigation" | "chemical" | "mechanical" | "landscaping" | "construction" | "bunker" | "greens" | "admin" | "safety" | "other";

      const success = await createTask({
        title: `[Pro Shop Report] ${categoryLabels[category]} - ${locationLabels[location]}`,
        description: `Reported by: ${profile?.full_name}\n\nDescription:\n${description}`,
        category: taskCategory,
        priority: urgency === "urgent" ? "high" : urgency === "low" ? "low" : "normal",
        due_date: todayLocal(),
        hole_numbers: holeNumbers,
        requires_photo_before: false,
        requires_photo_after: false,
        weather_dependent: false,
        notes: `Source: Pro Shop Issue Report\nUrgency: ${urgencyLabels[urgency]}\nLocation: ${locationLabels[location]}`,
      });

      if (success) {
        setSubmitted(true);
        // Redirect after showing success
        setTimeout(() => {
          router.push("/dashboard");
        }, 2000);
      }
    } catch (error) {
      console.error("Error submitting issue:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = location && category && description.trim();

  if (submitted) {
    return (
      <div className="p-4 md:p-6">
        <div className="max-w-md mx-auto text-center py-12">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">Issue Reported</h1>
          <p className="text-muted-foreground mb-4">
            Your report has been sent to the maintenance team. They will address it as soon as possible.
          </p>
          <p className="text-sm text-muted-foreground">
            Redirecting to dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <DetailPageHeader
        backHref="/dashboard"
        backLabel="Dashboard"
        title="Report an Issue"
        subtitle="Alert maintenance about problems on the course"
        className="mb-6"
      />

      <div className="max-w-xl mx-auto space-y-6">
        {/* Photo Upload */}
        <div className="space-y-2">
          <Label>Photo (Optional)</Label>
          <div className="relative">
            {photoPreview ? (
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                <img
                  src={photoPreview}
                  alt="Issue photo"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={removePhoto}
                  className="absolute top-2 right-2 p-1 bg-background/80 rounded-full hover:bg-background"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                <Camera className="w-10 h-10 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">
                  Tap to take or upload a photo
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="sr-only"
                />
              </label>
            )}
          </div>
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label>Location *</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                {location ? (
                  <span className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {locationLabels[location]}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Select location</span>
                )}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 max-h-64 overflow-y-auto">
              {/* Holes */}
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Holes
              </div>
              <div className="grid grid-cols-3 gap-1 px-1">
                {(["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18"] as IssueLocation[]).map((loc) => (
                  <DropdownMenuItem
                    key={loc}
                    onClick={() => setLocation(loc)}
                    className={cn(
                      "justify-center",
                      location === loc && "bg-primary/10"
                    )}
                  >
                    {loc}
                  </DropdownMenuItem>
                ))}
              </div>
              <div className="border-t border-border my-1" />
              {/* Other locations */}
              {(["clubhouse", "practice", "cart_path", "parking_lot"] as IssueLocation[]).map((loc) => (
                <DropdownMenuItem
                  key={loc}
                  onClick={() => setLocation(loc)}
                  className={cn(location === loc && "bg-primary/10")}
                >
                  {locationLabels[loc]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label>Category *</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                {category ? (
                  <span>{categoryLabels[category]}</span>
                ) : (
                  <span className="text-muted-foreground">Select category</span>
                )}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              {(Object.keys(categoryLabels) as IssueCategory[]).map((cat) => (
                <DropdownMenuItem
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(category === cat && "bg-primary/10")}
                >
                  {categoryLabels[cat]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue in detail..."
            rows={4}
          />
        </div>

        {/* Urgency */}
        <div className="space-y-2">
          <Label>Urgency</Label>
          <div className="flex gap-2">
            {(Object.keys(urgencyLabels) as Urgency[]).map((urg) => (
              <button
                key={urg}
                onClick={() => setUrgency(urg)}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors",
                  urgency === urg
                    ? urgencyColors[urg]
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                {urgencyLabels[urg]}
              </button>
            ))}
          </div>
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
              <Flag className="w-4 h-4 mr-2" />
              Submit Issue Report
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          This will create a task for the maintenance team with your report details.
        </p>
      </div>
    </div>
  );
}
