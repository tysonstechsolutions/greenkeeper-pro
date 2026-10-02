-- ============================================================================
-- Vendors: 889s expire one year from the date signed, and duplicate vendors
-- can be combined.
--
-- 1. 889 rule. The app used to expire every 889 on the next Oct 1 (end of
--    the federal fiscal year), so on Oct 1, 2026 every vendor went "expired".
--    The real rule is one year from the date the 889 was signed. We now store
--    the sign date and compute expiration = sign date + 1 year.
--
-- 2. Repair. The sign date was never stored, so for existing 889s whose
--    expiration is still the old automatic Oct 1 date, we use the day the
--    889 was uploaded as the sign date, mark it "estimated" so the app asks
--    for a check, and recompute the expiration. That brings those vendors
--    back to active. An expiration someone set by hand (not Oct 1) is left
--    exactly as it is.
--
-- 3. Combining duplicates. merge_vendors(keep, duplicates[]) folds duplicate
--    vendors into one: blank fields on the kept vendor are filled from the
--    duplicates, the newest 889 wins, notes are combined, and purchase
--    requests plus current/future duty assignments, coverages, and open tasks
--    move to the kept vendor. Duplicates are NOT deleted — completed tasks
--    are protected history and still reference them — they are marked
--    merged_into_id and hidden from every vendor list and picker.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, the repair only touches rows without
-- a stored sign date, CREATE OR REPLACE for the function.
-- ============================================================================

ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS section_889_signed_date DATE;
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS section_889_signed_date_estimated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_not_merged_into_self'
  ) THEN
    ALTER TABLE public.vendors
      ADD CONSTRAINT vendors_not_merged_into_self CHECK (merged_into_id IS DISTINCT FROM id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vendors_active_name
  ON public.vendors(name) WHERE merged_into_id IS NULL;

COMMENT ON COLUMN public.vendors.section_889_signed_date IS 'Date the Section 889 representation was signed. It expires one year later.';
COMMENT ON COLUMN public.vendors.section_889_signed_date_estimated IS 'True when the sign date was taken from the upload date instead of the form. The app asks for a check.';
COMMENT ON COLUMN public.vendors.merged_into_id IS 'Set when this vendor was combined into another. Merged vendors are hidden from lists and pickers.';

-- ── 2. Repair existing 889 expirations ──────────────────────────────────────
-- Only 889s whose expiration is empty or still the old automatic Oct 1 date.
-- Upload time is read in the course time zone (Great Lakes, IL).
UPDATE public.vendors
SET section_889_signed_date = (section_889_uploaded_at AT TIME ZONE 'America/Chicago')::date,
    section_889_signed_date_estimated = TRUE,
    section_889_expiration_date =
      ((section_889_uploaded_at AT TIME ZONE 'America/Chicago')::date + INTERVAL '1 year')::date
WHERE section_889_path IS NOT NULL
  AND section_889_signed_date IS NULL
  AND section_889_uploaded_at IS NOT NULL
  AND (
    section_889_expiration_date IS NULL
    OR (EXTRACT(MONTH FROM section_889_expiration_date) = 10
        AND EXTRACT(DAY FROM section_889_expiration_date) = 1)
  );

-- The operating-rhythm reminder still described the old fiscal-year rule.
-- Wording only, its schedule is unchanged.
DO $$ BEGIN
  IF to_regclass('public.obligations') IS NOT NULL THEN
    UPDATE public.obligations
    SET title = 'Section 889 vendor check',
        detail = 'Check vendors for 889s expiring soon. Each 889 is good for one year from the date it was signed.'
    WHERE slug = '889-renewals'
      AND detail = 'Re-sign vendor 889 representations for the new fiscal year.';
  END IF;
END $$;

-- ── 3. Combine duplicates ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.merge_vendors(p_keep_id UUID, p_merge_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_keep public.vendors%ROWTYPE;
  v_dup public.vendors%ROWTYPE;
  v_ids UUID[];
  v_notes TEXT[];
  v_prs INT := 0;
  v_assignments INT := 0;
  v_coverages INT := 0;
  v_tasks INT := 0;
  v_n INT;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Only a manager can combine vendors';
  END IF;

  SELECT ARRAY(SELECT DISTINCT unnest(p_merge_ids) EXCEPT SELECT p_keep_id) INTO v_ids;
  IF p_keep_id IS NULL OR COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Pick a vendor to keep and at least one duplicate';
  END IF;

  SELECT * INTO v_keep FROM public.vendors WHERE id = p_keep_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The vendor to keep no longer exists'; END IF;
  IF v_keep.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'The vendor to keep was already combined into another vendor';
  END IF;
  IF (SELECT count(*) FROM public.vendors WHERE id = ANY(v_ids) AND merged_into_id IS NULL)
     <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'One of the duplicates is missing or was already combined';
  END IF;

  v_notes := ARRAY[NULLIF(btrim(v_keep.notes), '')];

  -- Newest-updated duplicate first, so its details win when the kept one is blank.
  FOR v_dup IN
    SELECT * FROM public.vendors WHERE id = ANY(v_ids)
    ORDER BY updated_at DESC NULLS LAST, created_at DESC
    FOR UPDATE
  LOOP
    v_keep.company          := COALESCE(NULLIF(btrim(v_keep.company), ''), v_dup.company);
    v_keep.phone            := COALESCE(NULLIF(btrim(v_keep.phone), ''), v_dup.phone);
    v_keep.email            := COALESCE(NULLIF(btrim(v_keep.email), ''), v_dup.email);
    v_keep.supplies         := COALESCE(NULLIF(btrim(v_keep.supplies), ''), v_dup.supplies);
    v_keep.address          := COALESCE(NULLIF(btrim(v_keep.address), ''), v_dup.address);
    v_keep.address_line2    := COALESCE(NULLIF(btrim(v_keep.address_line2), ''), v_dup.address_line2);
    v_keep.city_state_zip   := COALESCE(NULLIF(btrim(v_keep.city_state_zip), ''), v_dup.city_state_zip);
    v_keep.poc              := COALESCE(NULLIF(btrim(v_keep.poc), ''), v_dup.poc);
    v_keep.sap_vendor_no    := COALESCE(NULLIF(btrim(v_keep.sap_vendor_no), ''), v_dup.sap_vendor_no);
    v_keep.gsa_naf_other_no := COALESCE(NULLIF(btrim(v_keep.gsa_naf_other_no), ''), v_dup.gsa_naf_other_no);
    v_keep.contract_end_date := GREATEST(v_keep.contract_end_date, v_dup.contract_end_date);
    IF v_keep.category = 'general' AND v_dup.category <> 'general' THEN
      v_keep.category := v_dup.category;
    END IF;
    v_notes := v_notes || NULLIF(btrim(v_dup.notes), '');

    -- Keep whichever 889 is good the longest (an 889 beats no 889).
    IF v_dup.section_889_path IS NOT NULL AND (
         v_keep.section_889_path IS NULL
         OR COALESCE(v_dup.section_889_expiration_date, '-infinity'::date)
              > COALESCE(v_keep.section_889_expiration_date, '-infinity'::date)
       ) THEN
      v_keep.section_889_path := v_dup.section_889_path;
      v_keep.section_889_filename := v_dup.section_889_filename;
      v_keep.section_889_uploaded_at := v_dup.section_889_uploaded_at;
      v_keep.section_889_expiration_date := v_dup.section_889_expiration_date;
      v_keep.section_889_signed_date := v_dup.section_889_signed_date;
      v_keep.section_889_signed_date_estimated := v_dup.section_889_signed_date_estimated;
    END IF;
  END LOOP;

  UPDATE public.vendors SET
    company = v_keep.company,
    phone = v_keep.phone,
    email = v_keep.email,
    supplies = v_keep.supplies,
    address = v_keep.address,
    address_line2 = v_keep.address_line2,
    city_state_zip = v_keep.city_state_zip,
    poc = v_keep.poc,
    sap_vendor_no = v_keep.sap_vendor_no,
    gsa_naf_other_no = v_keep.gsa_naf_other_no,
    contract_end_date = v_keep.contract_end_date,
    category = v_keep.category,
    -- Each distinct note once, kept vendor first, in order.
    notes = NULLIF(array_to_string(ARRAY(
      SELECT d.n FROM (
        SELECT DISTINCT ON (lower(t.n)) t.n, t.ord
        FROM unnest(v_notes) WITH ORDINALITY AS t(n, ord)
        WHERE t.n IS NOT NULL
        ORDER BY lower(t.n), t.ord
      ) d ORDER BY d.ord
    ), E'\n'), ''),
    section_889_path = v_keep.section_889_path,
    section_889_filename = v_keep.section_889_filename,
    section_889_uploaded_at = v_keep.section_889_uploaded_at,
    section_889_expiration_date = v_keep.section_889_expiration_date,
    section_889_signed_date = v_keep.section_889_signed_date,
    section_889_signed_date_estimated = v_keep.section_889_signed_date_estimated,
    updated_at = now()
  WHERE id = p_keep_id;

  -- Move what points at the duplicates. Completed history stays as it was.
  IF to_regclass('public.purchase_requests') IS NOT NULL THEN
    UPDATE public.purchase_requests SET vendor_id = p_keep_id WHERE vendor_id = ANY(v_ids);
    GET DIAGNOSTICS v_prs = ROW_COUNT;
  END IF;
  IF to_regclass('public.duty_assignments') IS NOT NULL THEN
    UPDATE public.duty_assignments SET contractor_vendor_id = p_keep_id
    WHERE contractor_vendor_id = ANY(v_ids)
      AND (effective_through IS NULL OR effective_through >= current_date);
    GET DIAGNOSTICS v_assignments = ROW_COUNT;
  END IF;
  IF to_regclass('public.duty_temporary_coverages') IS NOT NULL THEN
    UPDATE public.duty_temporary_coverages SET contractor_vendor_id = p_keep_id
    WHERE contractor_vendor_id = ANY(v_ids) AND ends_on >= current_date;
    GET DIAGNOSTICS v_coverages = ROW_COUNT;
  END IF;
  IF to_regclass('public.tasks') IS NOT NULL THEN
    UPDATE public.tasks SET duty_contractor_vendor_id = p_keep_id
    WHERE duty_contractor_vendor_id = ANY(v_ids) AND status NOT IN ('completed', 'verified');
    GET DIAGNOSTICS v_tasks = ROW_COUNT;
  END IF;

  UPDATE public.vendors
  SET merged_into_id = p_keep_id, merged_at = now(), updated_at = now()
  WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object(
    'kept', p_keep_id,
    'combined', v_n,
    'purchase_requests', v_prs,
    'duty_assignments', v_assignments,
    'coverages', v_coverages,
    'open_tasks', v_tasks
  );
END;
$function$;

COMMENT ON FUNCTION public.merge_vendors(UUID, UUID[]) IS 'Manager-only: fold duplicate vendors into one kept vendor. Duplicates are marked merged, never deleted.';

REVOKE ALL ON FUNCTION public.merge_vendors(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_vendors(UUID, UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
