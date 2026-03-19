"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench,
  ArrowLeft,
  Save,
  Camera,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useEquipment,
  equipmentTypeLabels,
  equipmentStatusLabels,
  type CreateEquipmentData,
} from "@/lib/hooks/useEquipment";
import { useAuth } from "@/lib/hooks/useAuth";
import type { EquipmentType, EquipmentStatus } from "@/types/database";

export default function NewEquipmentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { createEquipment, loading, error } = useEquipment();

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateEquipmentData>({
    name: "",
    equipment_type: "mower_reel",
    make: "",
    model: "",
    year: undefined,
    serial_number: "",
    asset_tag: "",
    status: "operational",
    current_hours: undefined,
    service_interval_hours: undefined,
    next_service_due_hours: undefined,
    next_service_due_date: "",
    location: "",
    purchase_date: "",
    purchase_price: undefined,
    notes: "",
    photo_url: "",
  });

  // Check permissions
  const canAdd =
    user?.role === "super" || user?.role === "asst_super" || user?.role === "mechanic";

  if (!canAdd) {
    return (
      <div className="p-4 md:p-6 text-center py-12">
        <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">
          You don't have permission to add equipment.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  // Form handlers
  const updateField = <K extends keyof CreateEquipmentData>(
    field: K,
    value: CreateEquipmentData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  // Calculate next service due when current hours and interval change
  const handleHoursChange = (currentHours: number | undefined) => {
    updateField("current_hours", currentHours);

    if (currentHours !== undefined && formData.service_interval_hours !== undefined) {
      updateField(
        "next_service_due_hours",
        currentHours + formData.service_interval_hours
      );
    }
  };

  const handleIntervalChange = (interval: number | undefined) => {
    updateField("service_interval_hours", interval);

    if (formData.current_hours !== undefined && interval !== undefined) {
      updateField("next_service_due_hours", formData.current_hours + interval);
    }
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!formData.name.trim()) {
      setFormError("Equipment name is required");
      return;
    }

    setSubmitting(true);

    try {
      // Clean up data - remove empty strings for optional fields
      const cleanData: CreateEquipmentData = {
        ...formData,
        name: formData.name.trim(),
        make: formData.make?.trim() || undefined,
        model: formData.model?.trim() || undefined,
        serial_number: formData.serial_number?.trim() || undefined,
        asset_tag: formData.asset_tag?.trim() || undefined,
        location: formData.location?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
        photo_url: formData.photo_url?.trim() || undefined,
        purchase_date: formData.purchase_date || undefined,
        next_service_due_date: formData.next_service_due_date || undefined,
      };

      const newEquipment = await createEquipment(cleanData);

      if (newEquipment) {
        router.push(`/equipment/${newEquipment.id}`);
      } else {
        setFormError("Failed to create equipment. Please try again.");
      }
    } catch (err) {
      console.error("Error creating equipment:", err);
      setFormError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Add Equipment</h1>
          <p className="text-sm text-muted-foreground">
            Add a new piece of equipment to your fleet
          </p>
        </div>
      </div>

      {/* Error message */}
      {(formError || error) && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <p className="text-sm">{formError || error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Basic Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Equipment Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g., Greens Mower #1"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.equipment_type}
                  onValueChange={(value) =>
                    updateField("equipment_type", value as EquipmentType)
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(equipmentTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    updateField("status", value as EquipmentStatus)
                  }
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(equipmentStatusLabels).map(([value, label]) => {
                      if (value === "retired") return null;
                      return (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={formData.make ?? ""}
                  onChange={(e) => updateField("make", e.target.value)}
                  placeholder="e.g., John Deere"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={formData.model ?? ""}
                  onChange={(e) => updateField("model", e.target.value)}
                  placeholder="e.g., 2500E"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  min={1900}
                  max={2100}
                  value={formData.year ?? ""}
                  onChange={(e) =>
                    updateField(
                      "year",
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                  placeholder="e.g., 2022"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="serial">Serial Number</Label>
                <Input
                  id="serial"
                  value={formData.serial_number ?? ""}
                  onChange={(e) => updateField("serial_number", e.target.value)}
                  placeholder="Manufacturer serial #"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="asset">Asset Tag</Label>
                <Input
                  id="asset"
                  value={formData.asset_tag ?? ""}
                  onChange={(e) => updateField("asset_tag", e.target.value)}
                  placeholder="Internal asset ID"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location ?? ""}
                onChange={(e) => updateField("location", e.target.value)}
                placeholder="e.g., Main Shop, Bay 3"
              />
            </div>
          </CardContent>
        </Card>

        {/* Hours & Service */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Hours & Service</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="current_hours">Current Hours</Label>
                <Input
                  id="current_hours"
                  type="number"
                  min={0}
                  step="0.1"
                  value={formData.current_hours ?? ""}
                  onChange={(e) =>
                    handleHoursChange(
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="service_interval">Service Interval (hours)</Label>
                <Input
                  id="service_interval"
                  type="number"
                  min={0}
                  value={formData.service_interval_hours ?? ""}
                  onChange={(e) =>
                    handleIntervalChange(
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                  placeholder="e.g., 250"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="next_service_hours">Next Service Due (hours)</Label>
                <Input
                  id="next_service_hours"
                  type="number"
                  min={0}
                  value={formData.next_service_due_hours ?? ""}
                  onChange={(e) =>
                    updateField(
                      "next_service_due_hours",
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="Auto-calculated"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-calculates from current hours + interval
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="next_service_date">Next Service Due (date)</Label>
                <Input
                  id="next_service_date"
                  type="date"
                  value={formData.next_service_due_date ?? ""}
                  onChange={(e) =>
                    updateField("next_service_due_date", e.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Optional date-based service reminder
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Purchase Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchase_date">Purchase Date</Label>
                <Input
                  id="purchase_date"
                  type="date"
                  value={formData.purchase_date ?? ""}
                  onChange={(e) => updateField("purchase_date", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_price">Purchase Price ($)</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.purchase_price ?? ""}
                  onChange={(e) =>
                    updateField(
                      "purchase_price",
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="0.00"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Photo */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Photo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="photo_url">Photo URL</Label>
              <Input
                id="photo_url"
                type="url"
                value={formData.photo_url ?? ""}
                onChange={(e) => updateField("photo_url", e.target.value)}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">
                Enter a URL to an equipment photo. Direct upload coming soon.
              </p>
            </div>

            {formData.photo_url && (
              <div className="mt-4 w-full max-w-xs rounded-lg overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={formData.photo_url}
                  alt="Preview"
                  className="w-full h-auto"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes ?? ""}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Additional notes about this equipment..."
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Submit Buttons */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting}>
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Equipment
          </Button>
        </div>
      </form>
    </div>
  );
}
