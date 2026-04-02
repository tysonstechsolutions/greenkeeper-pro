"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench,
  Upload,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  conditionStatusLabels,
  fuelTypeLabels,
  type CreateEquipmentData,
} from "@/lib/hooks/useEquipment";
import { useAuth } from "@/lib/hooks/useAuth";
import { DetailPageHeader } from "@/components/ui/back-button";
import type { EquipmentType, EquipmentStatus, EquipmentCondition, FuelType } from "@/types/database";

interface FormData extends CreateEquipmentData {
  condition_status?: EquipmentCondition;
  fuel_type?: FuelType;
  condition_notes?: string;
  needs_parts?: boolean;
  parts_needed?: string;
  estimated_repair_cost?: number;
}

export default function NewEquipmentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { createEquipment } = useEquipment();

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const [formData, setFormData] = useState<FormData>({
    name: "",
    equipment_type: "mower_reel",
    make: "",
    model: "",
    year: undefined,
    serial_number: "",
    asset_tag: "",
    status: "operational",
    location: "",
    notes: "",
    condition_status: "good",
    fuel_type: "other",
    condition_notes: "",
    needs_parts: false,
    parts_needed: "",
    estimated_repair_cost: undefined,
    current_hours: undefined,
    service_interval_hours: undefined,
  });

  const canAdd =
    user?.role === "super" || user?.role === "asst_super" || user?.role === "mechanic";

  if (!canAdd) {
    return (
      <div className="p-4 md:p-6 text-center py-12">
        <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">
          You do not have permission to add equipment.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    setUploadedFiles((prev) => [...prev, ...files]);
  };

  const removePhoto = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError("Equipment name is required");
      return;
    }

    setSubmitting(true);

    try {
      const cleanData: CreateEquipmentData = {
        name: formData.name.trim(),
        equipment_type: formData.equipment_type,
        status: formData.status,
        make: formData.make?.trim() || undefined,
        model: formData.model?.trim() || undefined,
        year: formData.year,
        serial_number: formData.serial_number?.trim() || undefined,
        asset_tag: formData.asset_tag?.trim() || undefined,
        location: formData.location?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
        current_hours: formData.current_hours,
        service_interval_hours: formData.service_interval_hours,
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
      <DetailPageHeader
        title="Add Equipment"
        subtitle="Upload photos and enter equipment details"
      />

      {(formError) && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <p className="text-sm">{formError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photo Upload Section */}
        <Card>
          <CardContent className="pt-6">
            <Label className="text-base font-semibold mb-4 block">Upload Equipment Photos</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-accent/50 transition-colors">
              <input
                type="file"
                id="photos"
                multiple
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <label
                htmlFor="photos"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm font-medium">Click to upload or drag and drop</span>
                <span className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</span>
              </label>
            </div>

            {previews.length > 0 && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                {previews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
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
                <Label htmlFor="type">Equipment Type *</Label>
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
                <Label htmlFor="condition">Condition *</Label>
                <Select
                  value={formData.condition_status || "good"}
                  onValueChange={(value) =>
                    updateField("condition_status", value as EquipmentCondition)
                  }
                >
                  <SelectTrigger id="condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(conditionStatusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
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
                    updateField("year", e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  placeholder="e.g., 2022"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Identification */}
        <Card>
          <CardContent className="pt-6 space-y-4">
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

        {/* Fuel & Status */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fuel">Fuel Type</Label>
                <Select
                  value={formData.fuel_type || "other"}
                  onValueChange={(value) =>
                    updateField("fuel_type", value as FuelType)
                  }
                >
                  <SelectTrigger id="fuel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(fuelTypeLabels).map(([value, label]) => (
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
          </CardContent>
        </Card>

        {/* Condition Details */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="condition_notes">Condition Notes</Label>
              <Textarea
                id="condition_notes"
                value={formData.condition_notes ?? ""}
                onChange={(e) => updateField("condition_notes", e.target.value)}
                placeholder="What was observed? Any issues or damage?"
                rows={3}
              />
            </div>

            {(formData.condition_status === "needs_repair" || formData.condition_status === "beyond_repair") && (
              <div className="space-y-2">
                <Label htmlFor="repair_cost">Estimated Repair Cost ($)</Label>
                <Input
                  id="repair_cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.estimated_repair_cost ?? ""}
                  onChange={(e) =>
                    updateField("estimated_repair_cost", e.target.value ? parseFloat(e.target.value) : undefined)
                  }
                  placeholder="0.00"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="needs_parts"
                checked={formData.needs_parts || false}
                onCheckedChange={(checked) => updateField("needs_parts", checked as boolean)}
              />
              <Label htmlFor="needs_parts" className="font-normal cursor-pointer">
                Needs Parts Ordered
              </Label>
            </div>

            {formData.needs_parts && (
              <div className="space-y-2">
                <Label htmlFor="parts">Parts Needed</Label>
                <Textarea
                  id="parts"
                  value={formData.parts_needed ?? ""}
                  onChange={(e) => updateField("parts_needed", e.target.value)}
                  placeholder="List parts that need to be ordered..."
                  rows={3}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service Details */}
        <Card>
          <CardContent className="pt-6 space-y-4">
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
                    updateField("current_hours", e.target.value ? parseFloat(e.target.value) : undefined)
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
                    updateField("service_interval_hours", e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  placeholder="e.g., 250"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes ?? ""}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Additional notes about this equipment..."
                rows={4}
              />
            </div>
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
              <Upload className="w-4 h-4 mr-2" />
            )}
            Save Equipment
          </Button>
        </div>
      </form>
    </div>
  );
}
