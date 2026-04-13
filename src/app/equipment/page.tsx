"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench,
  Search,
  Plus,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Filter,
  ChevronRight,
  Loader2,
  Camera,
  FileText,
  Download,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  useEquipment,
  equipmentTypeLabels,
  equipmentStatusLabels,
  equipmentStatusColors,
  conditionStatusLabels,
  conditionStatusColors,
  type EquipmentFilters,
} from "@/lib/hooks/useEquipment";
import { useAuth } from "@/lib/hooks/useAuth";
import type { Equipment, EquipmentType, EquipmentCondition } from "@/types/database";

// Equipment type icons (simplified)
function getEquipmentIcon(_type: EquipmentType) {
  // Using Wrench for all - in production, you'd have specific icons
  return <Wrench className="w-8 h-8 text-muted-foreground" />;
}

// Stats card component
function StatCard({
  label,
  count,
  color,
  icon: Icon,
  onClick,
  active,
}: {
  label: string;
  count: number;
  color: string;
  icon: typeof CheckCircle;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-card rounded-lg border p-4 text-left transition-all hover:shadow-md ${
        active ? "ring-2 ring-primary border-primary" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5" style={{ color }} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-3xl font-bold" style={{ color }}>
        {count}
      </p>
    </button>
  );
}

// Calculate condition stats from equipment array
function calculateConditionStats(equipment: Equipment[]) {
  return {
    good: equipment.filter((eq) => eq.condition_status === "good").length,
    needs_repair: equipment.filter((eq) => eq.condition_status === "needs_repair").length,
    beyond_repair: equipment.filter((eq) => eq.condition_status === "beyond_repair").length,
    parts_ordered: equipment.filter((eq) => eq.needs_parts_ordered === true).length,
  };
}

// Equipment card component
function EquipmentThumbnail({ photoUrl, name }: { photoUrl: string | null; name: string }) {
  const [broken, setBroken] = useState(false);

  if (!photoUrl || broken) {
    return (
      <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
        <Camera className="w-8 h-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt={name}
        className="w-full h-full object-cover"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

function EquipmentCard({
  item,
  onClick,
}: {
  item: Equipment;
  onClick: () => void;
}) {
  const statusColor = equipmentStatusColors[item.status];
  const conditionColor = conditionStatusColors[item.condition_status];

  return (
    <Card
      className="cursor-pointer hover:shadow-md active:bg-muted/30 active:scale-[0.99] transition-all rounded-2xl"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Photo */}
          <EquipmentThumbnail photoUrl={item.photos?.[0] || item.photo_url} name={item.name} />

          {/* Details */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base truncate">{item.name}</h3>
            <p className="text-sm text-muted-foreground mb-2">
              {equipmentTypeLabels[item.equipment_type]}
            </p>

            {/* Badges row */}
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant="outline"
                style={{
                  backgroundColor: `${conditionColor}15`,
                  borderColor: conditionColor,
                  color: conditionColor,
                }}
                className="text-xs px-2 py-0.5"
              >
                {conditionStatusLabels[item.condition_status]}
              </Badge>
              <Badge
                variant="outline"
                style={{
                  backgroundColor: `${statusColor}15`,
                  borderColor: statusColor,
                  color: statusColor,
                }}
                className="text-xs px-2 py-0.5"
              >
                {equipmentStatusLabels[item.status]}
              </Badge>
              {item.needs_parts_ordered && (
                <Badge variant="secondary" className="text-xs px-2 py-0.5">
                  Parts Needed
                </Badge>
              )}
            </div>

            {/* Hours */}
            {item.current_hours !== null && (
              <p className="text-sm text-muted-foreground mt-1.5">
                {item.current_hours.toLocaleString()} hours
              </p>
            )}
          </div>

          <ChevronRight className="w-6 h-6 text-muted-foreground/40 self-center flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function EquipmentPage() {
  const router = useRouter();
  const { user, profile, canManageEquipment, loading: authLoading } = useAuth();
  const { equipment, loading, error, fetchEquipment } = useEquipment();

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EquipmentType | "all">("all");
  const [conditionFilter, setConditionFilter] = useState<EquipmentCondition | "parts_ordered" | "all">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  // Check if user can add equipment — uses profile.role from profiles table
  const equipmentRoles = ["super", "asst_super", "foreman", "mechanic", "director"];
  const canAddEquipment = canManageEquipment || (!!profile?.role && equipmentRoles.includes(profile.role));

  // Apply filters
  const applyFilters = useCallback(() => {
    const filters: EquipmentFilters = {};

    if (typeFilter !== "all") {
      filters.type = typeFilter;
    }

    if (searchQuery.trim()) {
      filters.search = searchQuery.trim();
    }

    fetchEquipment(filters);
  }, [typeFilter, searchQuery, fetchEquipment]);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      applyFilters();
    }, 300);

    return () => clearTimeout(timeout);
  }, [applyFilters]);

  // Calculate condition stats from current equipment array
  const conditionStats = calculateConditionStats(equipment);

  // Handle stat card click — toggle filter on/off
  const handleConditionClick = (condition: EquipmentCondition | "parts_ordered" | "all") => {
    setConditionFilter((prev) => (prev === condition ? "all" : condition));
  };

  // Navigate to equipment detail
  const handleEquipmentClick = (id: string) => {
    router.push(`/equipment/${id}`);
  };

  // Navigate to add equipment
  const handleAddClick = () => {
    router.push("/equipment/new");
  };

  // Download equipment report
  const handleDownloadReport = async () => {
    setGeneratingReport(true);
    try {
      const params = new URLSearchParams();
      if (conditionFilter !== "all") params.set("condition", conditionFilter);
      const res = await fetch(`/api/reports/equipment-report${params.toString() ? `?${params}` : ""}`);
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vmgc-equipment-report-${new Date().toISOString().slice(0, 10)}.pdf`;
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

  // Filter equipment by condition
  const filteredEquipment = equipment.filter((item) => {
    if (conditionFilter === "all") return true;
    if (conditionFilter === "parts_ordered") return item.needs_parts_ordered === true;
    return item.condition_status === conditionFilter;
  });

  return (
    <div className="p-4 md:p-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Equipment"
          description="Manage fleet and monitor conditions"
          icon={Wrench}
        />
        <div className="flex gap-2">
          <Button
            onClick={handleDownloadReport}
            disabled={generatingReport || loading}
            variant="outline"
            size="sm"
            className="border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332] hover:text-white"
          >
            {generatingReport ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            {generatingReport ? "Generating..." : "Report"}
          </Button>
          {canAddEquipment && (
            <Button onClick={handleAddClick} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Condition Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Good"
          count={conditionStats.good}
          color={conditionStatusColors.good}
          icon={CheckCircle}
          onClick={() => handleConditionClick("good")}
          active={conditionFilter === "good"}
        />
        <StatCard
          label="Needs Repair"
          count={conditionStats.needs_repair}
          color={conditionStatusColors.needs_repair}
          icon={AlertTriangle}
          onClick={() => handleConditionClick("needs_repair")}
          active={conditionFilter === "needs_repair"}
        />
        <StatCard
          label="Beyond Repair"
          count={conditionStats.beyond_repair}
          color={conditionStatusColors.beyond_repair}
          icon={XCircle}
          onClick={() => handleConditionClick("beyond_repair")}
          active={conditionFilter === "beyond_repair"}
        />
        <StatCard
          label="Parts Ordered"
          count={conditionStats.parts_ordered}
          color="#3b82f6"
          icon={Clock}
          onClick={() => handleConditionClick("parts_ordered")}
          active={conditionFilter === "parts_ordered"}
        />
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search equipment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? "bg-muted" : ""}
          >
            <Filter className="w-4 h-4" />
          </Button>

          <Select
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(value as EquipmentType | "all")}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(equipmentTypeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Condition Filter Chips (when showFilters is true) */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge
            variant={conditionFilter === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setConditionFilter("all")}
          >
            All Conditions
          </Badge>
          {Object.entries(conditionStatusLabels).map(([value, label]) => {
            if (value === "unknown") return null;
            const condition = value as EquipmentCondition;
            return (
              <Badge
                key={value}
                variant={conditionFilter === condition ? "default" : "outline"}
                className="cursor-pointer"
                style={
                  conditionFilter === condition
                    ? { backgroundColor: conditionStatusColors[condition] }
                    : {}
                }
                onClick={() => setConditionFilter(condition)}
              >
                {label}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Equipment List */}
      {loading && equipment.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredEquipment.length === 0 && equipment.length === 0 ? (
        <div className="text-center py-12">
          <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No equipment yet. Upload photos of your equipment to get started.</p>
          {canAddEquipment && (
            <Button onClick={handleAddClick} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add Equipment
            </Button>
          )}
        </div>
      ) : filteredEquipment.length === 0 ? (
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No equipment matches this condition</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEquipment.map((item) => (
            <EquipmentCard
              key={item.id}
              item={item}
              onClick={() => handleEquipmentClick(item.id)}
            />
          ))}
        </div>
      )}

      {/* FAB for mobile */}
      {canAddEquipment && (
        <button
          onClick={handleAddClick}
          className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center md:hidden hover:bg-primary/90 active:scale-95 transition-all"
          aria-label="Add equipment"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
