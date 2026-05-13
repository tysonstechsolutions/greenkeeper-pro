-- Add SOW (Statement of Work) as an attachable document on purchase requests
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS attached_sow boolean NOT NULL DEFAULT false;
