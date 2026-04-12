-- Drone flight NDVI/imagery ingest table
CREATE TABLE IF NOT EXISTS drone_flights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_date date NOT NULL,
  geotiff_path text,          -- Supabase Storage path (nullable — may upload PNG instead)
  preview_png_path text,      -- Supabase Storage path for the preview image
  bbox jsonb,                 -- {north, south, east, west} - nullable
  band text CHECK (band IN ('ndvi','ndre','thermal','rgb')),
  source text,                -- 'greensight', 'pix4d', 'dji', 'manual'
  notes text,
  uploaded_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drone_flights_date ON drone_flights(flight_date);

ALTER TABLE drone_flights ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user
CREATE POLICY "drone_flights_select" ON drone_flights
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: management + foreman roles only
CREATE POLICY "drone_flights_insert" ON drone_flights
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super', 'asst_super', 'director', 'foreman', 'pro')
    )
  );

-- UPDATE: management only
CREATE POLICY "drone_flights_update" ON drone_flights
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super', 'asst_super', 'director')
    )
  );

-- DELETE: management only
CREATE POLICY "drone_flights_delete" ON drone_flights
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super', 'asst_super', 'director')
    )
  );
