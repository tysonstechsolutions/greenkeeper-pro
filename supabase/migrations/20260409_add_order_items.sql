-- Order Items table for tracking supplies/materials that need to be ordered
-- Categories: clubhouse, cart_paths, turf_course, general
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('clubhouse', 'cart_paths', 'turf_course', 'general')),
  item_name TEXT NOT NULL,
  description TEXT,
  quantity TEXT,
  estimated_cost DECIMAL(10,2),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'ordered', 'received')),
  vendor TEXT,
  notes TEXT,
  ordered_date DATE,
  received_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view order items" ON order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert order items" ON order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update order items" ON order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete order items" ON order_items FOR DELETE TO authenticated USING (true);
