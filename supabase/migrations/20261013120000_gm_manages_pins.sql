-- ============================================================================
-- The GM manages sign-in PINs (2026-10-13).
--
-- PIN codes could only be read or changed by the superintendent and the
-- assistant superintendent, so the GM saw an empty PIN list and could not
-- reset a PIN for anyone, the F&B Manager included. This lets the GM do
-- everything they can: see, create, change, turn off, and remove PINs.
-- Nobody else gains anything. PIN sign-in itself is unchanged (it runs
-- through the pin-login function with the service role).
--
-- Comments here avoid apostrophes and semicolons for the SQL editor.
-- No DO blocks. Idempotent. Safe to run again.
-- ============================================================================

DROP POLICY IF EXISTS "Managers can read pin codes" ON public.pin_codes;
CREATE POLICY "Managers can read pin codes" ON public.pin_codes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super', 'asst_super', 'gm')
    )
  );

DROP POLICY IF EXISTS "Managers can insert pin codes" ON public.pin_codes;
CREATE POLICY "Managers can insert pin codes" ON public.pin_codes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super', 'asst_super', 'gm')
    )
  );

DROP POLICY IF EXISTS "Managers can update pin codes" ON public.pin_codes;
CREATE POLICY "Managers can update pin codes" ON public.pin_codes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super', 'asst_super', 'gm')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super', 'asst_super', 'gm')
    )
  );

DROP POLICY IF EXISTS "Managers can delete pin codes" ON public.pin_codes;
CREATE POLICY "Managers can delete pin codes" ON public.pin_codes
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super', 'asst_super', 'gm')
    )
  );

-- ── Done ────────────────────────────────────────────────────────────────────

INSERT INTO public.app_migrations (name) VALUES ('20261013120000_gm_manages_pins')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
