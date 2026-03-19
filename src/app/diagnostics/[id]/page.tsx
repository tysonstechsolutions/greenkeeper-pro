"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Stethoscope,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Package,
  Calendar,
  Wind,
  Droplets,
  ThermometerSun,
  Send,
  Loader2,
  ClipboardList,
  MessageSquare,
  FlaskConical,
  Leaf,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDiagnostics } from "@/lib/hooks/useDiagnostics";
import { useWeather } from "@/lib/hooks/useWeather";

const STATUS_OPTIONS = [
  { value: "diagnosed", label: "Diagnosed", color: "bg-blue-100 text-blue-800" },
  { value: "treating", label: "In Treatment", color: "bg-orange-100 text-orange-800" },
  { value: "monitoring", label: "Monitoring", color: "bg-purple-100 text-purple-800" },
  { value: "resolved", label: "Resolved", color: "bg-green-100 text-green-800" },
];

const getSeverityColor = (severity: number) => {
  if (severity <= 2) return "bg-green-500";
  if (severity <= 3) return "bg-yellow-500";
  if (severity <= 4) return "bg-orange-500";
  return "bg-red-500";
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

interface DiagnosticData {
  id: string;
  course_id: string;
  created_by: string | null;
  zone_id: string | null;
  photo_url: string;
  description: string | null;
  category: string;
  status: "pending" | "diagnosed" | "treating" | "resolved" | "monitoring";
  full_response: {
    diagnosis: {
      condition: string;
      scientific_name?: string;
      confidence: "high" | "medium" | "low";
      confidence_reason: string;
      severity: number;
      severity_label: string;
      category: string;
      description: string;
      differential: string[];
    };
    treatment: {
      immediate_actions: string[];
      products: Array<{
        name: string;
        active_ingredient: string;
        type: string;
        application_rate: string;
        rate_per_acre: string;
        water_volume: string;
        method: string;
        timing: string;
        rei_hours: number;
        precautions: string[];
        in_inventory: boolean;
        alternative_products: string[];
      }>;
      application_window: {
        best_date: string;
        best_time: string;
        ideal_temp_range: string;
        max_wind: string;
        rain_buffer: string;
        avoid: string;
      };
      follow_up: Array<{
        days_after: number;
        action: string;
        what_to_look_for: string;
        if_no_improvement: string;
      }>;
    };
    prevention: string[];
    additional_notes: string;
    lab_test_recommended: boolean;
    extension_contact?: string;
  } | null;
  conversation: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  zone?: {
    id: string;
    name: string;
    zone_type: string;
    hole_number: number | null;
  };
}

export default function DiagnosisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [askingFollowUp, setAskingFollowUp] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  const {
    loading,
    error,
    fetchDiagnosis,
    askFollowUp,
    updateStatus,
    createTaskFromDiagnosis,
  } = useDiagnostics();
  const { forecast } = useWeather();

  // Fetch diagnosis on mount
  useEffect(() => {
    const loadDiagnosis = async () => {
      if (params.id && typeof params.id === "string") {
        const data = await fetchDiagnosis(params.id);
        if (data) {
          setDiagnostic(data as unknown as DiagnosticData);
        }
      }
    };
    loadDiagnosis();
  }, [params.id, fetchDiagnosis]);

  // Scroll to bottom of chat when conversation updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [diagnostic?.conversation]);

  const handleStatusChange = async (newStatus: string) => {
    if (!diagnostic) return;
    const success = await updateStatus(diagnostic.id, newStatus as DiagnosticData["status"]);
    if (success) {
      setDiagnostic({ ...diagnostic, status: newStatus as DiagnosticData["status"] });
    }
  };

  const handleAskFollowUp = async () => {
    if (!diagnostic || !followUpQuestion.trim()) return;

    setAskingFollowUp(true);
    const updatedConversation = await askFollowUp(diagnostic.id, followUpQuestion);
    if (updatedConversation) {
      setDiagnostic({
        ...diagnostic,
        conversation: updatedConversation,
      });
      setFollowUpQuestion("");
    }
    setAskingFollowUp(false);
  };

  const handleCreateTask = async () => {
    if (!diagnostic) return;

    setCreatingTask(true);
    const taskId = await createTaskFromDiagnosis(diagnostic.id);
    setCreatingTask(false);
    setShowTaskDialog(false);

    if (taskId) {
      setDiagnostic({ ...diagnostic, status: "treating" });
      router.push(`/tasks/${taskId}`);
    }
  };

  if (loading && !diagnostic) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B4332]" />
      </div>
    );
  }

  if (error || !diagnostic) {
    return (
      <div className="container mx-auto p-6">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Card className="border-red-200">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Failed to load diagnosis</p>
            <p className="text-muted-foreground">{error || "Record not found"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const result = diagnostic.full_response;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <DetailPageHeader
        backHref="/diagnostics"
        backLabel="Course Doctor"
        title={result?.diagnosis?.condition || "Diagnosis Details"}
        subtitle={`${diagnostic.zone?.name || "No zone"} • ${new Date(diagnostic.created_at).toLocaleDateString()}`}
        actions={
          <div className="flex items-center gap-2">
            <Select value={diagnostic.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      {getStatusIcon(opt.value)}
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {diagnostic.status !== "resolved" && result && (
              <Button
                className="bg-[#1B4332] hover:bg-[#1B4332]/90"
                onClick={() => setShowTaskDialog(true)}
              >
                <ClipboardList className="h-4 w-4 mr-2" />
                Create Task
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Photo & Diagnosis */}
        <div className="space-y-6">
          {/* Photo */}
          <Card>
            <CardContent className="p-0">
              <img
                src={diagnostic.photo_url}
                alt="Diagnosis photo"
                className="w-full aspect-video object-cover rounded-t-lg"
              />
              {diagnostic.description && (
                <div className="p-4">
                  <p className="text-sm text-muted-foreground">
                    {diagnostic.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Diagnosis Card */}
          {result && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Stethoscope className="h-5 w-5 text-[#1B4332]" />
                    Diagnosis
                  </CardTitle>
                  <Badge
                    className={`${getSeverityColor(result.diagnosis.severity)} text-white`}
                  >
                    {result.diagnosis.severity_label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">
                    {result.diagnosis.condition}
                  </h3>
                  {result.diagnosis.scientific_name && (
                    <p className="text-sm italic text-muted-foreground">
                      {result.diagnosis.scientific_name}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {result.diagnosis.confidence} confidence
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {result.diagnosis.confidence_reason}
                  </span>
                </div>

                <p className="text-sm">{result.diagnosis.description}</p>

                {result.diagnosis.differential.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">
                      Differential Diagnosis
                    </h4>
                    <ul className="text-sm space-y-1">
                      {result.diagnosis.differential.map((diff, i) => (
                        <li key={i} className="text-muted-foreground">
                          • {diff}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.lab_test_recommended && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-yellow-800">
                      <FlaskConical className="h-4 w-4 inline mr-1" />
                      Lab confirmation recommended
                    </p>
                    {result.extension_contact && (
                      <p className="text-xs text-yellow-700 mt-1">
                        {result.extension_contact}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Middle Column - Treatment Plan */}
        <div className="space-y-6">
          {result && (
            <>
              {/* Immediate Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Immediate Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-2">
                    {result.treatment.immediate_actions.map((action, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1B4332] text-white text-sm flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="text-sm">{action}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>

              {/* Products Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Package className="h-5 w-5" />
                    Recommended Products
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {result.treatment.products.map((product, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-lg border ${
                          product.in_inventory
                            ? "border-green-200 bg-green-50"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium">{product.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {product.active_ingredient}
                            </p>
                          </div>
                          {product.in_inventory ? (
                            <Badge className="bg-green-100 text-green-800">
                              In Stock
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600">
                              Not in Stock
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Rate:</span>{" "}
                            {product.application_rate}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Per Acre:
                            </span>{" "}
                            {product.rate_per_acre}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Water:
                            </span>{" "}
                            {product.water_volume}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Method:
                            </span>{" "}
                            {product.method}
                          </div>
                          <div className="col-span-2">
                            <span className="text-muted-foreground">
                              Timing:
                            </span>{" "}
                            {product.timing}
                          </div>
                          <div className="col-span-2">
                            <span className="text-muted-foreground">REI:</span>{" "}
                            {product.rei_hours} hours
                          </div>
                        </div>

                        {!product.in_inventory &&
                          product.alternative_products.length > 0 && (
                            <div className="mt-2 pt-2 border-t">
                              <span className="text-sm text-muted-foreground">
                                Alternatives:{" "}
                              </span>
                              <span className="text-sm">
                                {product.alternative_products.join(", ")}
                              </span>
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Application Window */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="h-5 w-5" />
                    Application Window
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-[#1B4332]/5 rounded-lg p-4">
                    <div className="text-center mb-4">
                      <p className="text-sm text-muted-foreground">
                        Best Application Date
                      </p>
                      <p className="text-xl font-bold text-[#1B4332]">
                        {result.treatment.application_window.best_date}
                      </p>
                      <p className="text-sm">
                        {result.treatment.application_window.best_time}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <ThermometerSun className="h-4 w-4 text-orange-500" />
                        <span>
                          {result.treatment.application_window.ideal_temp_range}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wind className="h-4 w-4 text-blue-500" />
                        <span>
                          {result.treatment.application_window.max_wind}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 col-span-2">
                        <Droplets className="h-4 w-4 text-blue-500" />
                        <span>
                          {result.treatment.application_window.rain_buffer}
                        </span>
                      </div>
                    </div>

                    {result.treatment.application_window.avoid && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm text-red-600">
                          <AlertTriangle className="h-3 w-3 inline mr-1" />
                          Avoid: {result.treatment.application_window.avoid}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Weather Forecast Preview */}
                  {forecast && forecast.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">
                        7-Day Forecast
                      </h4>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {forecast.slice(0, 7).map((day, i) => (
                          <div
                            key={i}
                            className="flex-shrink-0 w-20 p-2 rounded-lg bg-muted text-center"
                          >
                            <p className="text-xs text-muted-foreground">
                              {new Date(day.date).toLocaleDateString("en-US", {
                                weekday: "short",
                              })}
                            </p>
                            <p className="font-medium">
                              {Math.round(day.high_f)}°
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {day.precipitation_chance}%
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Right Column - Follow-up & Prevention */}
        <div className="space-y-6">
          {result && (
            <>
              {/* Follow-up Schedule */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Follow-up Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {result.treatment.follow_up.map((followUp, i) => (
                      <div key={i} className="relative pl-6 pb-4 border-l-2 border-[#1B4332]/20 last:pb-0">
                        <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-[#1B4332]" />
                        <p className="font-medium">Day {followUp.days_after}</p>
                        <p className="text-sm">{followUp.action}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Look for: {followUp.what_to_look_for}
                        </p>
                        {followUp.if_no_improvement && (
                          <p className="text-sm text-orange-600 mt-1">
                            If no improvement: {followUp.if_no_improvement}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Prevention */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Leaf className="h-5 w-5" />
                    Prevention
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {result.prevention.map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {result.additional_notes && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        {result.additional_notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Chat Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="h-5 w-5" />
                Follow-up Questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Conversation History */}
              <div className="max-h-[300px] overflow-y-auto space-y-4 mb-4">
                {diagnostic.conversation.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ask a follow-up question about this diagnosis
                  </p>
                ) : (
                  diagnostic.conversation.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg p-3 ${
                          msg.role === "user"
                            ? "bg-[#1B4332] text-white"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">
                          {msg.content}
                        </p>
                        <p
                          className={`text-xs mt-1 ${
                            msg.role === "user"
                              ? "text-white/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Ask a follow-up question..."
                  value={followUpQuestion}
                  onChange={(e) => setFollowUpQuestion(e.target.value)}
                  rows={2}
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAskFollowUp();
                    }
                  }}
                />
                <Button
                  className="bg-[#1B4332] hover:bg-[#1B4332]/90"
                  disabled={!followUpQuestion.trim() || askingFollowUp}
                  onClick={handleAskFollowUp}
                >
                  {askingFollowUp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Task Dialog */}
      <AlertDialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Treatment Task</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new task based on this diagnosis with all the
              treatment details and recommended products. The diagnosis status
              will be updated to &ldquo;In Treatment&rdquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateTask}
              disabled={creatingTask}
              className="bg-[#1B4332] hover:bg-[#1B4332]/90"
            >
              {creatingTask ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Create Task
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
