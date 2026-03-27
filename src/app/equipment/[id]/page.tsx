"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Wrench,
  ArrowLeft,
  Edit2,
  Clock,
  DollarSign,
  Calendar,
  MapPin,
  Hash,
  Tag,
  Package,
  AlertTriangle,
  CheckCircle,
  Plus,
  ChevronDown,
  Loader2,
  ClipboardCheck,
  X,
  Camera,
  AlertCircle,
  Trash2,
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
  logTypeLabels,
  logTypeColors,
  preOpChecklists,
  getChecklistCategory,
  type EquipmentWithLogs,
  type CreateLogData,
} from "@/lib/hooks/useEquipment";
import { useAuth } from "@/lib/hooks/useAuth";
import { useNotifications } from "@/lib/hooks/useNotifications";
import type { EquipmentLog, EquipmentStatus, EquipmentLogType, PartUsed } from "@/types/database";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { createNotification } = useNotifications();
  const {
    fetchEquipmentItem,
    updateEquipment,
    updateHours,
    retireEquipment,
    createLog,
    loading,
    error,
  } = useEquipment();

  const equipmentId = params.id as string;

  const [equipment, setEquipment] = useState<EquipmentWithLogs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  // Hours edit
  const [editingHours, setEditingHours] = useState(false);
  const [newHours, setNewHours] = useState("");

  // Log entry sheet
  const [logSheetOpen, setLogSheetOpen] = useState(false);
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
  const [newPartName, setNewPartName] = useState("");
  const [newPartQty, setNewPartQty] = useState(1);
  const [submittingLog, setSubmittingLog] = useState(false);

  // Pre-op checklist dialog
  const [preOpOpen, setPreOpOpen] = useState(false);
  const [checklistItems, setChecklistItems] = useState<
    { id: string; text: string; checked: boolean; flagged: boolean; notes: string }[]
  >([]);
  const [submittingPreOp, setSubmittingPreOp] = useState(false);

  // Retire confirmation
  const [retireDialogOpen, setRetireDialogOpen] = useState(false);

  // Check permissions
  const canEdit =
    user?.role === "super" || user?.role === "asst_super" || user?.role === "mechanic";
  const canRetire = user?.role === "super" || user?.role === "asst_super";

  // Load equipment data
  const loadEquipment = useCallback(async () => {
    const data = await fetchEquipmentItem(equipmentId);
    if (data) {
      setEquipment(data);
      setNewHours(String(data.current_hours ?? 0));
      setLogForm((prev) => ({
        ...prev,
        hours_at_service: data.current_hours ?? 0,
      }));
    }
    setIsLoading(false);
  }, [equipmentId, fetchEquipmentItem]);

  useEffect(() => {
    void loadEquipment(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadEquipment]);

  // Status change handler
  const handleStatusChange = async (newStatus: EquipmentStatus) => {
    if (!equipment) return;
    setStatusDropdownOpen(false);

    const updated = await updateEquipment(equipment.id, { status: newStatus });
    if (updated) {
      setEquipment({ ...equipment, ...updated });
    }
  };

  // Hours update handler
  const handleHoursUpdate = async () => {
    if (!equipment) return;

    const hours = parseFloat(newHours);
    if (isNaN(hours) || hours < 0) return;

    const updated = await updateHours(equipment.id, hours);
    if (updated) {
      setEquipment({ ...equipment, ...updated });
      setEditingHours(false);
    }
  };

  // Log submission handler
  const handleLogSubmit = async () => {
    if (!equipment || !logForm.description.trim()) return;

    setSubmittingLog(true);
    const newLog = await createLog(equipment.id, logForm);

    if (newLog) {
      // Refresh equipment data
      await loadEquipment();

      // Reset form
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
    setSubmittingLog(false);
  };

  // Add part to list
  const handleAddPart = () => {
    if (!newPartName.trim()) return;

    const part: PartUsed = {
      name: newPartName.trim(),
      quantity: newPartQty,
    };

    setLogForm((prev) => ({
      ...prev,
      parts_used: [...(prev.parts_used || []), part],
    }));

    setNewPartName("");
    setNewPartQty(1);
  };

  // Remove part from list
  const handleRemovePart = (index: number) => {
    setLogForm((prev) => ({
      ...prev,
      parts_used: prev.parts_used?.filter((_, i) => i !== index) || [],
    }));
  };

  // Initialize pre-op checklist
  const handleOpenPreOp = () => {
    if (!equipment) return;

    const category = getChecklistCategory(equipment.equipment_type);
    const items = preOpChecklists[category] || preOpChecklists.general;

    setChecklistItems(
      items.map((item) => ({
        ...item,
        checked: false,
        flagged: false,
        notes: "",
      }))
    );
    setPreOpOpen(true);
  };

  // Submit pre-op checklist
  const handleSubmitPreOp = async () => {
    if (!equipment || !user) return;

    setSubmittingPreOp(true);

    // Check for flagged issues
    const flaggedItems = checklistItems.filter((item) => item.flagged);
    const hasIssues = flaggedItems.length > 0;

    // Build description
    let description = "Daily Pre-Operation Inspection\n\n";
    checklistItems.forEach((item) => {
      const status = item.flagged ? "ISSUE" : item.checked ? "OK" : "Skipped";
      description += `- ${item.text}: ${status}`;
      if (item.notes) {
        description += ` (${item.notes})`;
      }
      description += "\n";
    });

    if (hasIssues) {
      description += `\nISSUES FOUND:\n`;
      flaggedItems.forEach((item) => {
        description += `- ${item.text}: ${item.notes || "Flagged for review"}\n`;
      });
    }

    // Create inspection log
    const logData: CreateLogData = {
      log_type: "inspection",
      description,
      hours_at_service: equipment.current_hours ?? undefined,
    };

    const newLog = await createLog(equipment.id, logData);

    if (newLog) {
      // If issues found, update status and notify
      if (hasIssues) {
        await updateEquipment(equipment.id, { status: "needs_service" });

        // Create notification for super/mechanic
        await createNotification(
          user.id, // Would notify super/mechanic in real app
          "equipment",
          `Pre-Op Issue: ${equipment.name}`,
          `${flaggedItems.length} issue(s) found during pre-operation check.`,
          "equipment",
          equipment.id
        );
      }

      await loadEquipment();
    }

    setPreOpOpen(false);
    setSubmittingPreOp(false);
  };

  // Retire equipment
  const handleRetire = async () => {
    if (!equipment) return;

    const result = await retireEquipment(equipment.id);
    if (result) {
      router.push("/equipment");
    }
    setRetireDialogOpen(false);
  };

  // Calculate cost stats
  const calculateCostStats = () => {
    if (!equipment?.logs) return { total: 0, thisYear: 0, byType: [] };

    const currentYear = new Date().getFullYear();
    let total = 0;
    let thisYear = 0;
    const byType: Record<string, number> = {};

    equipment.logs.forEach((log) => {
      const cost = log.cost || 0;
      total += cost;

      const logYear = new Date(log.created_at).getFullYear();
      if (logYear === currentYear) {
        thisYear += cost;
      }

      if (!byType[log.log_type]) {
        byType[log.log_type] = 0;
      }
      byType[log.log_type] += cost;
    });

    const byTypeArray = Object.entries(byType).map(([type, value]) => ({
      name: logTypeLabels[type as EquipmentLogType],
      value,
      color: logTypeColors[type as EquipmentLogType],
    }));

    return { total, thisYear, byType: byTypeArray };
  };

  // Calculate total downtime
  const calculateDowntime = () => {
    if (!equipment?.logs) return 0;
    return equipment.logs.reduce((sum, log) => sum + (log.downtime_hours || 0), 0);
  };

  if (isLoading || !equipment) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const statusColor = equipmentStatusColors[equipment.status];
  const hoursRemaining =
    equipment.next_service_due_hours && equipment.current_hours
      ? equipment.next_service_due_hours - equipment.current_hours
      : null;
  const hoursPercent =
    equipment.service_interval_hours &&
    equipment.current_hours !== null &&
    equipment.next_service_due_hours
      ? Math.min(
          100,
          ((equipment.current_hours -
            (equipment.next_service_due_hours - equipment.service_interval_hours)) /
            equipment.service_interval_hours) *
            100
        )
      : 0;
  const needsService = hoursRemaining !== null && hoursRemaining <= 0;

  const costStats = calculateCostStats();
  const totalDowntime = calculateDowntime();

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <DetailPageHeader
        backHref="/equipment"
        backLabel="Equipment"
        title={equipment.name}
        subtitle={`${equipment.make} ${equipment.model}${equipment.year ? ` (${equipment.year})` : ""}`}
        className="mb-6"
        actions={
          canEdit && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                style={{
                  borderColor: statusColor,
                  color: statusColor,
                }}
              >
                {equipmentStatusLabels[equipment.status]}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>

              {statusDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg z-10 min-w-[160px]">
                  {Object.entries(equipmentStatusLabels).map(([value, label]) => {
                    if (value === "retired") return null;
                    const status = value as EquipmentStatus;
                    return (
                      <button
                        key={value}
                        onClick={() => handleStatusChange(status)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: equipmentStatusColors[status] }}
                        />
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )
        }
      />

      {/* Photo and Quick Info */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Photo */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="aspect-video bg-muted flex items-center justify-center">
            {equipment.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={equipment.photo_url}
                alt={equipment.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Wrench className="w-16 h-16 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Details Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground text-xs">Type</p>
                <p className="font-medium">{equipmentTypeLabels[equipment.equipment_type]}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground text-xs">Location</p>
                <p className="font-medium">{equipment.location || "—"}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground text-xs">Serial #</p>
                <p className="font-medium font-mono text-xs">{equipment.serial_number || "—"}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground text-xs">Asset Tag</p>
                <p className="font-medium">{equipment.asset_tag || "—"}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground text-xs">Purchase Date</p>
                <p className="font-medium">
                  {equipment.purchase_date
                    ? new Date(equipment.purchase_date).toLocaleDateString()
                    : "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground text-xs">Purchase Price</p>
                <p className="font-medium">
                  {equipment.purchase_price
                    ? `$${equipment.purchase_price.toLocaleString()}`
                    : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hours & Service Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Hours & Service</CardTitle>
            <Button variant="outline" size="sm" onClick={handleOpenPreOp}>
              <ClipboardCheck className="w-4 h-4 mr-2" />
              Daily Pre-Op Check
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Current Hours */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Current Hours</span>
            </div>

            {editingHours ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={newHours}
                  onChange={(e) => setNewHours(e.target.value)}
                  className="w-24 h-8"
                />
                <Button size="sm" onClick={handleHoursUpdate}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingHours(false);
                    setNewHours(String(equipment.current_hours ?? 0));
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">
                  {equipment.current_hours?.toLocaleString() ?? 0}
                </span>
                <span className="text-muted-foreground">hrs</span>
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditingHours(true)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Service Progress */}
          {equipment.service_interval_hours && (
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">Next Service Due</span>
                <span
                  className={`text-sm font-medium ${
                    needsService ? "text-red-500" : ""
                  }`}
                >
                  {needsService
                    ? "OVERDUE"
                    : `${hoursRemaining?.toLocaleString()} hrs remaining`}
                </span>
              </div>

              <div className="h-3 bg-muted rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    hoursPercent >= 100
                      ? "bg-red-500"
                      : hoursPercent >= 80
                      ? "bg-yellow-500"
                      : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, hoursPercent))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Service interval: {equipment.service_interval_hours.toLocaleString()} hrs
                </span>
                {equipment.next_service_due_date && (
                  <span>
                    or by{" "}
                    {new Date(equipment.next_service_due_date).toLocaleDateString()}
                  </span>
                )}
              </div>

              {needsService && (
                <div className="mt-3 flex items-center gap-2 text-red-500">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Service overdue by{" "}
                    {Math.abs(hoursRemaining ?? 0).toLocaleString()} hours
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maintenance Log */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Maintenance Log</CardTitle>
            {canEdit && (
              <Button size="sm" onClick={() => setLogSheetOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Entry
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!equipment.logs || equipment.logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wrench className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No maintenance records yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {equipment.logs.map((log) => (
                <LogEntry key={log.id} log={log} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cost Summary */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cost Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                ${costStats.total.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Total Cost</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold">
                ${costStats.thisYear.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">This Year</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold">{totalDowntime}</p>
              <p className="text-xs text-muted-foreground">Downtime Hours</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold">{equipment.logs?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Log Entries</p>
            </div>
          </div>

          {/* Cost by type chart */}
          {costStats.byType.length > 0 && (
            <div className="flex items-center gap-6">
              <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costStats.byType}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={45}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {costStats.byType.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`$${(typeof value === "number" ? value : 0).toLocaleString()}`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {costStats.byType.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.name}</span>
                    </div>
                    <span className="font-medium">${item.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {equipment.notes && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{equipment.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Retire Button */}
      {canRetire && (
        <div className="text-center">
          <Button
            variant="outline"
            className="text-red-500 border-red-500 hover:bg-red-50"
            onClick={() => setRetireDialogOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Retire Equipment
          </Button>
        </div>
      )}

      {/* Add Log Sheet */}
      <Sheet open={logSheetOpen} onOpenChange={setLogSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Log Entry</SheetTitle>
            <SheetDescription>
              Record maintenance, repair, or other activity
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Log Type</Label>
              <Select
                value={logForm.log_type}
                onValueChange={(value) =>
                  setLogForm((prev) => ({ ...prev, log_type: value as EquipmentLogType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(logTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                value={logForm.description}
                onChange={(e) =>
                  setLogForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Describe the work performed..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hours at Service</Label>
                <Input
                  type="number"
                  value={logForm.hours_at_service ?? ""}
                  onChange={(e) =>
                    setLogForm((prev) => ({
                      ...prev,
                      hours_at_service: e.target.value ? parseFloat(e.target.value) : undefined,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={logForm.cost ?? ""}
                  onChange={(e) =>
                    setLogForm((prev) => ({
                      ...prev,
                      cost: e.target.value ? parseFloat(e.target.value) : undefined,
                    }))
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Vendor</Label>
              <Input
                value={logForm.vendor ?? ""}
                onChange={(e) =>
                  setLogForm((prev) => ({ ...prev, vendor: e.target.value }))
                }
                placeholder="Service provider or parts supplier"
              />
            </div>

            <div className="space-y-2">
              <Label>Downtime Hours</Label>
              <Input
                type="number"
                value={logForm.downtime_hours ?? ""}
                onChange={(e) =>
                  setLogForm((prev) => ({
                    ...prev,
                    downtime_hours: e.target.value ? parseFloat(e.target.value) : undefined,
                  }))
                }
                placeholder="Hours out of service"
              />
            </div>

            {/* Parts Used */}
            <div className="space-y-2">
              <Label>Parts Used</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Part name"
                  value={newPartName}
                  onChange={(e) => setNewPartName(e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={newPartQty}
                  onChange={(e) => setNewPartQty(parseInt(e.target.value) || 1)}
                  className="w-20"
                  min={1}
                />
                <Button type="button" size="icon" onClick={handleAddPart}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {logForm.parts_used && logForm.parts_used.length > 0 && (
                <div className="space-y-1 mt-2">
                  {logForm.parts_used.map((part, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-muted rounded px-3 py-1.5 text-sm"
                    >
                      <span>
                        {part.name} x{part.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemovePart(index)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <SheetFooter>
            <Button
              onClick={handleLogSubmit}
              disabled={!logForm.description.trim() || submittingLog}
              className="w-full"
            >
              {submittingLog ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Save Entry
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Pre-Op Checklist Dialog */}
      <Dialog open={preOpOpen} onOpenChange={setPreOpOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pre-Operation Checklist</DialogTitle>
            <DialogDescription>
              Complete all items before operating {equipment.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {checklistItems.map((item, index) => (
              <div
                key={item.id}
                className={`p-3 rounded-lg border ${
                  item.flagged
                    ? "border-red-300 bg-red-50 dark:bg-red-950"
                    : "border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={(checked) => {
                      const newItems = [...checklistItems];
                      newItems[index].checked = checked as boolean;
                      if (checked) {
                        newItems[index].flagged = false;
                      }
                      setChecklistItems(newItems);
                    }}
                  />
                  <div className="flex-1">
                    <label
                      htmlFor={item.id}
                      className={`text-sm cursor-pointer ${
                        item.checked ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {item.text}
                    </label>

                    {item.flagged && (
                      <Input
                        placeholder="Describe the issue..."
                        value={item.notes}
                        onChange={(e) => {
                          const newItems = [...checklistItems];
                          newItems[index].notes = e.target.value;
                          setChecklistItems(newItems);
                        }}
                        className="mt-2 h-8 text-sm"
                      />
                    )}
                  </div>

                  <Button
                    type="button"
                    variant={item.flagged ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => {
                      const newItems = [...checklistItems];
                      newItems[index].flagged = !newItems[index].flagged;
                      if (newItems[index].flagged) {
                        newItems[index].checked = false;
                      }
                      setChecklistItems(newItems);
                    }}
                  >
                    <AlertCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreOpOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitPreOp} disabled={submittingPreOp}>
              {submittingPreOp ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Complete Check
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retire Confirmation */}
      <Dialog open={retireDialogOpen} onOpenChange={setRetireDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retire Equipment</DialogTitle>
            <DialogDescription>
              Are you sure you want to retire {equipment.name}? This will remove it
              from the active equipment list but preserve all maintenance history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetireDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRetire}>
              Retire Equipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Log entry component
function LogEntry({ log }: { log: EquipmentLog }) {
  const typeColor = logTypeColors[log.log_type];
  const date = new Date(log.created_at);

  return (
    <div className="flex gap-3 p-3 bg-muted/50 rounded-lg">
      <div
        className="w-1 rounded-full flex-shrink-0"
        style={{ backgroundColor: typeColor }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <Badge
            variant="outline"
            style={{
              backgroundColor: `${typeColor}15`,
              borderColor: typeColor,
              color: typeColor,
            }}
          >
            {logTypeLabels[log.log_type]}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {date.toLocaleDateString()}
          </span>
        </div>

        <p className="text-sm whitespace-pre-wrap">{log.description}</p>

        <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
          {log.hours_at_service && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {log.hours_at_service.toLocaleString()} hrs
            </span>
          )}
          {log.cost && (
            <span className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              ${log.cost.toLocaleString()}
            </span>
          )}
          {log.downtime_hours && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {log.downtime_hours}h downtime
            </span>
          )}
          {log.vendor && <span>Vendor: {log.vendor}</span>}
        </div>

        {log.parts_used && log.parts_used.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {log.parts_used.map((part, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {part.name} x{part.quantity}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
