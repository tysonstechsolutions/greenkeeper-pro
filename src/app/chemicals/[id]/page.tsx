"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit2,
  Beaker,
  AlertTriangle,
  Package,
  DollarSign,
  Clock,
  FileText,
  ExternalLink,
  Plus,
  Minus,
  History,
  Loader2,
  Save,
  Trash2,
  MapPin,
  Droplets,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/ui/back-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useChemicals,
  productTypeLabels,
  productTypeColors,
  signalWordLabels,
  signalWordColors,
  applicationMethodLabels,
  type ChemicalProductWithStats,
  type ChemicalApplicationWithProduct,
} from "@/lib/hooks/useChemicals";
import { useAuth } from "@/lib/hooks/useAuth";

export default function ChemicalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { canManageChemicals } = useAuth();
  const {
    getProduct,
    updateProduct,
    updateInventory,
    getProductApplicationHistory,
    error,
  } = useChemicals();

  const [product, setProduct] = useState<ChemicalProductWithStats | null>(null);
  const [applications, setApplications] = useState<ChemicalApplicationWithProduct[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  // Inventory adjustment state
  const [inventoryAdjustment, setInventoryAdjustment] = useState<number>(0);
  const [inventoryNote, setInventoryNote] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"add" | "subtract">("add");
  const [inventorySheetOpen, setInventorySheetOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  // Discontinue dialog state
  const [discontinueOpen, setDiscontinueOpen] = useState(false);
  const [discontinuing, setDiscontinuing] = useState(false);

  // Permissions — use profile-based role checks
  const canEdit = canManageChemicals;

  // Load product data
  useEffect(() => {
    const loadProduct = async () => {
      if (!params.id) return;

      setPageLoading(true);
      try {
        const productData = await getProduct(params.id as string);
        setProduct(productData);

        if (productData) {
          const history = await getProductApplicationHistory(params.id as string, 10);
          setApplications(history);
        }
      } catch (err) {
        console.error("Error loading product:", err);
      } finally {
        setPageLoading(false);
      }
    };

    loadProduct();
  }, [params.id, getProduct, getProductApplicationHistory]);

  // Handle inventory adjustment
  const handleInventoryAdjustment = async () => {
    if (!product || inventoryAdjustment <= 0) return;

    setAdjusting(true);
    try {
      const success = await updateInventory(
        product.id,
        inventoryAdjustment,
        adjustmentType
      );

      if (success) {
        // Refresh product data
        const updatedProduct = await getProduct(product.id);
        setProduct(updatedProduct);
        setInventorySheetOpen(false);
        setInventoryAdjustment(0);
        setInventoryNote("");
      }
    } finally {
      setAdjusting(false);
    }
  };

  // Handle discontinue
  const handleDiscontinue = async () => {
    if (!product) return;

    setDiscontinuing(true);
    try {
      await updateProduct(product.id, { is_active: false });
      router.push("/chemicals");
    } finally {
      setDiscontinuing(false);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Loading state
  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not found state
  if (!product) {
    return (
      <div className="p-4 md:p-6 text-center py-12">
        <Beaker className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Product Not Found</h1>
        <p className="text-muted-foreground">
          This product may have been removed or doesn&apos;t exist.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  const typeColor = product.product_type
    ? productTypeColors[product.product_type]
    : "#6b7280";
  const signalColor = product.signal_word
    ? signalWordColors[product.signal_word]
    : undefined;

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <DetailPageHeader
        backHref="/chemicals"
        backLabel="Chemicals"
        title={
          <div className="flex items-center gap-2">
            <span>{product.product_name}</span>
            {product.is_low_stock && (
              <Badge variant="destructive">Low Stock</Badge>
            )}
          </div>
        }
        subtitle={`${product.manufacturer || "No manufacturer"} • ${product.product_type
          ? productTypeLabels[product.product_type]
          : "Uncategorized"}`}
        className="mb-6"
        actions={
          canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/chemicals`)}
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )
        }
      />

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Package className="w-4 h-4" />
              <span className="text-xs">Current Stock</span>
            </div>
            <p className="text-2xl font-bold">
              {product.current_inventory ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">
              {product.unit_of_measure || "units"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs">Cost Per Unit</span>
            </div>
            <p className="text-2xl font-bold">
              ${(product.cost_per_unit ?? 0).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">per {product.unit_of_measure || "unit"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs">REI</span>
            </div>
            <p className="text-2xl font-bold">
              {product.rei_hours ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <History className="w-4 h-4" />
              <span className="text-xs">Applications</span>
            </div>
            <p className="text-2xl font-bold">{product.total_applications ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {product.last_application_date
                ? `Last: ${formatDate(product.last_application_date)}`
                : "Never applied"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Actions */}
      {canEdit && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Inventory Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Sheet open={inventorySheetOpen} onOpenChange={setInventorySheetOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAdjustmentType("add")}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Stock
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>
                      {adjustmentType === "add" ? "Add Stock" : "Remove Stock"}
                    </SheetTitle>
                    <SheetDescription>
                      Adjust inventory for {product.product_name}
                    </SheetDescription>
                  </SheetHeader>

                  <div className="space-y-4 mt-6">
                    <div className="space-y-2">
                      <Label>Current Stock</Label>
                      <p className="text-2xl font-bold">
                        {product.current_inventory ?? 0} {product.unit_of_measure || "units"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="adjustment">
                        Quantity to {adjustmentType === "add" ? "Add" : "Remove"}
                      </Label>
                      <Input
                        id="adjustment"
                        type="number"
                        min={0}
                        step="0.01"
                        value={inventoryAdjustment || ""}
                        onChange={(e) =>
                          setInventoryAdjustment(parseFloat(e.target.value) || 0)
                        }
                        placeholder="0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>New Stock Level</Label>
                      <p className="text-xl font-semibold text-primary">
                        {adjustmentType === "add"
                          ? (product.current_inventory ?? 0) + inventoryAdjustment
                          : Math.max(0, (product.current_inventory ?? 0) - inventoryAdjustment)}{" "}
                        {product.unit_of_measure || "units"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="note">Note (optional)</Label>
                      <Input
                        id="note"
                        value={inventoryNote}
                        onChange={(e) => setInventoryNote(e.target.value)}
                        placeholder="e.g., Restocked from vendor"
                      />
                    </div>

                    <Button
                      className="w-full"
                      onClick={handleInventoryAdjustment}
                      disabled={adjusting || inventoryAdjustment <= 0}
                    >
                      {adjusting ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      {adjustmentType === "add" ? "Add Stock" : "Remove Stock"}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdjustmentType("subtract");
                  setInventorySheetOpen(true);
                }}
              >
                <Minus className="w-4 h-4 mr-2" />
                Remove Stock
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/chemicals/apply?product=${product.id}`)}
              >
                <Droplets className="w-4 h-4 mr-2" />
                Log Application
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Product Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Manufacturer</p>
              <p className="font-medium">{product.manufacturer || "Not specified"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">EPA Registration</p>
              <p className="font-medium">{product.epa_registration || "N/A"}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Active Ingredient</p>
              <p className="font-medium">{product.active_ingredient || "Not specified"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Product Type</p>
              <Badge
                variant="outline"
                style={{
                  backgroundColor: `${typeColor}15`,
                  borderColor: typeColor,
                  color: typeColor,
                }}
              >
                {product.product_type
                  ? productTypeLabels[product.product_type]
                  : "Uncategorized"}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Signal Word</p>
              {product.signal_word ? (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle
                    className="w-4 h-4"
                    style={{ color: signalColor }}
                  />
                  <span
                    className="font-medium"
                    style={{ color: signalColor }}
                  >
                    {signalWordLabels[product.signal_word]}
                  </span>
                </div>
              ) : (
                <p className="font-medium">None</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">REI (Re-entry Interval)</p>
              <p className="font-medium">
                {product.rei_hours ? `${product.rei_hours} hours` : "Not specified"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Reorder Threshold</p>
              <p className="font-medium">
                {product.reorder_threshold ?? "Not set"} {product.unit_of_measure || "units"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inventory Value</p>
              <p className="font-medium">
                $
                {(
                  (product.current_inventory ?? 0) * (product.cost_per_unit ?? 0)
                ).toFixed(2)}
              </p>
            </div>
          </div>

          {product.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm mt-1">{product.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SDS Link */}
      {product.sds_storage_path && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <a
              href={product.sds_storage_path}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-primary hover:underline"
            >
              <FileText className="w-5 h-5" />
              <span className="font-medium">View Safety Data Sheet (SDS)</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </CardContent>
        </Card>
      )}

      {/* Application History */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Application History</CardTitle>
          {applications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/chemicals/${product.id}/history`)}
            >
              View All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <div className="text-center py-6">
              <History className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No applications recorded
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.slice(0, 5).map((app) => (
                <div
                  key={app.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {formatDate(app.application_date)}
                        {app.application_time && ` at ${app.application_time}`}
                      </p>
                      {app.total_amount_used && (
                        <Badge variant="outline">
                          {app.total_amount_used} {product.unit_of_measure || "units"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {app.method && (
                        <span>{applicationMethodLabels[app.method]}</span>
                      )}
                      {app.area_treated_sqft && (
                        <span>• {app.area_treated_sqft.toLocaleString()} sq ft</span>
                      )}
                      {app.target_pest && <span>• {app.target_pest}</span>}
                    </div>
                    {app.zone_ids && app.zone_ids.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span>
                          {app.zone_ids.length} zone{app.zone_ids.length !== 1 && "s"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discontinue Product */}
      {canEdit && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Discontinue Product
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Discontinuing this product will hide it from the inventory list but
              preserve all application history. This action can be reversed.
            </p>
            <Dialog open={discontinueOpen} onOpenChange={setDiscontinueOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Discontinue Product
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Discontinue Product?</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to discontinue {product.product_name}? It will
                    be hidden from the inventory but application history will be preserved.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setDiscontinueOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDiscontinue}
                    disabled={discontinuing}
                  >
                    {discontinuing ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Discontinue
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
