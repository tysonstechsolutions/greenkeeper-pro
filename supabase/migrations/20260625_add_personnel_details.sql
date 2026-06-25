-- SF-52 personnel-action filler: per-employee employment details used to fill
-- the SF-52 (Request for Personnel Action). Stores position title/number, NF
-- pay plan + occupational series + pay band, hourly rate, work schedule, FLSA
-- code, and home cost center.
--
-- Nullable JSONB, additive — mirrors the existing emergency_contact /
-- certifications JSONB columns on profiles. No sensitive PII (SSN/DOB) is
-- stored; the requesting office does not fill those boxes on the SF-52.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS personnel_details JSONB;

NOTIFY pgrst, 'reload schema';
