-- Add area_path column to green_observations for freehand drawn zones
-- Stores an array of {x, y} points (0-1 relative coords) representing
-- the boundary of the affected area on the green image.
-- pin_x/pin_y become the centroid of the drawn area.

ALTER TABLE green_observations
ADD COLUMN IF NOT EXISTS area_path JSONB DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN green_observations.area_path IS 'Array of {x,y} points (0-1 relative) defining the freehand-drawn boundary of the affected area. Null for legacy pin-only observations.';
