"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Camera,
  X,
  Plus,
  AlertCircle,
  Check,
  Loader2,
  Clock,
  MapPin,
  Hash,
  Tag,
  Calendar,
  DollarSign,
  Package,
  AlertTriangle,
  Download,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useEquipment,
  equipmentTypeLabels,
  equipmentStatusLabels,
  equipmentStatusColors,
  conditionStatusLabels,
  conditionStatusColors,
  logTypeLabels,
  logTypeColors,
  fuelTypeLabels,
  preInspectionChecklist,
  postInspectionChecklist,
  cleaningChecklist,
  getChecklistCategory,
  type EquipmentWithLogs,
  type CreateLogData,
  type CreateInspectionData,
} from "@/lib/hooks/useEquipment";
import { useAuth } from "@/lib/hooks/useAuth";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { useEquipmentParts } from "@/lib/hooks/useEquipmentParts";
import { useEquipmentServiceRecords } from "@/lib/hooks/useEquipmentServiceRecords";
import { createClient } from "@/lib/supabase/client";
import type { Equipment, EquipmentLog, EquipmentInspection, EquipmentPart, EquipmentServiceRecord, EquipmentType, EquipmentStatus, EquipmentCondition, FuelType } from "@/types/database";

const partStatusLabels: Record<string, string> = {
  needed: "Needed", ordered: "Ordered", received: "Received",
};
const partStatusColors: Record<string, string> = {
  needed: "#ea580c", ordered: "#ca8a04", received: "#16a34a",
};

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
}

export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, canManageEquipment, isManager, loading: authLoading } = useAuth();
  const { createNotification } = useNotifications();
  const {
    fetchEquipmentItem,
    updateEquipment,
    uploadEquipmentPhoto,
    deleteEquipmentPhoto,
    createLog,
    createInspection,
    fetchLatestInspection,
    loading,
    error: equipmentError,
  } = useEquipment();

  const {
    parts,
    fetchParts,
    addPart,
    updatePart,
    deletePart,
    error: partsError,
    clearError: clearPartsError,
  } = useEquipmentParts();
  const { records: serviceRecords, fetchRecords: fetchServiceRecords, addRecord: addServiceRecord, deleteRecord: deleteServiceRecord, error: serviceError } = useEquipmentServiceRecords();

  const equipmentId = params.id as string;
  const [equipment, setEquipment] = useState<EquipmentWithLogs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // const [logSheetOpen, setLogSheetOpen] = useState(false); // Removed — replaced by Service History
  const [inspectionSheetOpen, setInspectionSheetOpen] = useState(false);
  const [currentInspectionType, setCurrentInspectionType] = useState<
    "pre" | "post" | "cleaning"
  >("pre");
  const [latestInspection, setLatestInspection] = useState<EquipmentInspection | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  // Parts form state
  const [addingPart, setAddingPart] = useState(false);
  const [newPart, setNewPart] = useState({ name: "", part_number: "", description: "", quantity: "1", estimated_cost: "" });

  // Service record form state
  const [addingService, setAddingService] = useState(false);
  const [newService, setNewService] = useState({ service_date: new Date().toISOString().slice(0, 10), description: "", performed_by: "", hours_at_service: "", cost: "", parts_used: "" });

  // Staff members for dropdown
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [delayReasonInput, setDelayReasonInput] = useState<Record<string, string>>({});

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    equipment_type: "",
    make: "",
    model: "",
    year: "",
    serial_number: "",
    asset_tag: "",
    status: "",
    condition_status: "",
    condition_notes: "",
    needs_parts_ordered: false,
    parts_needed: "",
    estimated_repair_cost: "",
    fuel_type: "",
    location: "",
    current_hours: "",
    service_interval_hours: "",
  });

  // Log form state removed — replaced by Service History

  // Inspection form state
  const [inspectionItems, setInspectionItems] = useState<
    Array<{ id: string; text: string; status: "ok" | "issue" | "na"; notes: string }>
  >([]);
  const [inspectionOverall, setInspectionOverall] = useState<"pass" | "fail" | "needs_attention">(
    "pass"
  );
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [engineHours, setEngineHours] = useState("");
  const [fuelLevel, setFuelLevel] = useState<
    "full" | "three_quarter" | "half" | "quarter" | "empty" | "na"
  >("na");
  const [oilLevel, setOilLevel] = useState<"full" | "ok" | "low" | "critical" | "na">("na");

  // Permission checks — use profile.role from the profiles table (not user metadata)
  // Direct role fallback in case canManageEquipment hasn't updated yet
  const equipmentRoles = ["super", "asst_super", "foreman", "mechanic", "director"];
  const canEdit = canManageEquipment || (!!profile?.role && equipmentRoles.includes(profile.role));
  const canDelete = canManageEquipment || (!!profile?.role && equipmentRoles.includes(profile.role));

  // Load equipment data
  const loadEquipment = useCallback(async () => {
    const data = await fetchEquipmentItem(equipmentId);
    if (data) {
      setEquipment(data);
      setEditForm({
        name: data.name,
        equipment_type: data.equipment_type,
        make: data.make || "",
        model: data.model || "",
        year: data.year ? String(data.year) : "",
        serial_number: data.serial_number || "",
        asset_tag: data.asset_tag || "",
        status: data.status,
        condition_status: data.condition_status,
        condition_notes: data.condition_notes || "",
        needs_parts_ordered: data.needs_parts_ordered,
        parts_needed: data.parts_needed || "",
        estimated_repair_cost: data.estimated_repair_cost ? String(data.estimated_repair_cost) : "",
        fuel_type: data.fuel_type,
        location: data.location || "",
        current_hours: data.current_hours ? String(data.current_hours) : "",
        service_interval_hours: data.service_interval_hours ? String(data.service_interval_hours) : "",
      });
      // Load latest inspection
      const latest = await fetchLatestInspection(equipmentId, "pre");
      if (latest) {
        setLatestInspection(latest);
      }

      // Load parts and service records
      await Promise.all([
        fetchParts(equipmentId),
        fetchServiceRecords(equipmentId),
      ]);
    }
    setIsLoading(false);
  }, [equipmentId, fetchEquipmentItem, fetchLatestInspection, fetchParts, fetchServiceRecords]);

  useEffect(() => {
    void loadEquipment();
  }, [loadEquipment]);

  // Fetch staff members for dropdown
  useEffect(() => {
    async function loadStaff() {
      const supabase = createClient();
      const { data, error } = await supabase.from("profiles")
        .select("id, full_name, role")
        .order("role")
        .order("full_name");
      if (!error && data) {
        setStaffMembers(data);
      }
    }
    void loadStaff();
  }, []);

  // Get staff filtered for equipment service (mechanic only) vs all staff
  const mechanicStaff = staffMembers.filter((s) => s.role === "mechanic");
  const allStaff = staffMembers;

  // Handle photo upload
  const handlePhotoUpload = async (file: File) => {
    if (!equipment) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadEquipmentPhoto(file, equipmentId);
      if (url) {
        const updatedPhotos = [...(equipment.photos || []), url];
        const updated = await updateEquipment(equipmentId, { photos: updatedPhotos });
        if (updated) {
          setEquipment({ ...equipment, photos: updatedPhotos });
        }
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Handle report download
  const handleDownloadReport = async () => {
    if (!equipment) return;
    setGeneratingReport(true);
    try {
      const res = await fetch(`/api/reports/equipment-report?id=${equipmentId}`);
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (equipment.name || "equipment")
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase();
      a.download = `${safeName}-report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Report download error:", err);
    } finally {
      setGeneratingReport(false);
    }
  };

  // Handle photo deletion
  const handlePhotoDelete = async (index: number) => {
    if (!equipment || !equipment.photos) return;
    const photoUrl = equipment.photos[index];
    const success = await deleteEquipmentPhoto(photoUrl, equipmentId);
    if (success) {
      const updatedPhotos = equipment.photos.filter((_, i) => i !== index);
      const updated = await updateEquipment(equipmentId, { photos: updatedPhotos });
      if (updated) {
        setEquipment({ ...equipment, photos: updatedPhotos });
        setSelectedPhotoIndex(Math.max(0, index - 1));
      }
    }
  };

  // Handle equipment update
  const handleEditSubmit = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updateData: Partial<Equipment> = {
        name: editForm.name,
        equipment_type: editForm.equipment_type as EquipmentType,
        make: editForm.make || null,
        model: editForm.model || null,
        year: editForm.year ? parseInt(editForm.year) : null,
        serial_number: editForm.serial_number || null,
        asset_tag: editForm.asset_tag || null,
        status: editForm.status as EquipmentStatus,
        condition_status: editForm.condition_status as EquipmentCondition,
        condition_notes: editForm.condition_notes || null,
        needs_parts_ordered: editForm.needs_parts_ordered,
        parts_needed: editForm.parts_needed || null,
        estimated_repair_cost: editForm.estimated_repair_cost ? parseFloat(editForm.estimated_repair_cost) : null,
        fuel_type: editForm.fuel_type as FuelType,
        location: editForm.location || null,
        current_hours: editForm.current_hours ? parseFloat(editForm.current_hours) : null,
        service_interval_hours: editForm.service_interval_hours ? parseFloat(editForm.service_interval_hours) : null,
      };

      const updated = await updateEquipment(equipmentId, updateData);
      if (updated) {
        setEquipment((prev) => (prev ? { ...prev, ...updated } : null));
        setSaveSuccess(true);
        setEditDialogOpen(false);
        // Show success briefly then clear
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Error in handleEditSubmit:", err);
      // Show the real error from Supabase/network, not a generic message
      const errorMsg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setSaveError(errorMsg.includes("fetch")
        ? "Network error — check your internet connection and try again."
        : errorMsg);
    } finally {
      setSaving(false);
    }
  };

  // Handle log submission
  // handleLogSubmit removed — replaced by Service History

  // Handle inspection submission
  const handleInspectionSubmit = async () => {
    if (!equipment || !user) return;

    const inspectionData: CreateInspectionData = {
      equipment_id: equipmentId,
      inspection_type: currentInspectionType,
      condition_status: editForm.condition_status as EquipmentCondition,
      notes: inspectionNotes,
      checklist_items: inspectionItems.reduce(
        (acc, item) => {
          acc[item.id] = item.status === "ok";
          return acc;
        },
        {} as Record<string, boolean>
      ),
      inspector_id: user.id,
    };

    const inspection = await createInspection(inspectionData);
    if (inspection) {
      setLatestInspection(inspection);
      setInspectionSheetOpen(false);
      // Reset form
      setInspectionItems([]);
      setInspectionNotes("");
      setEngineHours("");
      setFuelLevel("na");
      setOilLevel("na");
      setInspectionOverall("pass");
    }
  };

  // Initialize inspection checklist
  const openInspectionSheet = (type: "pre" | "post" | "cleaning") => {
    setCurrentInspectionType(type);
    let checklist: Array<{ id: string; text: string }>;

    if (type === "pre") {
      checklist = preInspectionChecklist;
    } else if (type === "post") {
      checklist = postInspectionChecklist;
    } else {
      checklist = cleaningChecklist;
    }

    setInspectionItems(
      checklist.map((item) => ({
        ...item,
        status: "na" as const,
        notes: "",
      }))
    );
    setInspectionSheetOpen(true);
  };

  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Equipment not found</p>
      </div>
    );
  }

  const displayPhotos = equipment.photos && equipment.photos.length > 0
    ? equipment.photos
    : equipment.photo_url
    ? [equipment.photo_url]
    : [];

  const statusColor = equipmentStatusColors[equipment.status];
  const conditionColor = conditionStatusColors[equipment.condition_status];

  return (
    <div className="space-y-6 p-6">
      {/* Success toast */}
      {saveSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2 text-base font-medium">
          <Check className="w-5 h-5" />
          Changes saved successfully
        </div>
      )}

      {/* Header */}
      <DetailPageHeader
        title={equipment.name}
        backHref="/equipment"
        backLabel="Back to Equipment"
      />

      <div className="space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{equipment.name}</h1>
          <p className="text-base text-muted-foreground mt-1">{equipmentTypeLabels[equipment.equipment_type]}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge style={{ backgroundColor: statusColor }} className="text-white text-sm px-3 py-1">
            {equipmentStatusLabels[equipment.status]}
          </Badge>
          <Badge style={{ backgroundColor: conditionColor }} className="text-white text-sm px-3 py-1">
            {conditionStatusLabels[equipment.condition_status]}
          </Badge>
        </div>

        {/* Action buttons — large and easy to tap */}
        <div className="flex gap-3">
          {canEdit && (
            <Button
              onClick={() => { setSaveError(null); setEditDialogOpen(true); }}
              size="lg"
              className="flex-1 h-14 text-base font-semibold rounded-xl active:scale-95 transition-all"
            >
              <Edit2 className="w-5 h-5 mr-2" />
              Edit Equipment
            </Button>
          )}
          {canDelete && (
            <Button
              onClick={() => setDeleteConfirmOpen(true)}
              variant="destructive"
              size="lg"
              className="h-14 px-6 text-base font-semibold rounded-xl active:scale-95 transition-all"
            >
              <Trash2 className="w-5 h-5 mr-2" />
              Delete
            </Button>
          )}
        </div>

        {/* Download Report Button */}
        <Button
          onClick={handleDownloadReport}
          disabled={generatingReport}
          variant="outline"
          size="lg"
          className="w-full h-12 text-base font-semibold rounded-xl active:scale-95 transition-all border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332] hover:text-white"
        >
          {generatingReport ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <FileText className="w-5 h-5 mr-2" />
          )}
          {generatingReport ? "Generating Report..." : equipment.condition_status === "beyond_repair" || equipment.status === "out_of_service" ? "Download DRMO Report" : "Download Equipment Report"}
        </Button>
      </div>

      {/* Beyond Repair Banner */}
      {equipment.condition_status === "beyond_repair" && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <span>This equipment has been marked as beyond repair and should not be used.</span>
        </div>
      )}

      {/* Photo Gallery Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Photo Gallery</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {displayPhotos.length > 0 && (
            <>
              {/* Main Photo */}
              <div className="relative bg-gray-100 rounded-lg overflow-hidden aspect-video">
                <img
                  src={displayPhotos[selectedPhotoIndex]}
                  alt={`${equipment.name} photo ${selectedPhotoIndex + 1}`}
                  className="w-full h-full object-cover"
                />
                {canEdit && (
                  <button
                    onClick={() => handlePhotoDelete(selectedPhotoIndex)}
                    className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-2 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Thumbnails */}
              <div className="flex gap-2 overflow-x-auto">
                {displayPhotos.map((photo, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedPhotoIndex(index)}
                    className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-colors ${
                      selectedPhotoIndex === index ? "border-blue-500" : "border-gray-300"
                    }`}
                  >
                    <img src={photo} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </>
          )}

          {displayPhotos.length === 0 && (
            <div className="flex items-center justify-center h-40 bg-gray-100 rounded-lg">
              <p className="text-gray-500">No photos uploaded yet</p>
            </div>
          )}

          {canEdit && (
            <div>
              <label htmlFor="photo-upload">
                <Button
                  asChild
                  variant="outline"
                  disabled={uploadingPhoto}
                  className="cursor-pointer"
                >
                  <span>
                    <Camera className="w-4 h-4 mr-2" />
                    {uploadingPhoto ? "Uploading..." : "Add Photo"}
                  </span>
                </Button>
              </label>
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) handlePhotoUpload(file);
                }}
                className="hidden"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Condition & Status Section */}
      <Card>
        <CardHeader>
          <CardTitle>Condition & Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Condition Status</Label>
              <Badge style={{ backgroundColor: conditionColor }} className="text-white mt-1">
                {conditionStatusLabels[equipment.condition_status]}
              </Badge>
            </div>
            <div>
              <Label className="text-sm font-medium">Equipment Status</Label>
              <Badge style={{ backgroundColor: statusColor }} className="text-white mt-1">
                {equipmentStatusLabels[equipment.status]}
              </Badge>
            </div>
          </div>

          {equipment.condition_notes && (
            <div>
              <Label className="text-sm font-medium">Condition Notes</Label>
              <p className="text-sm text-gray-600 mt-1">{equipment.condition_notes}</p>
            </div>
          )}

          {equipment.estimated_repair_cost != null && (
            <div>
              <Label className="text-sm font-medium">Estimated Repair Cost</Label>
              <p className="text-lg font-semibold mt-1">
                ${Number(equipment.estimated_repair_cost).toFixed(2)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parts Needed Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Parts Needed
              {parts.length > 0 && (
                <Badge variant="outline" className="ml-1">{parts.length}</Badge>
              )}
            </span>
            {canEdit && (
              <Button onClick={() => setAddingPart(true)} size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-1" />
                Add Part
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Parts error banner — surfaces silent updatePart/deletePart failures */}
          {partsError && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-destructive">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-sm font-medium">{partsError}</div>
              <button
                type="button"
                aria-label="Dismiss parts error"
                className="text-destructive/70 hover:text-destructive"
                onClick={() => clearPartsError()}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Add Part Form */}
          {addingPart && (
            <div className="border rounded-lg p-4 mb-4 bg-gray-50 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="part-name" className="text-xs">Part Name *</Label>
                  <Input id="part-name" placeholder="e.g. Drive Belt" value={newPart.name} onChange={(e) => setNewPart({ ...newPart, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="part-number" className="text-xs">Part Number</Label>
                  <Input id="part-number" placeholder="e.g. GX20072" value={newPart.part_number} onChange={(e) => setNewPart({ ...newPart, part_number: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="part-desc" className="text-xs">Description</Label>
                <Textarea id="part-desc" placeholder="What is this part for?" value={newPart.description} onChange={(e) => setNewPart({ ...newPart, description: e.target.value })} className="h-16" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="part-qty" className="text-xs">Quantity</Label>
                  <Input id="part-qty" type="number" min="1" value={newPart.quantity} onChange={(e) => setNewPart({ ...newPart, quantity: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="part-cost" className="text-xs">Estimated Cost</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <Input id="part-cost" type="number" step="0.01" min="0" placeholder="0.00" className="pl-7" value={newPart.estimated_cost} onChange={(e) => setNewPart({ ...newPart, estimated_cost: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setAddingPart(false); setNewPart({ name: "", part_number: "", description: "", quantity: "1", estimated_cost: "" }); }}>Cancel</Button>
                <Button size="sm" disabled={!newPart.name.trim()} onClick={async () => {
                  const { data: partResult, error: partErr } = await addPart(equipmentId, {
                    name: newPart.name,
                    part_number: newPart.part_number || undefined,
                    description: newPart.description || undefined,
                    quantity: parseInt(newPart.quantity) || 1,
                    estimated_cost: newPart.estimated_cost ? parseFloat(newPart.estimated_cost) : undefined,
                  });
                  if (partResult) {
                    setNewPart({ name: "", part_number: "", description: "", quantity: "1", estimated_cost: "" });
                    setAddingPart(false);
                    setSaveSuccess(true);
                    setTimeout(() => setSaveSuccess(false), 2000);
                    // Re-fetch to ensure sync
                    await fetchParts(equipmentId);
                  } else {
                    setSaveError(`Failed to save part: ${partErr || "Unknown error"}`);
                  }
                }}>Add Part</Button>
              </div>
            </div>
          )}

          {/* Parts List */}
          {parts.length > 0 ? (
            <div className="space-y-2">
              {parts.map((part) => (
                <div key={part.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{part.name}</span>
                      {part.part_number && (
                        <Badge variant="outline" className="text-xs font-mono">#{part.part_number}</Badge>
                      )}
                      <Badge style={{ backgroundColor: partStatusColors[part.status] }} className="text-white text-xs">
                        {partStatusLabels[part.status]}
                      </Badge>
                    </div>
                    {part.description && <p className="text-xs text-gray-500 mt-1">{part.description}</p>}
                    <div className="text-xs text-gray-400 mt-1 flex gap-3">
                      <span>Qty: {part.quantity}</span>
                      {part.estimated_cost != null && <span>Est: ${Number(part.estimated_cost).toFixed(2)}</span>}
                    </div>
                    {/* Delay reason display */}
                    {part.delay_reason && part.status === "needed" && (
                      <div className="mt-1.5 text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1 text-amber-800">
                        <span className="font-semibold">Delayed:</span> {part.delay_reason}
                      </div>
                    )}
                    {/* Delay reason input */}
                    {delayReasonInput[part.id] !== undefined && (
                      <div className="mt-2 flex gap-2 items-end">
                        <div className="flex-1">
                          <Label className="text-xs text-amber-700">Reason for delay *</Label>
                          <Input
                            placeholder="e.g. Backordered, supplier out of stock..."
                            value={delayReasonInput[part.id]}
                            onChange={(e) => setDelayReasonInput((prev) => ({ ...prev, [part.id]: e.target.value }))}
                            className="h-8 text-xs"
                          />
                        </div>
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-amber-600 hover:bg-amber-700"
                          disabled={!delayReasonInput[part.id]?.trim()}
                          onClick={async () => {
                            clearPartsError();
                            const { error: err } = await updatePart(part.id, { delay_reason: delayReasonInput[part.id] });
                            if (err) {
                              setSaveError(`Failed to save delay reason: ${err}`);
                              return;
                            }
                            setDelayReasonInput((prev) => {
                              const next = { ...prev };
                              delete next[part.id];
                              return next;
                            });
                            setSaveSuccess(true);
                            setTimeout(() => setSaveSuccess(false), 2000);
                            await fetchParts(equipmentId);
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          onClick={() => setDelayReasonInput((prev) => {
                            const next = { ...prev };
                            delete next[part.id];
                            return next;
                          })}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {part.status === "needed" && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-green-700" onClick={async () => {
                            clearPartsError();
                            const { error: err } = await updatePart(part.id, { status: "ordered" });
                            if (err) {
                              setSaveError(`Failed to mark Ordered: ${err}`);
                            } else {
                              setSaveSuccess(true);
                              setTimeout(() => setSaveSuccess(false), 2000);
                              await fetchParts(equipmentId);
                            }
                          }}>
                            Ordered
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-700" onClick={() => {
                            setDelayReasonInput((prev) => ({ ...prev, [part.id]: part.delay_reason || "" }));
                          }}>
                            Delayed
                          </Button>
                        </>
                      )}
                      {part.status === "ordered" && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-green-700" onClick={async () => {
                          clearPartsError();
                          const { error: err } = await updatePart(part.id, { status: "received" });
                          if (err) {
                            setSaveError(`Failed to mark Received: ${err}`);
                          } else {
                            setSaveSuccess(true);
                            setTimeout(() => setSaveSuccess(false), 2000);
                            await fetchParts(equipmentId);
                          }
                        }}>
                          Received
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={async () => {
                        if (!window.confirm(`Delete part "${part.name}"? This cannot be undone.`)) return;
                        clearPartsError();
                        const { success, error: err } = await deletePart(part.id);
                        if (!success) {
                          setSaveError(`Failed to delete part: ${err || "Unknown error"}`);
                        } else {
                          setSaveSuccess(true);
                          setTimeout(() => setSaveSuccess(false), 2000);
                        }
                      }}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No parts needed</p>
          )}
        </CardContent>
      </Card>

      {/* Service History Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Service History
              {serviceRecords.length > 0 && (
                <Badge variant="outline" className="ml-1">{serviceRecords.length}</Badge>
              )}
            </span>
            {canEdit && (
              <Button onClick={() => setAddingService(true)} size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-1" />
                Add Record
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Add Service Form */}
          {addingService && (
            <div className="border rounded-lg p-4 mb-4 bg-gray-50 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="svc-date" className="text-xs">Service Date *</Label>
                  <Input id="svc-date" type="date" value={newService.service_date} onChange={(e) => setNewService({ ...newService, service_date: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="svc-by" className="text-xs">Performed By *</Label>
                  <Select value={newService.performed_by} onValueChange={(val) => setNewService({ ...newService, performed_by: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {mechanicStaff.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">Mechanics</div>
                          {mechanicStaff.map((s) => (
                            <SelectItem key={s.id} value={s.full_name}>{s.full_name}</SelectItem>
                          ))}
                        </>
                      )}
                      <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">All Staff</div>
                      {allStaff.filter((s) => s.role !== "mechanic").map((s) => (
                        <SelectItem key={s.id} value={s.full_name}>{s.full_name} ({s.role})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="svc-desc" className="text-xs">What Was Done *</Label>
                <Textarea id="svc-desc" placeholder="Describe the service performed..." value={newService.description} onChange={(e) => setNewService({ ...newService, description: e.target.value })} className="h-20" />
              </div>
              <div>
                <Label htmlFor="svc-parts" className="text-xs">Parts Used</Label>
                <Input id="svc-parts" placeholder="e.g. Oil filter, 5qt 10W-30" value={newService.parts_used} onChange={(e) => setNewService({ ...newService, parts_used: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="svc-hours" className="text-xs">Hours at Service</Label>
                  <Input id="svc-hours" type="number" step="0.1" placeholder="0.0" value={newService.hours_at_service} onChange={(e) => setNewService({ ...newService, hours_at_service: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="svc-cost" className="text-xs">Cost</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <Input id="svc-cost" type="number" step="0.01" min="0" placeholder="0.00" className="pl-7" value={newService.cost} onChange={(e) => setNewService({ ...newService, cost: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setAddingService(false); setNewService({ service_date: new Date().toISOString().slice(0, 10), description: "", performed_by: "", hours_at_service: "", cost: "", parts_used: "" }); }}>Cancel</Button>
                <Button size="sm" disabled={!newService.description.trim() || !newService.performed_by.trim()} onClick={async () => {
                  const { data: svcResult, error: svcErr } = await addServiceRecord(equipmentId, {
                    service_date: newService.service_date,
                    description: newService.description,
                    performed_by: newService.performed_by,
                    hours_at_service: newService.hours_at_service ? parseFloat(newService.hours_at_service) : undefined,
                    cost: newService.cost ? parseFloat(newService.cost) : undefined,
                    parts_used: newService.parts_used || undefined,
                  });
                  if (svcResult) {
                    setNewService({ service_date: new Date().toISOString().slice(0, 10), description: "", performed_by: "", hours_at_service: "", cost: "", parts_used: "" });
                    setAddingService(false);
                    setSaveSuccess(true);
                    setTimeout(() => setSaveSuccess(false), 2000);
                    // Re-fetch to ensure sync
                    await fetchServiceRecords(equipmentId);
                  } else {
                    setSaveError(`Failed to save service record: ${svcErr || "Unknown error"}`);
                  }
                }}>Add Record</Button>
              </div>
            </div>
          )}

          {/* Service Records List */}
          {serviceRecords.length > 0 ? (
            <div className="space-y-3">
              {serviceRecords.map((record) => (
                <div key={record.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm font-medium">{new Date(record.service_date).toLocaleDateString()}</span>
                      <span className="text-xs text-gray-400">by</span>
                      <span className="text-sm font-medium text-green-800">{record.performed_by}</span>
                    </div>
                    {canEdit && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => deleteServiceRecord(record.id)}>
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.description}</p>
                  {record.parts_used && (
                    <p className="text-xs text-gray-500 mt-1"><span className="font-medium">Parts:</span> {record.parts_used}</p>
                  )}
                  <div className="text-xs text-gray-400 mt-1 flex gap-3">
                    {record.hours_at_service && <span>{record.hours_at_service} hrs</span>}
                    {record.cost && <span>Cost: ${Number(record.cost).toFixed(2)}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No service records yet</p>
          )}
        </CardContent>
      </Card>

      {/* Equipment Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>Equipment Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {equipment.make && (
            <div>
              <Label className="text-sm font-medium">Make</Label>
              <p className="text-sm text-gray-600">{equipment.make}</p>
            </div>
          )}
          {equipment.model && (
            <div>
              <Label className="text-sm font-medium">Model</Label>
              <p className="text-sm text-gray-600">{equipment.model}</p>
            </div>
          )}
          {equipment.year && (
            <div>
              <Label className="text-sm font-medium">Year</Label>
              <p className="text-sm text-gray-600">{equipment.year}</p>
            </div>
          )}
          {equipment.serial_number && (
            <div>
              <Label className="text-sm font-medium">Serial Number</Label>
              <p className="text-sm text-gray-600">{equipment.serial_number}</p>
            </div>
          )}
          {equipment.asset_tag && (
            <div>
              <Label className="text-sm font-medium">Asset Tag</Label>
              <p className="text-sm text-gray-600">{equipment.asset_tag}</p>
            </div>
          )}
          {equipment.fuel_type && (
            <div>
              <Label className="text-sm font-medium">Fuel Type</Label>
              <p className="text-sm text-gray-600">{fuelTypeLabels[equipment.fuel_type]}</p>
            </div>
          )}
          {equipment.location && (
            <div>
              <Label className="text-sm font-medium">Location</Label>
              <p className="text-sm text-gray-600">{equipment.location}</p>
            </div>
          )}
          {equipment.current_hours !== null && (
            <div>
              <Label className="text-sm font-medium">Current Hours</Label>
              <p className="text-sm text-gray-600">{equipment.current_hours.toFixed(1)}</p>
            </div>
          )}
          {equipment.service_interval_hours !== null && (
            <div>
              <Label className="text-sm font-medium">Service Interval</Label>
              <p className="text-sm text-gray-600">{equipment.service_interval_hours.toFixed(1)} hours</p>
            </div>
          )}
          {equipment.purchase_date && (
            <div>
              <Label className="text-sm font-medium">Purchase Date</Label>
              <p className="text-sm text-gray-600">
                {new Date(equipment.purchase_date).toLocaleDateString()}
              </p>
            </div>
          )}
          {equipment.purchase_price != null && (
            <div>
              <Label className="text-sm font-medium">Purchase Price</Label>
              <p className="text-sm text-gray-600">${Number(equipment.purchase_price).toFixed(2)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inspection Section */}
      <Card>
        <CardHeader>
          <CardTitle>Inspections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button onClick={() => openInspectionSheet("pre")} variant="outline" size="sm" className="w-full">
              Run Pre-Inspection
            </Button>
            <Button onClick={() => openInspectionSheet("post")} variant="outline" size="sm" className="w-full">
              Run Post-Inspection
            </Button>
            <Button onClick={() => openInspectionSheet("cleaning")} variant="outline" size="sm" className="w-full">
              Run Cleaning Check
            </Button>
          </div>

          {latestInspection && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Latest Inspection</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <Label className="text-xs font-medium">Type</Label>
                  <p className="text-gray-600">
                    {latestInspection.inspection_type === "pre"
                      ? "Pre-Operation"
                      : latestInspection.inspection_type === "post"
                      ? "Post-Operation"
                      : "Cleaning"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-medium">Status</Label>
                  <p className="text-gray-600">{latestInspection.overall_status}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium">Date</Label>
                  <p className="text-gray-600">
                    {new Date(latestInspection.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maintenance Logs removed — replaced by Service History above */}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Equipment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic Info */}
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="equipment_type">Equipment Type</Label>
              <Select value={editForm.equipment_type} onValueChange={(value) => setEditForm({ ...editForm, equipment_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(equipmentTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={editForm.make}
                  onChange={(e) => setEditForm({ ...editForm, make: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={editForm.model}
                  onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={editForm.year}
                  onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="serial_number">Serial Number</Label>
                <Input
                  id="serial_number"
                  value={editForm.serial_number}
                  onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="asset_tag">Asset Tag</Label>
              <Input
                id="asset_tag"
                value={editForm.asset_tag}
                onChange={(e) => setEditForm({ ...editForm, asset_tag: e.target.value })}
              />
            </div>

            {/* Status & Condition */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(equipmentStatusLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="condition_status">Condition</Label>
                <Select value={editForm.condition_status} onValueChange={(value) => setEditForm({ ...editForm, condition_status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(conditionStatusLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="condition_notes">Condition Notes</Label>
              <Textarea
                id="condition_notes"
                value={editForm.condition_notes}
                onChange={(e) => setEditForm({ ...editForm, condition_notes: e.target.value })}
              />
            </div>

            {/* Parts & Repair */}
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600">
                Parts are now managed in the <strong>Parts Needed</strong> section below. Use it to add individual parts with part numbers, descriptions, and track their order status.
              </p>
            </div>

            <div>
              <Label htmlFor="estimated_repair_cost">Estimated Repair Cost</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <Input
                  id="estimated_repair_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="pl-7"
                  value={editForm.estimated_repair_cost}
                  onChange={(e) => setEditForm({ ...editForm, estimated_repair_cost: e.target.value })}
                />
              </div>
            </div>

            {/* Operational Details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fuel_type">Fuel Type</Label>
                <Select value={editForm.fuel_type} onValueChange={(value) => setEditForm({ ...editForm, fuel_type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(fuelTypeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="current_hours">Current Hours</Label>
                <Input
                  id="current_hours"
                  type="number"
                  step="0.1"
                  value={editForm.current_hours}
                  onChange={(e) => setEditForm({ ...editForm, current_hours: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="service_interval_hours">Service Interval (Hours)</Label>
                <Input
                  id="service_interval_hours"
                  type="number"
                  step="0.1"
                  value={editForm.service_interval_hours}
                  onChange={(e) => setEditForm({ ...editForm, service_interval_hours: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Error message */}
          {saveError && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-destructive">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div className="text-sm font-medium">{saveError}</div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={saving} className="min-w-[140px]">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspection Sheet */}
      <Sheet open={inspectionSheetOpen} onOpenChange={setInspectionSheetOpen}>
        <SheetContent side="right" className="w-full sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {currentInspectionType === "pre"
                ? "Pre-Operation Inspection"
                : currentInspectionType === "post"
                ? "Post-Operation Inspection"
                : "Cleaning Check"}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-4">
            {/* Checklist Items */}
            {inspectionItems.map((item, idx) => (
              <div key={item.id} className="border rounded p-3">
                <div className="font-medium mb-2">{item.text}</div>
                <div className="flex gap-2 mb-2">
                  {(["ok", "issue", "na"] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() =>
                        setInspectionItems((prev) =>
                          prev.map((i, index) =>
                            index === idx ? { ...i, status } : i
                          )
                        )
                      }
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        item.status === status
                          ? status === "ok"
                            ? "bg-green-500 text-white"
                            : status === "issue"
                            ? "bg-red-500 text-white"
                            : "bg-gray-500 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {status === "ok" ? "OK" : status === "issue" ? "Issue" : "N/A"}
                    </button>
                  ))}
                </div>
                {item.status !== "na" && (
                  <Input
                    placeholder="Notes"
                    value={item.notes}
                    onChange={(e) =>
                      setInspectionItems((prev) =>
                        prev.map((i, index) =>
                          index === idx ? { ...i, notes: e.target.value } : i
                        )
                      )
                    }
                    className="text-sm"
                  />
                )}
              </div>
            ))}

            {/* Additional Fields */}
            <div>
              <Label htmlFor="engine-hours">Engine Hours</Label>
              <Input
                id="engine-hours"
                type="number"
                step="0.1"
                value={engineHours}
                onChange={(e) => setEngineHours(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="fuel-level">Fuel Level</Label>
              <Select value={fuelLevel} onValueChange={(value: string) => setFuelLevel(value as typeof fuelLevel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="three_quarter">Three Quarter</SelectItem>
                  <SelectItem value="half">Half</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="empty">Empty</SelectItem>
                  <SelectItem value="na">N/A</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="oil-level">Oil Level</Label>
              <Select value={oilLevel} onValueChange={(value: string) => setOilLevel(value as typeof oilLevel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="na">N/A</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="inspection-notes">Notes</Label>
              <Textarea
                id="inspection-notes"
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="inspection-overall">Overall Status</Label>
              <Select value={inspectionOverall} onValueChange={(value: string) => setInspectionOverall(value as typeof inspectionOverall)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                  <SelectItem value="needs_attention">Needs Attention</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setInspectionSheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInspectionSubmit}>Submit Inspection</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Log Sheet removed — replaced by Service History */}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Equipment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {equipment.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => {
              // Call delete function here
              setDeleteConfirmOpen(false);
              router.back();
            }}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
