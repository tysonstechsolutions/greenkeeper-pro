"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  Search,
  Plus,
  AlertTriangle,
  Filter,
  ChevronRight,
  Loader2,
  Package,
  DollarSign,
  Clock,
  Beaker,
  Droplets,
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
  useChemicals,
  productTypeLabels,
  productTypeColors,
  signalWordLabels,
  signalWordColors,
  type ProductFilters,
  type InventoryStats,
  type ActiveREI,
} from "@/lib/hooks/useChemicals";
import { useAuth } from "@/lib/hooks/useAuth";
import type { ChemicalProductType, SignalWord } from "@/types/database";

// Stats card component
function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  color,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: typeof Package;
  color: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      onClick={onClick}
      className={`bg-card rounded-lg border p-4 text-left transition-all ${
        onClick ? "hover:shadow-md cursor-pointer" : ""
      } ${active ? "ring-2 ring-primary border-primary" : "border-border"}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5" style={{ color }} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
    </Component>
  );
}

// Product card component
function ProductCard({
  product,
  onClick,
}: {
  product: {
    id: string;
    product_name: string;
    manufacturer: string | null;
    product_type: ChemicalProductType | null;
    current_inventory: number | null;
    unit_of_measure: string | null;
    reorder_threshold: number | null;
    signal_word: SignalWord | null;
    cost_per_unit: number | null;
    is_low_stock?: boolean;
  };
  onClick: () => void;
}) {
  const typeColor = product.product_type
    ? productTypeColors[product.product_type]
    : "#6b7280";
  const signalColor = product.signal_word
    ? signalWordColors[product.signal_word]
    : undefined;

  const stockPercent = product.reorder_threshold
    ? Math.min(100, ((product.current_inventory ?? 0) / product.reorder_threshold) * 100)
    : 100;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Icon */}
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${typeColor}20` }}
          >
            <Beaker className="w-6 h-6" style={{ color: typeColor }} />
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm truncate">{product.product_name}</h3>
                  {product.is_low_stock && (
                    <Badge variant="destructive" className="text-xs">
                      Low Stock
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {product.manufacturer || "No manufacturer"}
                </p>
              </div>
              {product.product_type && (
                <Badge
                  variant="outline"
                  style={{
                    backgroundColor: `${typeColor}15`,
                    borderColor: typeColor,
                    color: typeColor,
                  }}
                >
                  {productTypeLabels[product.product_type]}
                </Badge>
              )}
            </div>

            {/* Stock info */}
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">
                  {product.current_inventory ?? 0} {product.unit_of_measure || "units"}
                </span>
                {product.reorder_threshold && (
                  <span className="text-muted-foreground">
                    Reorder at {product.reorder_threshold}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {product.reorder_threshold && (
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      stockPercent <= 100
                        ? "bg-red-500"
                        : stockPercent <= 150
                        ? "bg-yellow-500"
                        : "bg-green-500"
                    }`}
                    style={{
                      width: `${Math.min(100, (stockPercent / 200) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Signal word */}
            {product.signal_word && product.signal_word !== "none" && (
              <div className="mt-2 flex items-center gap-1.5">
                <AlertTriangle
                  className="w-3.5 h-3.5"
                  style={{ color: signalColor }}
                />
                <span className="text-xs font-medium" style={{ color: signalColor }}>
                  {signalWordLabels[product.signal_word]}
                </span>
              </div>
            )}
          </div>

          <ChevronRight className="w-5 h-5 text-muted-foreground self-center flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

// REI Alert Banner
function REIAlertBanner({ activeREIs }: { activeREIs: ActiveREI[] }) {
  if (activeREIs.length === 0) return null;

  return (
    <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800 rounded-lg">
      <div className="flex items-start gap-3">
        <Clock className="w-5 h-5 text-orange-500 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-orange-700 dark:text-orange-400">
            Active Restricted Entry Intervals
          </h3>
          <div className="mt-2 space-y-2">
            {activeREIs.slice(0, 3).map((rei) => (
              <div key={rei.application_id} className="text-sm">
                <span className="font-medium">{rei.product_name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  - {rei.zone_names.slice(0, 2).join(", ")}
                  {rei.zone_names.length > 2 && ` +${rei.zone_names.length - 2} more`}
                </span>
                <span className="text-orange-600 dark:text-orange-400 ml-2">
                  ({rei.hours_remaining.toFixed(1)} hrs remaining)
                </span>
              </div>
            ))}
            {activeREIs.length > 3 && (
              <p className="text-xs text-muted-foreground">
                +{activeREIs.length - 3} more active REIs
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChemicalsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    products,
    loading,
    error,
    fetchProducts,
    fetchInventoryStats,
    getLowStockProducts,
    getActiveREIs,
  } = useChemicals();

  const [stats, setStats] = useState<InventoryStats>({
    total_products: 0,
    low_stock_count: 0,
    total_inventory_value: 0,
    by_type: [],
  });
  const [activeREIs, setActiveREIs] = useState<ActiveREI[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ChemicalProductType | "all">("all");
  const [showLowStock, setShowLowStock] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Check permissions
  const canAddProduct =
    user?.role === "super" || user?.role === "asst_super" || user?.role === "mechanic";
  const canApply =
    user?.role === "super" ||
    user?.role === "asst_super" ||
    user?.role === "foreman" ||
    user?.role === "mechanic";

  // Load initial data
  useEffect(() => {
    fetchInventoryStats().then(setStats);
    getActiveREIs().then(setActiveREIs);
  }, [fetchInventoryStats, getActiveREIs]);

  // Apply filters with debounce
  const applyFilters = useCallback(() => {
    const filters: ProductFilters = {
      activeOnly: true,
    };

    if (typeFilter !== "all") {
      filters.type = typeFilter;
    }

    if (searchQuery.trim()) {
      filters.search = searchQuery.trim();
    }

    if (showLowStock) {
      filters.lowStockOnly = true;
    }

    fetchProducts(filters);
  }, [typeFilter, searchQuery, showLowStock, fetchProducts]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      applyFilters();
    }, 300);

    return () => clearTimeout(timeout);
  }, [applyFilters]);

  // Navigation handlers
  const handleProductClick = (id: string) => {
    router.push(`/chemicals/${id}`);
  };

  const handleAddClick = () => {
    router.push("/chemicals/new");
  };

  const handleApplyClick = () => {
    router.push("/chemicals/apply");
  };

  // Toggle low stock filter
  const handleLowStockClick = () => {
    setShowLowStock((prev) => !prev);
  };

  return (
    <div className="p-4 md:p-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Chemicals & Materials"
          description="Product inventory and applications"
          icon={FlaskConical}
        />
        <div className="flex gap-2">
          {canApply && (
            <Button variant="outline" size="sm" onClick={handleApplyClick}>
              <Droplets className="w-4 h-4 mr-2" />
              Log Application
            </Button>
          )}
          {canAddProduct && (
            <Button size="sm" onClick={handleAddClick}>
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

      {/* REI Alert Banner */}
      <REIAlertBanner activeREIs={activeREIs} />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total Products"
          value={stats.total_products}
          icon={Package}
          color="#3b82f6"
        />
        <StatCard
          label="Low Stock"
          value={stats.low_stock_count}
          subtext={stats.low_stock_count > 0 ? "Needs attention" : "All stocked"}
          icon={AlertTriangle}
          color={stats.low_stock_count > 0 ? "#dc2626" : "#22c55e"}
          onClick={handleLowStockClick}
          active={showLowStock}
        />
        <StatCard
          label="Inventory Value"
          value={`$${stats.total_inventory_value.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}`}
          icon={DollarSign}
          color="#22c55e"
        />
        <StatCard
          label="Active REIs"
          value={activeREIs.length}
          subtext={activeREIs.length > 0 ? "Zones restricted" : "No restrictions"}
          icon={Clock}
          color={activeREIs.length > 0 ? "#f97316" : "#22c55e"}
        />
      </div>

      {/* Low Stock Alert */}
      {stats.low_stock_count > 0 && !showLowStock && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Low Stock Alert</p>
              <p className="text-sm text-muted-foreground">
                {stats.low_stock_count} product{stats.low_stock_count !== 1 && "s"} below
                reorder threshold
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLowStockClick}
            className="text-destructive border-destructive/50"
          >
            View
          </Button>
        </div>
      )}

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
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
            onValueChange={(value) => setTypeFilter(value as ChemicalProductType | "all")}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(productTypeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Type Filter Chips (when showFilters is true) */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge
            variant={typeFilter === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setTypeFilter("all")}
          >
            All
          </Badge>
          {Object.entries(productTypeLabels).map(([value, label]) => {
            const type = value as ChemicalProductType;
            const typeColor = productTypeColors[type];
            return (
              <Badge
                key={value}
                variant={typeFilter === type ? "default" : "outline"}
                className="cursor-pointer"
                style={
                  typeFilter === type
                    ? { backgroundColor: typeColor }
                    : { borderColor: typeColor, color: typeColor }
                }
                onClick={() => setTypeFilter(type)}
              >
                {label}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Product List */}
      {loading && products.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12">
          <FlaskConical className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {showLowStock ? "No low stock products" : "No products found"}
          </p>
          {canAddProduct && !showLowStock && (
            <Button onClick={handleAddClick} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onClick={() => handleProductClick(product.id)}
            />
          ))}
        </div>
      )}

      {/* FAB for mobile */}
      {canApply && (
        <button
          onClick={handleApplyClick}
          className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center md:hidden hover:bg-primary/90 transition-colors"
          aria-label="Log application"
        >
          <Droplets className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
