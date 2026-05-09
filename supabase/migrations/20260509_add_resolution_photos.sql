-- Add resolution proof tracking to hole_observations and green_observations.
-- Lets the superintendent take photos of an area after fixing the issue,
-- and keeps a permanent history of what was done with before/after photos.

ALTER TABLE hole_observations
  ADD COLUMN IF NOT EXISTS resolution_photos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resolution_notes  TEXT;

ALTER TABLE green_observations
  ADD COLUMN IF NOT EXISTS resolution_photos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resolution_notes  TEXT;

-- Indexes used by the Resolution History page (filter to resolved rows only,
-- ordered by resolution time descending).
CREATE INDEX IF NOT EXISTS idx_hole_obs_resolved_at
  ON hole_observations(resolved_at DESC)
  WHERE resolved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_green_obs_resolved_at
  ON green_observations(resolved_at DESC)
  WHERE resolved_at IS NOT NULL;
