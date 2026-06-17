"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getCachedUserId,
  directInsertRow,
  directPatchRowReturning,
  directDeleteRow,
  directDeleteByFilter,
} from "@/lib/supabase/rest";
import type { OrderItem, OrderItemStatus } from "@/types/database";

/**
 * Display-only wrapper used by the Order List UI. A display item is either a
 * regular `order_items` row (`source: 'order_item'`) or a virtual row derived
 * from an `equipment_parts` row (`source: 'equipment_part'`). Equipment-part
 * items cannot be created or deleted from the Order List — only their status
 * can be advanced (Needed → Ordered → Received), which updates the underlying
 * equipment_parts row.
 */
export type DisplayOrderItem = Omit<OrderItem, "created_by"> & {
  // Equipment-part items have no creator — make it nullable on the display type.
  created_by: string | null;
  source: "order_item" | "equipment_part";
  equipment_id?: string | null;
  equipment_name?: string | null;
  part_number?: string | null;
};

export const orderCategoryLabels: Record<string, string> = {
  clubhouse: "Clubhouse",
  cart_paths: "Cart Paths",
  turf_course: "Turf & Course",
  general: "General",
};

export const orderCategoryColors: Record<string, string> = {
  clubhouse: "#2563EB",
  cart_paths: "#7C3AED",
  turf_course: "#16A34A",
  general: "#6B7280",
};

export const orderPriorityLabels: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const orderPriorityColors: Record<string, string> = {
  low: "#6B7280",
  normal: "#2563EB",
  high: "#EA580C",
  urgent: "#DC2626",
};

export const orderStatusLabels: Record<string, string> = {
  needed: "Needed",
  ordered: "Ordered",
  received: "Received",
};

export const orderStatusColors: Record<string, string> = {
  needed: "#EA580C",
  ordered: "#CA8A04",
  received: "#16A34A",
};

export function useOrderItems() {
  const [items, setItems] = useState<DisplayOrderItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Fetch both sources in parallel:
      //   1. order_items        → user-created supply/order rows
      //   2. equipment_parts    → parts logged against specific equipment (merged in so
      //                            the Order List shows everything that needs to be bought)
      const [ordersRes, partsRes] = await Promise.all([
        supabase
          .from("order_items")
          .select("*")
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("equipment_parts")
          .select("*, equipment:equipment_id(id, name)")
          .in("status", ["needed", "ordered", "received"])
          .order("created_at", { ascending: false }),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (partsRes.error) {
        // Non-fatal — still show the regular order list if parts query fails.
        console.error("Failed to fetch equipment_parts for order list:", partsRes.error);
      }

      const orderItems: DisplayOrderItem[] = (ordersRes.data || []).map((i: OrderItem) => ({
        ...i,
        source: "order_item",
      }));

      type PartRow = {
        id: string;
        equipment_id: string;
        name: string;
        part_number: string | null;
        description: string | null;
        quantity: number | null;
        status: string;
        estimated_cost: number | null;
        delay_reason: string | null;
        created_at: string;
        updated_at: string;
        equipment?: { id: string; name: string } | null;
      };

      const partItems: DisplayOrderItem[] = ((partsRes.data || []) as PartRow[]).map((p) => {
        const equipmentName = p.equipment?.name || "Equipment";
        // Convert to DisplayOrderItem shape. These are virtual — they are not rows
        // in `order_items`, so the `id` is prefixed to avoid collisions and any
        // mutation must be routed back to `equipment_parts` via updateItem().
        return {
          id: `eq-part-${p.id}`,
          item_name: p.name,
          description: p.description,
          category: "turf_course",
          priority: "normal",
          quantity: p.quantity != null ? String(p.quantity) : null,
          status: (p.status === "ordered"
            ? "ordered"
            : p.status === "received"
              ? "received"
              : "needed") as OrderItemStatus,
          estimated_cost: p.estimated_cost,
          vendor: null,
          notes: [
            p.part_number ? `Part #: ${p.part_number}` : null,
            p.delay_reason ? `Delay: ${p.delay_reason}` : null,
          ]
            .filter(Boolean)
            .join("\n") || null,
          ordered_date: null,
          received_date: null,
          created_at: p.created_at,
          updated_at: p.updated_at,
          created_by: null,
          // Extras for display / routing
          source: "equipment_part",
          equipment_id: p.equipment_id,
          equipment_name: equipmentName,
          part_number: p.part_number,
        } as DisplayOrderItem;
      });

      const merged = [...orderItems, ...partItems];
      setItems(merged);
      return merged;
    } catch (err) {
      console.error("Error fetching order items:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createItem = useCallback(async (item: {
    name: string;
    description?: string;
    category: string;
    priority: string;
    quantity?: string;
    estimated_cost?: number;
    vendor?: string;
    notes?: string;
  }) => {
    try {
      // Synchronous user-id read from the cached session — avoids
      // supabase.auth.getUser() which routes through the auth manager and
      // has wedged the app in the past. RLS still validates via JWT.
      const userId = getCachedUserId();
      if (!userId) throw new Error("Not authenticated");

      const data = await directInsertRow<OrderItem>(
        "order_items",
        {
          item_name: item.name,
          description: item.description || null,
          category: item.category,
          priority: item.priority,
          quantity: item.quantity || null,
          status: "needed",
          estimated_cost: item.estimated_cost || null,
          vendor: item.vendor || null,
          notes: item.notes || null,
          created_by: userId,
        },
        "useOrderItems.create",
      );
      const displayItem: DisplayOrderItem = { ...data, source: "order_item" };
      setItems((prev) => [displayItem, ...prev]);
      return displayItem;
    } catch (err) {
      console.error("Error creating order item:", err);
      return null;
    }
  }, []);

  const updateItem = useCallback(async (itemId: string, updates: Partial<OrderItem>) => {
    try {
      const supabase = createClient();

      // Virtual IDs like "eq-part-<uuid>" route to the equipment_parts table.
      if (itemId.startsWith("eq-part-")) {
        const partId = itemId.slice("eq-part-".length);
        // Only status transitions are meaningful for equipment_parts. Other
        // fields (item_name, notes) live on the equipment page.
        const partUpdates: Record<string, unknown> = {};
        if (updates.status) partUpdates.status = updates.status;
        partUpdates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
          .from("equipment_parts")
          .update(partUpdates)
          .eq("id", partId)
          .select("*, equipment:equipment_id(id, name)")
          .single();
        if (error) throw error;

        type PartRow = {
          id: string;
          equipment_id: string;
          name: string;
          part_number: string | null;
          description: string | null;
          quantity: number | null;
          status: string;
          estimated_cost: number | null;
          delay_reason: string | null;
          created_at: string;
          updated_at: string;
          equipment?: { id: string; name: string } | null;
        };
        const p = data as PartRow;
        const refreshed: DisplayOrderItem = {
          id: itemId,
          item_name: p.name,
          description: p.description,
          category: "turf_course",
          priority: "normal",
          quantity: p.quantity != null ? String(p.quantity) : null,
          status: (p.status === "ordered"
            ? "ordered"
            : p.status === "received"
              ? "received"
              : "needed") as OrderItemStatus,
          estimated_cost: p.estimated_cost,
          vendor: null,
          notes: [
            p.part_number ? `Part #: ${p.part_number}` : null,
            p.delay_reason ? `Delay: ${p.delay_reason}` : null,
          ]
            .filter(Boolean)
            .join("\n") || null,
          ordered_date: null,
          received_date: null,
          created_at: p.created_at,
          updated_at: p.updated_at,
          created_by: null,
          source: "equipment_part",
          equipment_id: p.equipment_id,
          equipment_name: p.equipment?.name || "Equipment",
          part_number: p.part_number,
        } as DisplayOrderItem;

        setItems((prev) => prev.map((i) => (i.id === itemId ? refreshed : i)));
        return refreshed;
      }

      // Regular order_items update via direct REST.
      const data = await directPatchRowReturning<OrderItem>(
        "order_items",
        "id",
        itemId,
        { ...updates, updated_at: new Date().toISOString() },
        "useOrderItems.update",
      );
      const displayItem: DisplayOrderItem = { ...data, source: "order_item" };
      setItems((prev) => prev.map((i) => (i.id === itemId ? displayItem : i)));
      return displayItem;
    } catch (err) {
      console.error("Error updating order item:", err);
      return null;
    }
  }, []);

  const deleteItem = useCallback(async (itemId: string) => {
    try {
      // Equipment parts are managed from the equipment page — refuse deletion
      // here to avoid confusion. The UI should hide the delete button for
      // equipment-part items, but we guard here as a safety net.
      if (itemId.startsWith("eq-part-")) {
        console.warn("Refusing to delete equipment part from Order List. Delete on the equipment page instead.");
        return false;
      }
      await directDeleteRow(
        "order_items",
        "id",
        itemId,
        "useOrderItems.delete",
      );
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      return true;
    } catch (err) {
      console.error("Error deleting order item:", err);
      return false;
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      // Remove all manually-added order items. Equipment-part rows live in
      // equipment_parts (managed on the equipment page) and are untouched.
      await directDeleteByFilter("order_items", ["id=not.is.null"], "useOrderItems.clearAll");
      setItems((prev) => prev.filter((i) => i.source !== "order_item"));
      return true;
    } catch (err) {
      console.error("Error clearing order items:", err);
      return false;
    }
  }, []);

  const stats = {
    total: items.length,
    needed: items.filter((i) => i.status === "needed").length,
    ordered: items.filter((i) => i.status === "ordered").length,
    received: items.filter((i) => i.status === "received").length,
    byCategory: {
      clubhouse: items.filter((i) => i.category === "clubhouse" && i.status !== "received").length,
      cart_paths: items.filter((i) => i.category === "cart_paths" && i.status !== "received").length,
      turf_course: items.filter((i) => i.category === "turf_course" && i.status !== "received").length,
      general: items.filter((i) => i.category === "general" && i.status !== "received").length,
    },
  };

  return { items, loading, stats, fetchItems, createItem, updateItem, deleteItem, clearAll };
}
