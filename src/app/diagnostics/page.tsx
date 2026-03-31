"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, Loader2, History, Filter, Stethoscope, AlertTriangle, CheckCircle, Eye, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDiagnostics } from "@/lib/hooks/useDiagnostics";
import { useCourseZones, formatZoneName } from "@/lib/hooks/useCourseZones";

const CATEGORY_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "turf_disease", label: "Turf Disease" },
  { value: "turf_insect", label: "Turf Insect" },
  { value: "turf_weed", label: "Weed Issue" },
  { value: "turf_nutrient", label: "Nutrient Deficiency" },
  { value: "turf_abiotic", label: "Abiotic Stress" },
  { value: "turf_mechanical", label: "Mechanical Damage" },
  { value: "tree", label: "Tree/Landscape" },
  { value: "equipment", label: "Equipment Issue" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "diagnosed", label: "Diagnosed" },
  { value: "treating", label: "In Treatment" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
];

const ROTATING_MESSAGES = [
  "Analyzing image...",
  "Checking for disease patterns...",
  "Cross-referencing with local conditions...",
  "Reviewing treatment options...",
  "Checking your inventory...",
  "Consulting weather forecast...",
  "Building treatment plan...",
  "Almost there...",
];

const getSeverityColor = (severity: number) => {
  if (severity <= 2) return "bg-green-100 text-green-800";
  if (severity <= 3) return "bg-yellow-100 text-yellow-800";
  if (severity <= 4) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4" />;
    case "diagnosed":
      return <Stethoscope className="h-4 w-4" />;
    case "treating":
      return <AlertTriangle className="h-4 w-4" />;
    case "monitoring":
      return <Eye className="h-4 w-4" />;
    case "resolved":
      return <CheckCircle className="h-4 w-4" />;
    default:
      return null;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-gray-100 text-gray-800";
    case "diagnosed":
      return "bg-blue-100 text-blue-800";
    case "treating":
      return "bg-orange-100 text-orange-800";
    case "monitoring":
      return "bg-purple-100 text-purple-800";
    case "resolved":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export default function DiagnosticsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("auto");
  const [zoneId, setZoneId] = useState<string>("");

  // Filter state
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Rotating message state
  const [messageIndex, setMessageIndex] = useState(0);

  // Hooks
  const {
    diagnostics,
    loading,
    diagnosing,
    error,
    fetchDiagnostics,
    submitDiagnosis,
  } = useDiagnostics();
  const { zones } = useCourseZones();

  // Fetch diagnostics on mount and filter change
  useEffect(() => {
    fetchDiagnostics({
      status: statusFilter !== "all" ? statusFilter : undefined,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
    });
  }, [fetchDiagnostics, statusFilter, categoryFilter]);

  // Rotate loading messages while diagnosing
  useEffect(() => {
    if (!diagnosing) {
      return;
    }

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % ROTATING_MESSAGES.length);
    }, 3000);

    return () => {
      clearInterval(interval);
      setMessageIndex(0);
    };
  }, [diagnosing]);

  // Handle image selection
  const handleImageSelect = useCallback((file: File) => {
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
  };

  // Handle submission
  const handleSubmit = async () => {
    if (!selectedImage) return;

    const result = await submitDiagnosis(
      selectedImage,
      description || undefined,
      category,
      zoneId || undefined
    );

    if (result) {
      // Navigate to the detail page
      router.push(`/diagnostics/${result.id}`);
    }
  };

  // Reset form
  const resetForm = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setDescription("");
    setCategory("auto");
    setZoneId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#1B4332]">Course Doctor</h1>
          <p className="text-muted-foreground">
            AI-powered turf diagnostics and treatment planning
          </p>
        </div>
      </div>

      {/* New Diagnosis Section */}
      <Card className="border-[#1B4332]/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-[#1B4332]" />
            New Diagnosis
          </CardTitle>
          <CardDescription>
            Upload or capture a photo for AI analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {diagnosing ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-[#1B4332]" />
              <p className="text-lg font-medium text-[#1B4332]">
                {ROTATING_MESSAGES[messageIndex]}
              </p>
              <p className="text-sm text-muted-foreground">
                This may take 15-30 seconds
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Image Input */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  {imagePreview ? (
                    <div className="relative aspect-video rounded-lg overflow-hidden border">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={resetForm}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <div
                        className="flex-1 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-[#1B4332]/50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">Upload Photo</p>
                        <p className="text-xs text-muted-foreground">
                          Click or drag & drop
                        </p>
                      </div>
                      <div
                        className="flex-1 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-[#1B4332]/50 transition-colors"
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        <Camera className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">Take Photo</p>
                        <p className="text-xs text-muted-foreground">
                          Use device camera
                        </p>
                      </div>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {/* Options */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Description (optional)
                    </label>
                    <Textarea
                      placeholder="Describe what you're seeing... (e.g., irregular brown patches appearing after rain)"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Category</label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Zone</label>
                      <Select value={zoneId} onValueChange={setZoneId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select zone" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">No specific zone</SelectItem>
                          {zones.map((zone) => (
                            <SelectItem key={zone.id} value={zone.id}>
                              {formatZoneName(zone)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-[#1B4332] hover:bg-[#1B4332]/90"
                    size="lg"
                    disabled={!selectedImage || diagnosing}
                    onClick={handleSubmit}
                  >
                    <Stethoscope className="h-5 w-5 mr-2" />
                    Analyze Image
                  </Button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  <p className="font-medium">Analysis Failed</p>
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#1B4332]" />
              <CardTitle>Diagnosis History</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORY_OPTIONS.filter((c) => c.value !== "auto").map(
                    (opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : diagnostics.length === 0 ? (
            <div className="text-center py-12">
              <Stethoscope className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No diagnoses yet</p>
              <p className="text-muted-foreground">
                Upload a photo above to get started
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {diagnostics.map((diagnostic) => {
                const result = diagnostic.full_response;
                return (
                  <div
                    key={diagnostic.id}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/diagnostics/${diagnostic.id}`)}
                  >
                    {/* Thumbnail */}
                    <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={diagnostic.photo_url}
                        alt="Diagnosis photo"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium truncate">
                          {result?.diagnosis?.condition || "Pending Analysis"}
                        </h3>
                        {result?.diagnosis?.severity && (
                          <Badge
                            className={getSeverityColor(
                              result.diagnosis.severity
                            )}
                          >
                            {result.diagnosis.severity_label}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {diagnostic.zone?.name || "No zone specified"} •{" "}
                        {new Date(diagnostic.created_at).toLocaleDateString()}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge
                          variant="outline"
                          className={getStatusColor(diagnostic.status)}
                        >
                          {getStatusIcon(diagnostic.status)}
                          <span className="ml-1 capitalize">
                            {diagnostic.status}
                          </span>
                        </Badge>
                        {diagnostic.conversation?.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {diagnostic.conversation.length / 2} follow-up
                            {diagnostic.conversation.length / 2 !== 1
                              ? "s"
                              : ""}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="text-muted-foreground">→</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
