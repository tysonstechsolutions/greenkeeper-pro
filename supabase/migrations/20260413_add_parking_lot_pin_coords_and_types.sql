-- Add pin coordinates for map-based issue placement
ALTER TABLE parking_lot_issues ADD COLUMN IF NOT EXISTS pin_x REAL;
ALTER TABLE parking_lot_issues ADD COLUMN IF NOT EXISTS pin_y REAL;

-- Add new issue types: low_area, badly_cracked
-- Drop and recreate check constraint to include new values
ALTER TABLE parking_lot_issues DROP CONSTRAINT IF EXISTS parking_lot_issues_issue_type_check;
ALTER TABLE parking_lot_issues ADD CONSTRAINT parking_lot_issues_issue_type_check
  CHECK (issue_type IN ('pothole', 'low_area', 'badly_cracked', 'crack', 'drainage', 'erosion', 'marking', 'curbing', 'other'));
