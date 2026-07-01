"use client";

import { useState, useCallback } from "react";
import {
  getCachedUserId,
  directSelectList,
  directSelectRow,
  directSelectCount,
  directInsertRow,
  directPatchRow,
  directPatchRowReturning,
} from "@/lib/supabase/rest";
import type {
  ChemicalProduct,
  ChemicalApplication,
  ChemicalProductType,
  SignalWord,
  ApplicationMethod,
} from "@/types/database";

// Product type labels
export const productTypeLabels: Record<ChemicalProductType, string> = {
  fertilizer: "Fertilizer",
  herbicide: "Herbicide",
  insecticide: "Insecticide",
  fungicide: "Fungicide",
  growth_regulator: "Growth Regulator",
  wetting_agent: "Wetting Agent",
  colorant: "Colorant",
  seed: "Seed",
  amendment: "Soil Amendment",
  other: "Other",
};

// Product type colors for UI
export const productTypeColors: Record<ChemicalProductType, string> = {
  fertilizer: "#22c55e", // green
  herbicide: "#eab308", // yellow
  insecticide: "#f97316", // orange
  fungicide: "#8b5cf6", // purple
  growth_regulator: "#06b6d4", // cyan
  wetting_agent: "#3b82f6", // blue
  colorant: "#ec4899", // pink
  seed: "#84cc16", // lime
  amendment: "#78716c", // stone
  other: "#6b7280", // gray
};

// Signal word labels and colors
export const signalWordLabels: Record<SignalWord, string> = {
  danger: "Danger",
  warning: "Warning",
  caution: "Caution",
  none: "None",
};

export const signalWordColors: Record<SignalWord, string> = {
  danger: "#dc2626", // red
  warning: "#f97316", // orange
  caution: "#eab308", // yellow
  none: "#22c55e", // green
};

// Application method labels
export const applicationMethodLabels: Record<ApplicationMethod, string> = {
  spray: "Spray",
  granular: "Granular",
  injection: "Injection",
  drench: "Drench",
  other: "Other",
};

// Types for the hook
export interface ProductFilters {
  type?: ChemicalProductType;
  signalWord?: SignalWord;
  search?: string;
  lowStockOnly?: boolean;
  activeOnly?: boolean;
}

export interface CreateProductData {
  product_name: string;
  manufacturer?: string;
  epa_registration?: string;
  active_ingredient?: string;
  product_type?: ChemicalProductType;
  unit_of_measure?: string;
  current_inventory?: number;
  reorder_threshold?: number;
  cost_per_unit?: number;
  sds_storage_path?: string;
  rei_hours?: number;
  signal_word?: SignalWord;
  notes?: string;
}

export interface UpdateProductData extends Partial<CreateProductData> {
  is_active?: boolean;
}

export interface CreateApplicationData {
  product_id: string;
  applicator_license?: string;
  application_date: string;
  application_time?: string;
  zone_ids: string[];
  hole_numbers?: number[];
  area_treated_sqft?: number;
  application_rate?: string;
  total_amount_used?: number;
  method?: ApplicationMethod;
  weather_temp_f?: number;
  weather_wind_mph?: number;
  weather_wind_direction?: string;
  weather_humidity?: number;
  weather_conditions?: string;
  target_pest?: string;
  notes?: string;
  task_id?: string;
}

// Extended types with joined data
export interface ChemicalProductWithStats extends ChemicalProduct {
  total_applications?: number;
  last_application_date?: string;
  is_low_stock?: boolean;
}

export interface ChemicalApplicationWithProduct extends ChemicalApplication {
  product?: ChemicalProduct;
  applicator_name?: string;
}

interface UseChemicalsReturn {
  products: ChemicalProductWithStats[];
  applications: ChemicalApplicationWithProduct[];
  loading: boolean;
  error: string | null;
  // Product operations
  fetchProducts: (filters?: ProductFilters) => Promise<void>;
  getProduct: (id: string) => Promise<ChemicalProductWithStats | null>;
  createProduct: (data: CreateProductData) => Promise<ChemicalProduct | null>;
  updateProduct: (id: string, data: UpdateProductData) => Promise<ChemicalProduct | null>;
  updateInventory: (id: string, quantity: number, operation: "add" | "subtract" | "set") => Promise<boolean>;
  // Application operations
  fetchApplications: (filters?: { productId?: string; startDate?: string; endDate?: string }) => Promise<void>;
  getApplication: (id: string) => Promise<ChemicalApplicationWithProduct | null>;
  createApplication: (data: CreateApplicationData) => Promise<ChemicalApplication | null>;
  getProductApplicationHistory: (productId: string, limit?: number) => Promise<ChemicalApplicationWithProduct[]>;
  // Stats
  fetchInventoryStats: () => Promise<InventoryStats>;
  getLowStockProducts: () => Promise<ChemicalProductWithStats[]>;
  getActiveREIs: () => Promise<ActiveREI[]>;
}

export interface InventoryStats {
  total_products: number;
  low_stock_count: number;
  total_inventory_value: number;
  by_type: { type: ChemicalProductType; count: number; value: number }[];
}

export interface ActiveREI {
  application_id: string;
  product_name: string;
  zone_names: string[];
  /** Raw zone ids still under the active REI (for conflict matching). */
  zone_ids: string[];
  /** Hole numbers still under the active REI (for conflict matching). */
  hole_numbers: number[];
  rei_expires_at: string;
  hours_remaining: number;
}

export function useChemicals(): UseChemicalsReturn {
  const [products, setProducts] = useState<ChemicalProductWithStats[]>([]);
  const [applications, setApplications] = useState<ChemicalApplicationWithProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch products with optional filters
   */
  const fetchProducts = useCallback(
    async (filters?: ProductFilters) => {
      setLoading(true);
      setError(null);

      try {
        // Direct REST so the page can't wedge on a stalled supabase-js
        // auth wrapper after navigation.
        const restFilters: string[] = [];
        if (filters?.type) restFilters.push(`product_type=eq.${encodeURIComponent(filters.type)}`);
        if (filters?.signalWord) restFilters.push(`signal_word=eq.${encodeURIComponent(filters.signalWord)}`);
        if (filters?.activeOnly !== false) restFilters.push(`is_active=eq.true`);

        let or: string | undefined;
        if (filters?.search) {
          const term = encodeURIComponent(`%${filters.search}%`);
          or = [
            `product_name.ilike.${term}`,
            `manufacturer.ilike.${term}`,
            `active_ingredient.ilike.${term}`,
          ].join(",");
        }

        const data = await directSelectList<ChemicalProduct>("chemical_products", {
          columns: "*",
          filters: restFilters,
          or,
          orderBy: [{ column: "product_name", ascending: true }],
          limit: 100,
          label: "useChemicals.fetchProducts",
        });

        // Compute low stock flag
        const productsWithStats: ChemicalProductWithStats[] = data.map((product: ChemicalProduct) => ({
          ...product,
          is_low_stock:
            product.current_inventory !== null &&
            product.reorder_threshold !== null &&
            product.current_inventory <= product.reorder_threshold,
        }));

        // Filter to low stock only if requested
        const filteredProducts = filters?.lowStockOnly
          ? productsWithStats.filter((p) => p.is_low_stock)
          : productsWithStats;

        setProducts(filteredProducts);
      } catch (err) {
        console.error("Error fetching products:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch products");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Get a single product with application stats
   */
  const getProduct = useCallback(
    async (id: string): Promise<ChemicalProductWithStats | null> => {
      try {
        const product = await directSelectRow<ChemicalProduct>(
          "chemical_products",
          "id",
          id,
          "*",
          "useChemicals.getProduct",
        );

        if (!product) return null;

        // Get application count and last application via direct REST.
        const [appData, count] = await Promise.all([
          directSelectList<{ id: string; application_date: string }>(
            "chemical_applications",
            {
              columns: "id, application_date",
              filters: [`product_id=eq.${encodeURIComponent(id)}`],
              orderBy: [{ column: "application_date", ascending: false }],
              limit: 1,
              label: "useChemicals.getProduct.lastApp",
            },
          ),
          directSelectCount(
            "chemical_applications",
            [`product_id=eq.${encodeURIComponent(id)}`],
            "useChemicals.getProduct.appCount",
          ),
        ]);

        return {
          ...product,
          total_applications: count,
          last_application_date: appData[0]?.application_date,
          is_low_stock:
            product.current_inventory !== null &&
            product.reorder_threshold !== null &&
            product.current_inventory <= product.reorder_threshold,
        };
      } catch (err) {
        console.error("Error fetching product:", err);
        return null;
      }
    },
    []
  );

  /**
   * Create a new chemical product
   */
  const createProduct = useCallback(
    async (data: CreateProductData): Promise<ChemicalProduct | null> => {
      setLoading(true);
      setError(null);

      try {
        const newProduct = await directInsertRow<ChemicalProduct>(
          "chemical_products",
          data as unknown as Record<string, unknown>,
          "useChemicals.createProduct",
        );
        return newProduct;
      } catch (err) {
        console.error("Error creating product:", err);
        setError(err instanceof Error ? err.message : "Failed to create product");
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Update a chemical product
   */
  const updateProduct = useCallback(
    async (id: string, data: UpdateProductData): Promise<ChemicalProduct | null> => {
      setLoading(true);
      setError(null);

      try {
        const updatedProduct = await directPatchRowReturning<ChemicalProduct>(
          "chemical_products",
          "id",
          id,
          data as unknown as Record<string, unknown>,
          "useChemicals.updateProduct",
        );

        // Update local state
        setProducts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...updatedProduct } : p))
        );

        return updatedProduct;
      } catch (err) {
        console.error("Error updating product:", err);
        setError(err instanceof Error ? err.message : "Failed to update product");
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Update inventory quantity
   */
  const updateInventory = useCallback(
    async (
      id: string,
      quantity: number,
      operation: "add" | "subtract" | "set"
    ): Promise<boolean> => {
      try {
        // Get current inventory via direct REST.
        const product = await directSelectRow<{ current_inventory: number | null }>(
          "chemical_products",
          "id",
          id,
          "current_inventory",
          "useChemicals.updateInventory.fetch",
        );

        let newInventory: number;
        const currentInventory = product?.current_inventory ?? 0;

        switch (operation) {
          case "add":
            newInventory = currentInventory + quantity;
            break;
          case "subtract":
            newInventory = Math.max(0, currentInventory - quantity);
            break;
          case "set":
            newInventory = quantity;
            break;
        }

        await directPatchRow(
          "chemical_products",
          "id",
          id,
          { current_inventory: newInventory },
          "useChemicals.updateInventory.patch",
        );

        // Update local state
        setProducts((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  current_inventory: newInventory,
                  is_low_stock:
                    p.reorder_threshold !== null && newInventory <= (p.reorder_threshold ?? 0),
                }
              : p
          )
        );

        return true;
      } catch (err) {
        console.error("Error updating inventory:", err);
        setError(err instanceof Error ? err.message : "Failed to update inventory");
        return false;
      }
    },
    []
  );

  /**
   * Fetch applications with optional filters
   */
  const fetchApplications = useCallback(
    async (filters?: { productId?: string; startDate?: string; endDate?: string }) => {
      setLoading(true);
      setError(null);

      try {
        const restFilters: string[] = [];
        if (filters?.productId) restFilters.push(`product_id=eq.${encodeURIComponent(filters.productId)}`);
        if (filters?.startDate) restFilters.push(`application_date=gte.${filters.startDate}`);
        if (filters?.endDate) restFilters.push(`application_date=lte.${filters.endDate}`);

        const data = await directSelectList<ChemicalApplication & { product: ChemicalProduct }>(
          "chemical_applications",
          {
            columns: "*, product:chemical_products!product_id(*)",
            filters: restFilters,
            orderBy: [{ column: "application_date", ascending: false }],
            limit: 100,
            label: "useChemicals.fetchApplications",
          },
        );

        // Type the data properly
        const typedApplications: ChemicalApplicationWithProduct[] = data.map(
          (app) => ({
            ...app,
            product: app.product,
          })
        );

        setApplications(typedApplications);
      } catch (err) {
        console.error("Error fetching applications:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch applications");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Get a single application with product details
   */
  const getApplication = useCallback(
    async (id: string): Promise<ChemicalApplicationWithProduct | null> => {
      try {
        const rows = await directSelectList<ChemicalApplicationWithProduct>(
          "chemical_applications",
          {
            columns: "*, product:chemical_products!product_id(*)",
            filters: [`id=eq.${encodeURIComponent(id)}`],
            limit: 1,
            label: "useChemicals.getApplication",
          },
        );
        return rows[0] ?? null;
      } catch (err) {
        console.error("Error fetching application:", err);
        return null;
      }
    },
    []
  );

  /**
   * Create a new chemical application
   * Automatically deducts inventory and calculates REI expiration
   */
  const createApplication = useCallback(
    async (data: CreateApplicationData): Promise<ChemicalApplication | null> => {
      setLoading(true);
      setError(null);

      try {
        // Get product info for REI calculation via direct REST.
        const product = await directSelectRow<{ rei_hours: number | null; current_inventory: number | null }>(
          "chemical_products",
          "id",
          data.product_id,
          "rei_hours, current_inventory",
          "useChemicals.createApplication.product",
        );

        if (!product) {
          throw new Error("Product not found");
        }

        // Calculate REI expiration
        let rei_expires_at: string | null = null;
        if (product.rei_hours && data.application_date && data.application_time) {
          const applicationDateTime = new Date(
            `${data.application_date}T${data.application_time}`
          );
          applicationDateTime.setHours(applicationDateTime.getHours() + product.rei_hours);
          rei_expires_at = applicationDateTime.toISOString();
        } else if (product.rei_hours && data.application_date) {
          // If no time specified, assume 8 AM
          const applicationDateTime = new Date(`${data.application_date}T08:00:00`);
          applicationDateTime.setHours(applicationDateTime.getHours() + product.rei_hours);
          rei_expires_at = applicationDateTime.toISOString();
        }

        // Cached user-id read avoids the supabase.auth.getUser() wedge.
        const userId = getCachedUserId();

        if (!userId) {
          throw new Error("User not authenticated");
        }

        // Create the application record
        const applicationData = {
          ...data,
          applied_by: userId,
          rei_expires_at,
        };

        const newApplication = await directInsertRow<ChemicalApplication>(
          "chemical_applications",
          applicationData as unknown as Record<string, unknown>,
          "useChemicals.createApplication",
        );

        // Auto-deduct inventory if amount used is specified
        if (data.total_amount_used && data.total_amount_used > 0) {
          await updateInventory(data.product_id, data.total_amount_used, "subtract");
        }

        return newApplication;
      } catch (err) {
        console.error("Error creating application:", err);
        setError(err instanceof Error ? err.message : "Failed to create application");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [updateInventory]
  );

  /**
   * Get application history for a specific product
   */
  const getProductApplicationHistory = useCallback(
    async (productId: string, limit: number = 20): Promise<ChemicalApplicationWithProduct[]> => {
      try {
        const data = await directSelectList<ChemicalApplicationWithProduct>(
          "chemical_applications",
          {
            columns: "*",
            filters: [`product_id=eq.${encodeURIComponent(productId)}`],
            orderBy: [{ column: "application_date", ascending: false }],
            limit,
            label: "useChemicals.getProductApplicationHistory",
          },
        );
        return data;
      } catch (err) {
        console.error("Error fetching application history:", err);
        return [];
      }
    },
    []
  );

  /**
   * Fetch inventory statistics
   */
  const fetchInventoryStats = useCallback(async (): Promise<InventoryStats> => {
    const defaultStats: InventoryStats = {
      total_products: 0,
      low_stock_count: 0,
      total_inventory_value: 0,
      by_type: [],
    };

    try {
      const data = await directSelectList<ChemicalProduct>("chemical_products", {
        columns: "*",
        filters: [`is_active=eq.true`],
        label: "useChemicals.fetchInventoryStats",
      });

      if (data.length === 0) {
        return defaultStats;
      }

      // Calculate stats
      let lowStockCount = 0;
      let totalValue = 0;
      const typeMap = new Map<
        ChemicalProductType,
        { count: number; value: number }
      >();

      data.forEach((product: ChemicalProduct) => {
        // Check low stock
        if (
          product.current_inventory !== null &&
          product.reorder_threshold !== null &&
          product.current_inventory <= product.reorder_threshold
        ) {
          lowStockCount++;
        }

        // Calculate inventory value
        const productValue =
          (product.current_inventory ?? 0) * (product.cost_per_unit ?? 0);
        totalValue += productValue;

        // Group by type
        if (product.product_type) {
          const existing = typeMap.get(product.product_type) || {
            count: 0,
            value: 0,
          };
          typeMap.set(product.product_type, {
            count: existing.count + 1,
            value: existing.value + productValue,
          });
        }
      });

      const byType = Array.from(typeMap.entries()).map(([type, stats]) => ({
        type,
        count: stats.count,
        value: stats.value,
      }));

      return {
        total_products: data.length,
        low_stock_count: lowStockCount,
        total_inventory_value: totalValue,
        by_type: byType,
      };
    } catch (err) {
      console.error("Error fetching inventory stats:", err);
      return defaultStats;
    }
  }, []);

  /**
   * Get products with low stock
   */
  const getLowStockProducts = useCallback(async (): Promise<
    ChemicalProductWithStats[]
  > => {
    try {
      const data = await directSelectList<ChemicalProduct>("chemical_products", {
        columns: "*",
        filters: [`is_active=eq.true`],
        label: "useChemicals.getLowStockProducts",
      });

      // Filter to low stock only
      return data
        .filter(
          (product: ChemicalProduct) =>
            product.current_inventory !== null &&
            product.reorder_threshold !== null &&
            product.current_inventory <= product.reorder_threshold
        )
        .map((product: ChemicalProduct) => ({
          ...product,
          is_low_stock: true,
        }));
    } catch (err) {
      console.error("Error fetching low stock products:", err);
      return [];
    }
  }, []);

  /**
   * Get currently active REI (Restricted Entry Interval) zones
   */
  const getActiveREIs = useCallback(async (): Promise<ActiveREI[]> => {
    try {
      const now = new Date().toISOString();

      // Type for the application data from query
      interface REIApplicationData {
        id: string;
        rei_expires_at: string | null;
        zone_ids: string[] | null;
        hole_numbers: number[] | null;
        product: { product_name: string } | null;
      }

      const typedData = await directSelectList<REIApplicationData>(
        "chemical_applications",
        {
          columns: "id, rei_expires_at, zone_ids, hole_numbers, product:chemical_products!product_id(product_name)",
          filters: [`rei_expires_at=gt.${encodeURIComponent(now)}`],
          orderBy: [{ column: "rei_expires_at", ascending: true }],
          label: "useChemicals.getActiveREIs",
        },
      );

      if (typedData.length === 0) {
        return [];
      }

      // Get zone names for the applications
      const allZoneIds = [...new Set(typedData.flatMap((app) => app.zone_ids || []))];

      let zoneNames: Record<string, string> = {};
      if (allZoneIds.length > 0) {
        const zones = await directSelectList<{ id: string; name: string }>(
          "course_zones",
          {
            columns: "id, name",
            filters: [`id=in.(${allZoneIds.map(encodeURIComponent).join(",")})`],
            label: "useChemicals.getActiveREIs.zones",
          },
        );

        zoneNames = zones.reduce(
          (acc, zone) => ({ ...acc, [zone.id]: zone.name }),
          {} as Record<string, string>
        );
      }

      return typedData.map((app) => {
        const expiresAt = new Date(app.rei_expires_at as string);
        const hoursRemaining = Math.max(
          0,
          (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)
        );

        return {
          application_id: app.id,
          product_name: app.product?.product_name || "Unknown",
          zone_names: (app.zone_ids || []).map(
            (id: string) => zoneNames[id] || id
          ),
          zone_ids: app.zone_ids || [],
          hole_numbers: app.hole_numbers || [],
          rei_expires_at: app.rei_expires_at as string,
          hours_remaining: Math.round(hoursRemaining * 10) / 10,
        };
      });
    } catch (err) {
      console.error("Error fetching active REIs:", err);
      return [];
    }
  }, []);

  return {
    products,
    applications,
    loading,
    error,
    fetchProducts,
    getProduct,
    createProduct,
    updateProduct,
    updateInventory,
    fetchApplications,
    getApplication,
    createApplication,
    getProductApplicationHistory,
    fetchInventoryStats,
    getLowStockProducts,
    getActiveREIs,
  };
}
