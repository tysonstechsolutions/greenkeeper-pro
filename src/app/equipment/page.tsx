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
  type EquipmentFilters,
} from "@/lib/hooks/useEquipment";
import { useAuth } from "@/lib/hooks/useAuth";
import type { Equipment, EquipmentType, EquipmentStatus } from "@/types/database";

// Equipment type icons (simplified)
function getEquipmentIcon(type: EquipmentType) {
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

// Equipment card component
function EquipmentCard({
  item,
  onClick,
}: {
  item: Equipment;
  onClick: () => void;
}) {
  const statusColor = equipmentStatusColors[item.status];
  const hoursRemaining =
    item.next_service_due_hours && item.current_hours
      ? item.next_service_due_hours - item.current_hours
      : null;
  const hoursPercent =
    item.service_interval_hours && item.current_hours && item.next_service_due_hours
      ? Math.min(
          100,
          ((item.current_hours - (item.next_service_due_hours - item.service_interval_hours)) /
            item.service_interval_hours) *
            100
        )
      : 0;
  const needsService = hoursRemaining !== null && hoursRemaining <= 0;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Photo or Icon */}
          <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
            {item.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.photo_url}
                alt={item.name}
                className="w-full h-full object-cover"
              />
            ) : (
              getEquipmentIcon(item.equipment_type)
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {item.make} {item.model} {item.year && `(${item.year})`}
                </p>
              </div>
              <Badge
                variant="outline"
                style={{
                  backgroundColor: `${statusColor}15`,
                  borderColor: statusColor,
                  color: statusColor,
                }}
              >
                {equipmentStatusLabels[item.status]}
              </Badge>
            </div>

            {/* Hours */}
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">
                  {item.current_hours?.toLocaleString() ?? 0} hrs
                </span>
                {hoursRemaining !== null && (
                  <span
                    className={
                      needsService ? "text-red-500 font-medium" : "text-muted-foreground"
                    }
                  >
                    {needsService
                      ? "Service due"
                      : `${hoursRemaining.toLocaleString()} hrs to service`}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {item.service_interval_hours && (
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
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
              )}
            </div>

            {/* Service alert */}
            {needsService && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-500">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Service overdue</span>
              </div>
            )}
          </div>

          <ChevronRight className="w-5 h-5 text-muted-foreground self-center flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function EquipmentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { equipment, loading, error, fetchEquipment, fetchEquipmentStats } = useEquipment();

  const [stats, setStats] = useState({
    operational: 0,
    needs_service: 0,
    in_repair: 0,
    out_of_service: 0,
    total: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EquipmentType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "all">("all");
  const [showFilters, setShowFilters] = useState(false);

  // Check if user can add equipment
  const canAddEquipment =
    user?.role === "super" || user?.role === "asst_super" || user?.role === "mechanic";

  // Load stats on mount
  useEffect(() => {
    fetchEquipmentStats().then(setStats);
  }, [fetchEquipmentStats]);

  // Apply filters
  const applyFilters = useCallback(() => {
    const filters: EquipmentFilters = {};

    if (typeFilter !== "all") {
      filters.type = typeFilter;
    }

    if (statusFilter !== "all") {
      filters.status = statusFilter;
    }

    if (searchQuery.trim()) {
      filters.search = searchQuery.trim();
    }

    fetchEquipment(filters);
  }, [typeFilter, statusFilter, searchQuery, fetchEquipment]);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      applyFilters();
    }, 300);

    return () => clearTimeout(timeout);
  }, [applyFilters]);

  // Handle stat card click
  const handleStatClick = (status: EquipmentStatus | "all") => {
    setStatusFilter((prev) => (prev === status ? "all" : status));
  };

  // Navigate to equipment detail
  const handleEquipmentClick = (id: string) => {
    router.push(`/equipment/${id}`);
  };

  // Navigate to add equipment
  const handleAddClick = () => {
    router.push("/equipment/new");
  };

  return (
    <div className="p-4 md:p-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Equipment"
          description="Manage fleet and maintenance"
          icon={Wrench}
        />
        {canAddEquipment && (
          <Button onClick={handleAddClick} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Operational"
          count={stats.operational}
          color={equipmentStatusColors.operational}
          icon={CheckCircle}
          onClick={() => handleStatClick("operational")}
          active={statusFilter === "operational"}
        />
        <StatCard
          label="Needs Service"
          count={stats.needs_service}
          color={equipmentStatusColors.needs_service}
          icon={Clock}
          onClick={() => handleStatClick("needs_service")}
          active={statusFilter === "needs_service"}
        />
        <StatCard
          label="In Repair"
          count={stats.in_repair}
          color={equipmentStatusColors.in_repair}
          icon={Wrench}
          onClick={() => handleStatClick("in_repair")}
          active={statusFilter === "in_repair"}
        />
        <StatCard
          label="Out of Service"
          count={stats.out_of_service}
          color={equipmentStatusColors.out_of_service}
          icon={XCircle}
          onClick={() => handleStatClick("out_of_service")}
          active={statusFilter === "out_of_service"}
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

      {/* Status Filter Chips (when showFilters is true) */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge
            variant={statusFilter === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setStatusFilter("all")}
          >
            All
          </Badge>
          {Object.entries(equipmentStatusLabels).map(([value, label]) => {
            if (value === "retired") return null;
            const status = value as EquipmentStatus;
            return (
              <Badge
                key={value}
                variant={statusFilter === status ? "default" : "outline"}
                className="cursor-pointer"
                style={
                  statusFilter === status
                    ? { backgroundColor: equipmentStatusColors[status] }
                    : {}
                }
                onClick={() => setStatusFilter(status)}
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
      ) : equipment.length === 0 ? (
        <div className="text-center py-12">
          <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No equipment found</p>
          {canAddEquipment && (
            <Button onClick={handleAddClick} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Add Equipment
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {equipment.map((item) => (
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
          className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center md:hidden hover:bg-primary/90 transition-colors"
          aria-label="Add equipment"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
