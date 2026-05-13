-- Store a pre-generated SOW PDF path so PRs created with a filled-out SOW
-- don't require the wizard again at bundle-download time.
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS sow_storage_path TEXT;

NOTIFY pgrst, 'reload schema';
