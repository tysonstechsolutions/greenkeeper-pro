-- Support multiple quote files per purchase request.
-- Legacy single-quote columns (quote_storage_path / quote_filename) are kept
-- and still set to the first quote for backward compatibility; quote_paths is
-- the full list so the submission bundle can include every quote.
alter table public.purchase_requests
  add column if not exists quote_paths jsonb;
