"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Droplets,
  ArrowLeft,
  Save,
  Loader2,
  CloudSun,
  RefreshCw,
  AlertTriangle,
  MapPin,
  Clock,
  Wind,
  Thermometer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useChemicals,
  productTypeLabels,
  productTypeColors,
  applicationMethodLabels,
  type CreateApplicationData,
} from "@/lib/hooks/useChemicals";
import { useWeather, type CurrentWeather } from "@/lib/hooks/useWeather";
import { useAuth } from "@/lib/hooks/useAuth";
import type { ApplicationMethod, ChemicalProduct } from "@/types/database";

// Mock zones - in production, fetch from database
const MOCK_ZONES = [
  { id: "z1", name: "Green #1", type: "green", hole: 1 },
  { id: "z2", name: "Green #2", type: "green", hole: 2 },
  { id: "z3", name: "Green #3", type: "green", hole: 3 },
  { id: "z4", name: "Green #4", type: "green", hole: 4 },
  { id: "z5", name: "Fairway #1", type: "fairway", hole: 1 },
  { id: "z6", name: "Fairway #2", type: "fairway", hole: 2 },
  { id: "z7", name: "Tee #1", type: "tee", hole: 1 },
  { id: "z8", name: "Rough - Front 9", type: "rough", hole: null },
  { id: "z9", name: "Bunker Complex", type: "bunker", hole: null },
  { id: "z10", name: "Practice Green", type: "practice", hole: null },
];

export default function ChemicalApplicationPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <ChemicalApplicationPageContent />
    </Suspense>
  );
}

function ChemicalApplicationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedProductId = searchParams.get("product");

  const { user, isManager, isForeman } = useAuth();
  const { products, fetchProducts, createApplication, loading, error } = useChemicals();
  const { currentWeather, fetchCurrentWeather, loading: weatherLoading } = useWeather();

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ChemicalProduct | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateApplicationData>({
    product_id: preselectedProductId || "",
    application_date: new Date().toISOString().split("T")[0],
    application_time: new Date().toTimeString().slice(0, 5),
    zone_ids: [],
    hole_numbers: [],
    area_treated_sqft: undefined,
    application_rate: "",
    total_amount_used: undefined,
    method: undefined,
    weather_temp_f: undefined,
    weather_wind_mph: undefined,
    weather_wind_direction: "",
    weather_humidity: undefined,
    weather_conditions: "",
    target_pest: "",
    notes: "",
    applicator_license: "",
  });

  // Weather auto-fill state
  const [weatherAutoFilled, setWeatherAutoFilled] = useState(false);

  // Permission check — use profile-based role checks
  const canApply = isManager || isForeman;

  // Load products and weather on mount
  useEffect(() => {
    fetchProducts({ activeOnly: true });
    fetchCurrentWeather();
  }, [fetchProducts, fetchCurrentWeather]);

  // Set preselected product
  useEffect(() => {
    if (preselectedProductId && products.length > 0) {
      const product = products.find((p) => p.id === preselectedProductId);
      if (product) {
        setSelectedProduct(product);
        setFormData((prev) => ({ ...prev, product_id: product.id }));
      }
    }
  }, [preselectedProductId, products]);

  // Auto-fill weather data
  const autoFillWeather = useCallback((weather: CurrentWeather) => {
    setFormData((prev) => ({
      ...prev,
      weather_temp_f: weather.temp_f,
      weather_wind_mph: weather.wind_mph,
      weather_wind_direction: weather.wind_direction,
      weather_humidity: weather.humidity,
      weather_conditions: weather.conditions,
    }));
    setWeatherAutoFilled(true);
  }, []);

  // Auto-fill weather when loaded
  useEffect(() => {
    if (currentWeather && !weatherAutoFilled) {
      autoFillWeather(currentWeather);
    }
  }, [currentWeather, weatherAutoFilled, autoFillWeather]);

  // Permission denied
  if (!canApply) {
    return (
      <div className="p-4 md:p-6 text-center py-12">
        <Droplets className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">
          You don&apos;t have permission to log chemical applications.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  // Form handlers
  const updateField = <K extends keyof CreateApplicationData>(
    field: K,
    value: CreateApplicationData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  // Handle product selection
  const handleProductSelect = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    setSelectedProduct(product || null);
    updateField("product_id", productId);
  };

  // Handle zone selection
  const handleZoneToggle = (zoneId: string, hole: number | null) => {
    setFormData((prev) => {
      const newZoneIds = prev.zone_ids.includes(zoneId)
        ? prev.zone_ids.filter((id) => id !== zoneId)
        : [...prev.zone_ids, zoneId];

      // Update hole numbers based on selected zones
      const selectedZones = MOCK_ZONES.filter((z) => newZoneIds.includes(z.id));
      const newHoleNumbers = [
        ...new Set(selectedZones.filter((z) => z.hole !== null).map((z) => z.hole as number)),
      ].sort((a, b) => a - b);

      return {
        ...prev,
        zone_ids: newZoneIds,
        hole_numbers: newHoleNumbers,
      };
    });
    setFormError(null);
  };

  // Refresh weather
  const handleRefreshWeather = async () => {
    const weather = await fetchCurrentWeather();
    if (weather) {
      autoFillWeather(weather);
    }
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!formData.product_id) {
      setFormError("Please select a product");
      return;
    }
    if (formData.zone_ids.length === 0) {
      setFormError("Please select at least one zone");
      return;
    }
    if (!formData.application_date) {
      setFormError("Application date is required");
      return;
    }

    setSubmitting(true);

    try {
      // Clean up data
      const cleanData: CreateApplicationData = {
        ...formData,
        application_rate: formData.application_rate?.trim() || undefined,
        target_pest: formData.target_pest?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
        applicator_license: formData.applicator_license?.trim() || undefined,
      };

      const newApplication = await createApplication(cleanData);

      if (newApplication) {
        // Show success and redirect
        router.push("/chemicals");
      } else {
        setFormError("Failed to log application. Please try again.");
      }
    } catch (err) {
      console.error("Error logging application:", err);
      setFormError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate REI expiration preview
  const reiPreview = selectedProduct?.rei_hours
    ? (() => {
        const appDateTime = formData.application_time
          ? new Date(`${formData.application_date}T${formData.application_time}`)
          : new Date(`${formData.application_date}T08:00:00`);
        appDateTime.setHours(appDateTime.getHours() + selectedProduct.rei_hours);
        return appDateTime.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
      })()
    : null;

  // Check for wind warning
  const windWarning =
    formData.weather_wind_mph !== undefined && formData.weather_wind_mph > 10;

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Log Chemical Application</h1>
          <p className="text-sm text-muted-foreground">
            Record application details for compliance
          </p>
        </div>
      </div>

      {/* Wind Warning */}
      {windWarning && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Wind className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-700 dark:text-yellow-400">
                High Wind Advisory
              </h3>
              <p className="text-sm text-yellow-600 dark:text-yellow-500">
                Current wind speed ({formData.weather_wind_mph} mph) exceeds 10 mph.
                Spray applications may result in drift. Consider postponing.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {(formError || error) && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <p className="text-sm">{formError || error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Product Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Product Selection</CardTitle>
            <CardDescription>Select the chemical product being applied</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="product">Product *</Label>
              <Select
                value={formData.product_id}
                onValueChange={handleProductSelect}
              >
                <SelectTrigger id="product">
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => {
                    const typeColor = product.product_type
                      ? productTypeColors[product.product_type]
                      : "#6b7280";
                    return (
                      <SelectItem key={product.id} value={product.id}>
                        <div className="flex items-center gap-2">
                          <span>{product.product_name}</span>
                          {product.product_type && (
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{
                                borderColor: typeColor,
                                color: typeColor,
                              }}
                            >
                              {productTypeLabels[product.product_type]}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Selected product info */}
            {selectedProduct && (
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Active Ingredient</span>
                  <span className="text-sm font-medium">
                    {selectedProduct.active_ingredient || "Not specified"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current Stock</span>
                  <span className="text-sm font-medium">
                    {selectedProduct.current_inventory ?? 0}{" "}
                    {selectedProduct.unit_of_measure || "units"}
                  </span>
                </div>
                {selectedProduct.rei_hours && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">REI</span>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-orange-600">
                        {selectedProduct.rei_hours} hours
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Application Details */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Application Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Application Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.application_date}
                  onChange={(e) => updateField("application_date", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">Application Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={formData.application_time ?? ""}
                  onChange={(e) => updateField("application_time", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="method">Application Method</Label>
                <Select
                  value={formData.method}
                  onValueChange={(value) =>
                    updateField("method", value as ApplicationMethod)
                  }
                >
                  <SelectTrigger id="method">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(applicationMethodLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate">Application Rate</Label>
                <Input
                  id="rate"
                  value={formData.application_rate ?? ""}
                  onChange={(e) => updateField("application_rate", e.target.value)}
                  placeholder="e.g., 2 oz/1000 sq ft"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Total Amount Used</Label>
                <div className="flex gap-2">
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min={0}
                    value={formData.total_amount_used ?? ""}
                    onChange={(e) =>
                      updateField(
                        "total_amount_used",
                        e.target.value ? parseFloat(e.target.value) : undefined
                      )
                    }
                    placeholder="0"
                  />
                  <span className="flex items-center text-sm text-muted-foreground px-2">
                    {selectedProduct?.unit_of_measure || "units"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Inventory will be auto-deducted
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="area">Area Treated (sq ft)</Label>
                <Input
                  id="area"
                  type="number"
                  min={0}
                  value={formData.area_treated_sqft ?? ""}
                  onChange={(e) =>
                    updateField(
                      "area_treated_sqft",
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target">Target Pest/Purpose</Label>
              <Input
                id="target"
                value={formData.target_pest ?? ""}
                onChange={(e) => updateField("target_pest", e.target.value)}
                placeholder="e.g., Dollar Spot, Crabgrass, Preventive"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="license">Applicator License #</Label>
              <Input
                id="license"
                value={formData.applicator_license ?? ""}
                onChange={(e) => updateField("applicator_license", e.target.value)}
                placeholder="Your applicator license number"
              />
            </div>
          </CardContent>
        </Card>

        {/* Zone Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Treatment Zones *
            </CardTitle>
            <CardDescription>Select all areas where product was applied</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {MOCK_ZONES.map((zone) => (
                <label
                  key={zone.id}
                  className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                    formData.zone_ids.includes(zone.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Checkbox
                    checked={formData.zone_ids.includes(zone.id)}
                    onCheckedChange={() => handleZoneToggle(zone.id, zone.hole)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{zone.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{zone.type}</p>
                  </div>
                </label>
              ))}
            </div>

            {formData.zone_ids.length > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {formData.zone_ids.length} zone{formData.zone_ids.length !== 1 && "s"} selected
                {formData.hole_numbers && formData.hole_numbers.length > 0 && (
                  <span>
                    {" "}
                    (Holes: {formData.hole_numbers.join(", ")})
                  </span>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Weather Conditions */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CloudSun className="w-4 h-4" />
                Weather Conditions
              </CardTitle>
              <CardDescription>
                {weatherAutoFilled
                  ? "Auto-filled from current conditions"
                  : "Enter conditions at time of application"}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefreshWeather}
              disabled={weatherLoading}
            >
              {weatherLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="temp" className="flex items-center gap-1">
                  <Thermometer className="w-3 h-3" />
                  Temperature
                </Label>
                <div className="flex gap-1">
                  <Input
                    id="temp"
                    type="number"
                    value={formData.weather_temp_f ?? ""}
                    onChange={(e) =>
                      updateField(
                        "weather_temp_f",
                        e.target.value ? parseFloat(e.target.value) : undefined
                      )
                    }
                    placeholder="--"
                  />
                  <span className="flex items-center text-sm text-muted-foreground">°F</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wind" className="flex items-center gap-1">
                  <Wind className="w-3 h-3" />
                  Wind Speed
                </Label>
                <div className="flex gap-1">
                  <Input
                    id="wind"
                    type="number"
                    value={formData.weather_wind_mph ?? ""}
                    onChange={(e) =>
                      updateField(
                        "weather_wind_mph",
                        e.target.value ? parseFloat(e.target.value) : undefined
                      )
                    }
                    placeholder="--"
                    className={windWarning ? "border-yellow-500" : ""}
                  />
                  <span className="flex items-center text-sm text-muted-foreground">mph</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="windDir">Wind Direction</Label>
                <Input
                  id="windDir"
                  value={formData.weather_wind_direction ?? ""}
                  onChange={(e) => updateField("weather_wind_direction", e.target.value)}
                  placeholder="e.g., NW"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="humidity">Humidity</Label>
                <div className="flex gap-1">
                  <Input
                    id="humidity"
                    type="number"
                    min={0}
                    max={100}
                    value={formData.weather_humidity ?? ""}
                    onChange={(e) =>
                      updateField(
                        "weather_humidity",
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                    placeholder="--"
                  />
                  <span className="flex items-center text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="conditions">Sky Conditions</Label>
              <Input
                id="conditions"
                value={formData.weather_conditions ?? ""}
                onChange={(e) => updateField("weather_conditions", e.target.value)}
                placeholder="e.g., Partly cloudy, Clear"
              />
            </div>
          </CardContent>
        </Card>

        {/* REI Notice */}
        {selectedProduct?.rei_hours && reiPreview && (
          <Card className="mb-6 border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-orange-500 mt-0.5" />
                <div>
                  <h3 className="font-medium text-orange-700 dark:text-orange-400">
                    Re-Entry Interval (REI)
                  </h3>
                  <p className="text-sm text-orange-600 dark:text-orange-500 mt-1">
                    This product has a {selectedProduct.rei_hours}-hour REI. Based on your
                    application time, treated areas will be restricted until{" "}
                    <strong>{reiPreview}</strong>.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes ?? ""}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Any additional notes about this application..."
              rows={3}
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
            Log Application
          </Button>
        </div>
      </form>
    </div>
  );
}
