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
import type { Equipment, EquipmentLog, EquipmentInspection } from "@/types/database";

export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, canManageEquipment, isManager } = useAuth();
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
  } = useEquipment();

  const equipmentId = params.id as string;
  const [equipment, setEquipment] = useState<EquipmentWithLogs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [logSheetOpen, setLogSheetOpen] = useState(false);
  const [inspectionSheetOpen, setInspectionSheetOpen] = useState(false);
  const [currentInspectionType, setCurrentInspectionType] = useState<
    "pre" | "post" | "cleaning"
  >("pre");
  const [latestInspection, setLatestInspection] = useState<EquipmentInspection | null>(null);

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

  // Log form state
  const [logForm, setLogForm] = useState<CreateLogData>({
    log_type: "service",
    description: "",
    hours_at_service: 0,
    cost: undefined,
    parts_used: [],
    vendor: "",
    downtime_hours: undefined,
    photos: [],
  });

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
  const canEdit = canManageEquipment;
  const canDelete = canManageEquipment;

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
      setLogForm((prev) => ({
        ...prev,
        hours_at_service: data.current_hours ?? 0,
      }));

      // Load latest inspection
      const latest = await fetchLatestInspection(equipmentId, "pre");
      if (latest) {
        setLatestInspection(latest);
      }
    }
    setIsLoading(false);
  }, [equipmentId, fetchEquipmentItem, fetchLatestInspection]);

  useEffect(() => {
    void loadEquipment();
  }, [loadEquipment]);

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
    const updateData: Partial<Equipment> = {
      name: editForm.name,
      equipment_type: editForm.equipment_type as any,
      make: editForm.make || null,
      model: editForm.model || null,
      year: editForm.year ? parseInt(editForm.year) : null,
      serial_number: editForm.serial_number || null,
      asset_tag: editForm.asset_tag || null,
      status: editForm.status as any,
      condition_status: editForm.condition_status as any,
      condition_notes: editForm.condition_notes || null,
      needs_parts_ordered: editForm.needs_parts_ordered,
      parts_needed: editForm.parts_needed || null,
      estimated_repair_cost: editForm.estimated_repair_cost ? parseFloat(editForm.estimated_repair_cost) : null,
      fuel_type: editForm.fuel_type as any,
      location: editForm.location || null,
      current_hours: editForm.current_hours ? parseFloat(editForm.current_hours) : null,
      service_interval_hours: editForm.service_interval_hours ? parseFloat(editForm.service_interval_hours) : null,
    };

    const updated = await updateEquipment(equipmentId, updateData);
    if (updated) {
      setEquipment((prev) => (prev ? { ...prev, ...updated } : null));
      setEditDialogOpen(false);
    }
  };

  // Handle log submission
  const handleLogSubmit = async () => {
    if (!equipment || !logForm.description.trim()) return;

    const newLog = await createLog(equipmentId, logForm);
    if (newLog) {
      await loadEquipment();
      setLogForm({
        log_type: "service",
        description: "",
        hours_at_service: equipment.current_hours ?? 0,
        cost: undefined,
        parts_used: [],
        vendor: "",
        downtime_hours: undefined,
        photos: [],
      });
      setLogSheetOpen(false);
    }
  };

  // Handle inspection submission
  const handleInspectionSubmit = async () => {
    if (!equipment || !user) return;

    const inspectionData: CreateInspectionData = {
      equipment_id: equipmentId,
      inspection_type: currentInspectionType,
      condition_status: editForm.condition_status as any,
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

  if (isLoading) {
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
      {/* Header */}
      <DetailPageHeader
        title={equipment.name}
        backHref="/equipment"
        backLabel="Back to Equipment"
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">{equipment.name}</h1>
            <p className="text-gray-600">{equipmentTypeLabels[equipment.equipment_type]}</p>
          </div>
          <Badge style={{ backgroundColor: statusColor }} className="text-white">
            {equipmentStatusLabels[equipment.status]}
          </Badge>
          <Badge style={{ backgroundColor: conditionColor }} className="text-white">
            {conditionStatusLabels[equipment.condition_status]}
          </Badge>
        </div>

        <div className="flex gap-2">
          {canEdit && (
            <Button onClick={() => setEditDialogOpen(true)} variant="outline" size="sm">
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
          {canDelete && (
            <Button onClick={() => setDeleteConfirmOpen(true)} variant="destructive" size="sm">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
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

          {equipment.needs_parts_ordered && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <div className="flex items-center gap-2 font-medium text-yellow-900">
                <AlertCircle className="w-4 h-4" />
                Parts Need Ordering
              </div>
              {equipment.parts_needed && (
                <p className="text-sm text-yellow-800 mt-1">{equipment.parts_needed}</p>
              )}
            </div>
          )}

          {equipment.estimated_repair_cost && (
            <div>
              <Label className="text-sm font-medium">Estimated Repair Cost</Label>
              <p className="text-lg font-semibold mt-1">
                ${equipment.estimated_repair_cost.toFixed(2)}
              </p>
            </div>
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
          {equipment.purchase_price && (
            <div>
              <Label className="text-sm font-medium">Purchase Price</Label>
              <p className="text-sm text-gray-600">${equipment.purchase_price.toFixed(2)}</p>
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
          <div className="grid grid-cols-3 gap-2">
            <Button onClick={() => openInspectionSheet("pre")} variant="outline" size="sm">
              Run Pre-Inspection
            </Button>
            <Button onClick={() => openInspectionSheet("post")} variant="outline" size="sm">
              Run Post-Inspection
            </Button>
            <Button onClick={() => openInspectionSheet("cleaning")} variant="outline" size="sm">
              Run Cleaning Check
            </Button>
          </div>

          {latestInspection && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Latest Inspection</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
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

      {/* Maintenance Logs Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Maintenance Logs</span>
            {canEdit && (
              <Button onClick={() => setLogSheetOpen(true)} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Log
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {equipment.logs && equipment.logs.length > 0 ? (
            <div className="space-y-3">
              {equipment.logs.map((log) => (
                <div key={log.id} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge style={{ backgroundColor: logTypeColors[log.log_type] }} className="text-white">
                      {logTypeLabels[log.log_type]}
                    </Badge>
                    <span className="text-sm text-gray-500">
                      {new Date(log.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{log.description}</p>
                  {log.cost && (
                    <p className="text-sm text-gray-600 mt-2">
                      Cost: <span className="font-medium">${log.cost.toFixed(2)}</span>
                    </p>
                  )}
                  {log.parts_used && log.parts_used.length > 0 && (
                    <div className="text-sm text-gray-600 mt-2">
                      <p className="font-medium">Parts Used:</p>
                      <ul className="list-disc list-inside">
                        {log.parts_used.map((part, idx) => (
                          <li key={idx}>
                            {part.name} (qty: {part.quantity})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No maintenance logs yet</p>
          )}
        </CardContent>
      </Card>

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
            <div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="needs_parts"
                  checked={editForm.needs_parts_ordered}
                  onCheckedChange={(checked) =>
                    setEditForm({ ...editForm, needs_parts_ordered: checked as boolean })
                  }
                />
                <Label htmlFor="needs_parts" className="font-medium">Parts Need Ordering</Label>
              </div>
            </div>

            {editForm.needs_parts_ordered && (
              <div>
                <Label htmlFor="parts_needed">Parts Needed</Label>
                <Textarea
                  id="parts_needed"
                  value={editForm.parts_needed}
                  onChange={(e) => setEditForm({ ...editForm, parts_needed: e.target.value })}
                />
              </div>
            )}

            <div>
              <Label htmlFor="estimated_repair_cost">Estimated Repair Cost</Label>
              <Input
                id="estimated_repair_cost"
                type="number"
                step="0.01"
                value={editForm.estimated_repair_cost}
                onChange={(e) => setEditForm({ ...editForm, estimated_repair_cost: e.target.value })}
              />
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit}>Save Changes</Button>
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
              <Select value={fuelLevel} onValueChange={(value: any) => setFuelLevel(value)}>
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
              <Select value={oilLevel} onValueChange={(value: any) => setOilLevel(value)}>
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
              <Select value={inspectionOverall} onValueChange={(value: any) => setInspectionOverall(value)}>
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

      {/* Log Sheet */}
      <Sheet open={logSheetOpen} onOpenChange={setLogSheetOpen}>
        <SheetContent side="right" className="w-full sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Maintenance Log</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="log-type">Log Type</Label>
              <Select
                value={logForm.log_type}
                onValueChange={(value: any) => setLogForm({ ...logForm, log_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(logTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="log-description">Description</Label>
              <Textarea
                id="log-description"
                value={logForm.description}
                onChange={(e) => setLogForm({ ...logForm, description: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="log-hours">Hours at Service</Label>
              <Input
                id="log-hours"
                type="number"
                step="0.1"
                value={logForm.hours_at_service || 0}
                onChange={(e) => setLogForm({ ...logForm, hours_at_service: parseFloat(e.target.value) })}
              />
            </div>

            <div>
              <Label htmlFor="log-cost">Cost</Label>
              <Input
                id="log-cost"
                type="number"
                step="0.01"
                value={logForm.cost || ""}
                onChange={(e) => setLogForm({ ...logForm, cost: e.target.value ? parseFloat(e.target.value) : undefined })}
              />
            </div>

            <div>
              <Label htmlFor="log-vendor">Vendor</Label>
              <Input
                id="log-vendor"
                value={logForm.vendor || ""}
                onChange={(e) => setLogForm({ ...logForm, vendor: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="log-downtime">Downtime Hours</Label>
              <Input
                id="log-downtime"
                type="number"
                step="0.1"
                value={logForm.downtime_hours || ""}
                onChange={(e) =>
                  setLogForm({ ...logForm, downtime_hours: e.target.value ? parseFloat(e.target.value) : undefined })
                }
              />
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setLogSheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogSubmit} disabled={!logForm.description.trim()}>
              Add Log
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
