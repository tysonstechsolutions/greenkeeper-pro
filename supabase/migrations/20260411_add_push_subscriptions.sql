-- Web Push subscriptions table
-- Stores a VAPID-signed Web Push subscription per browser/device per user.
-- One user can have many subscriptions (phone browser, desktop browser, TWA).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can see/manage their own subscriptions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_select_own') THEN
    CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_insert_own') THEN
    CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_delete_own') THEN
    CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- NOTE: VAPID keys must be generated out-of-band and set as Vercel env vars:
--   npx web-push generate-vapid-keys
-- Then set:
--   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (public key, exposed to client)
--   VAPID_PRIVATE_KEY             (private key, server-only)
--   VAPID_SUBJECT                 (mailto:admin@example.com)
