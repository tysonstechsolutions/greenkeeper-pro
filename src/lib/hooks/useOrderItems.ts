"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OrderItem } from "@/types/database";

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
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from("order_items")
        .select("*")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setItems(data || []);
      return data || [];
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
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.from("order_items")
        .insert({
          item_name: item.name,
          description: item.description || null,
          category: item.category,
          priority: item.priority,
          quantity: item.quantity || null,
          status: "needed",
          estimated_cost: item.estimated_cost || null,
          vendor: item.vendor || null,
          notes: item.notes || null,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      setItems((prev) => [data, ...prev]);
      return data;
    } catch (err) {
      console.error("Error creating order item:", err);
      return null;
    }
  }, []);

  const updateItem = useCallback(async (itemId: string, updates: Partial<OrderItem>) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from("order_items")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", itemId)
        .select()
        .single();
      if (error) throw error;
      setItems((prev) => prev.map((i) => (i.id === itemId ? data : i)));
      return data;
    } catch (err) {
      console.error("Error updating order item:", err);
      return null;
    }
  }, []);

  const deleteItem = useCallback(async (itemId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from("order_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      return true;
    } catch (err) {
      console.error("Error deleting order item:", err);
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

  return { items, loading, stats, fetchItems, createItem, updateItem, deleteItem };
}
