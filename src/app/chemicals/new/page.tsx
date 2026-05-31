"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Beaker,
  ArrowLeft,
  Save,
  Loader2,
  AlertTriangle,
  FileText,
  DollarSign,
  Package,
  Clock,
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
  useChemicals,
  productTypeLabels,
  signalWordLabels,
  signalWordColors,
  type CreateProductData,
} from "@/lib/hooks/useChemicals";
import { useAuth } from "@/lib/hooks/useAuth";
import type { ChemicalProductType, SignalWord } from "@/types/database";

// Common unit options
const UNIT_OPTIONS = [
  { value: "gal", label: "Gallons (gal)" },
  { value: "oz", label: "Ounces (oz)" },
  { value: "lb", label: "Pounds (lb)" },
  { value: "bag", label: "Bags" },
  { value: "liter", label: "Liters (L)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "unit", label: "Units" },
];

export default function NewChemicalProductPage() {
  const router = useRouter();
  const { canManageChemicals } = useAuth();
  const { createProduct, loading, error } = useChemicals();

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateProductData>({
    product_name: "",
    manufacturer: "",
    epa_registration: "",
    active_ingredient: "",
    product_type: undefined,
    unit_of_measure: "gal",
    current_inventory: undefined,
    reorder_threshold: undefined,
    cost_per_unit: undefined,
    sds_storage_path: "",
    rei_hours: undefined,
    signal_word: undefined,
    notes: "",
  });

  // Permission check — use profile-based role checks
  const canAdd = canManageChemicals;

  if (!canAdd) {
    return (
      <div className="p-4 md:p-6 text-center py-12">
        <Beaker className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">
          You don&apos;t have permission to add chemical products.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  // Form handlers
  const updateField = <K extends keyof CreateProductData>(
    field: K,
    value: CreateProductData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!formData.product_name.trim()) {
      setFormError("Product name is required");
      return;
    }

    setSubmitting(true);

    try {
      // Clean up data
      const cleanData: CreateProductData = {
        ...formData,
        product_name: formData.product_name.trim(),
        manufacturer: formData.manufacturer?.trim() || undefined,
        epa_registration: formData.epa_registration?.trim() || undefined,
        active_ingredient: formData.active_ingredient?.trim() || undefined,
        sds_storage_path: formData.sds_storage_path?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
      };

      const newProduct = await createProduct(cleanData);

      if (newProduct) {
        router.push(`/chemicals/view?id=${newProduct.id}`);
      } else {
        setFormError("Failed to create product. Please try again.");
      }
    } catch (err) {
      console.error("Error creating product:", err);
      setFormError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  // Get signal word color for preview
  const signalColor = formData.signal_word
    ? signalWordColors[formData.signal_word]
    : undefined;

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Add Chemical Product</h1>
          <p className="text-sm text-muted-foreground">
            Add a new product to your inventory
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
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                value={formData.product_name}
                onChange={(e) => updateField("product_name", e.target.value)}
                placeholder="e.g., Primo Maxx 1MEC"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input
                  id="manufacturer"
                  value={formData.manufacturer ?? ""}
                  onChange={(e) => updateField("manufacturer", e.target.value)}
                  placeholder="e.g., Syngenta"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Product Type</Label>
                <Select
                  value={formData.product_type}
                  onValueChange={(value) =>
                    updateField("product_type", value as ChemicalProductType)
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(productTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ingredient">Active Ingredient</Label>
              <Input
                id="ingredient"
                value={formData.active_ingredient ?? ""}
                onChange={(e) => updateField("active_ingredient", e.target.value)}
                placeholder="e.g., Trinexapac-ethyl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="epa">EPA Registration Number</Label>
              <Input
                id="epa"
                value={formData.epa_registration ?? ""}
                onChange={(e) => updateField("epa_registration", e.target.value)}
                placeholder="e.g., 100-1164"
              />
            </div>
          </CardContent>
        </Card>

        {/* Safety Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Safety Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="signal">Signal Word</Label>
                <Select
                  value={formData.signal_word}
                  onValueChange={(value) =>
                    updateField("signal_word", value as SignalWord)
                  }
                >
                  <SelectTrigger id="signal">
                    <SelectValue placeholder="Select signal word" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(signalWordLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: signalWordColors[value as SignalWord] }}
                          />
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.signal_word && formData.signal_word !== "none" && (
                  <p
                    className="text-xs font-medium flex items-center gap-1"
                    style={{ color: signalColor }}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {signalWordLabels[formData.signal_word]} - Handle with care
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="rei" className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  REI (Re-Entry Interval)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="rei"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={formData.rei_hours ?? ""}
                    onChange={(e) =>
                      updateField(
                        "rei_hours",
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                    placeholder="0"
                  />
                  <span className="flex items-center text-sm text-muted-foreground px-2">
                    hours
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Time before workers can re-enter treated areas
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sds" className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                SDS Document URL
              </Label>
              <Input
                id="sds"
                type="url"
                value={formData.sds_storage_path ?? ""}
                onChange={(e) => updateField("sds_storage_path", e.target.value)}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">
                Link to Safety Data Sheet (SDS) document
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Inventory */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" />
              Inventory Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">Unit of Measure</Label>
                <Select
                  value={formData.unit_of_measure}
                  onValueChange={(value) => updateField("unit_of_measure", value)}
                >
                  <SelectTrigger id="unit">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory">Current Inventory</Label>
                <Input
                  id="inventory"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={formData.current_inventory ?? ""}
                  onChange={(e) =>
                    updateField(
                      "current_inventory",
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reorder">Reorder Threshold</Label>
                <Input
                  id="reorder"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={formData.reorder_threshold ?? ""}
                  onChange={(e) =>
                    updateField(
                      "reorder_threshold",
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Alert when stock falls below this level
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cost" className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Cost Per Unit
                </Label>
                <Input
                  id="cost"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={formData.cost_per_unit ?? ""}
                  onChange={(e) =>
                    updateField(
                      "cost_per_unit",
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Inventory value preview */}
            {formData.current_inventory !== undefined &&
              formData.cost_per_unit !== undefined && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Inventory Value</span>
                    <span className="text-lg font-bold text-primary">
                      ${(formData.current_inventory * formData.cost_per_unit).toFixed(2)}
                    </span>
                  </div>
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
              placeholder="Additional notes about this product, storage requirements, mixing instructions, etc."
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
          <Button type="submit" className="flex-1" disabled={submitting || loading}>
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Product
          </Button>
        </div>
      </form>
    </div>
  );
}
