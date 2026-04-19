-- Extend push_subscriptions to store native FCM tokens alongside Web Push
-- endpoints so a single table + a single push-send path handles both.
--
-- Existing rows are Web Push subscriptions — they keep endpoint + p256dh +
-- auth populated and platform='web'. Capacitor Android clients insert a
-- row with fcm_token populated and platform='android' (endpoint/p256dh/auth
-- stay NULL). The push-send edge function branches on platform at dispatch.

-- Make Web Push columns nullable so FCM rows don't need them.
ALTER TABLE push_subscriptions ALTER COLUMN endpoint DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN p256dh DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN auth DROP NOT NULL;

-- Drop the endpoint uniqueness (it's now nullable + not the only key shape).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_subscriptions_endpoint_key'
  ) THEN
    ALTER TABLE push_subscriptions
      DROP CONSTRAINT push_subscriptions_endpoint_key;
  END IF;
END $$;

-- Native FCM fields.
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS fcm_token text,
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web'
    CHECK (platform IN ('web', 'android', 'ios'));

-- Ensure rows always have exactly one valid shape.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_subscriptions_shape_chk'
  ) THEN
    ALTER TABLE push_subscriptions
      ADD CONSTRAINT push_subscriptions_shape_chk CHECK (
        (platform = 'web'
          AND endpoint IS NOT NULL
          AND p256dh IS NOT NULL
          AND auth IS NOT NULL)
        OR
        (platform IN ('android', 'ios')
          AND fcm_token IS NOT NULL)
      );
  END IF;
END $$;

-- New unique indexes per shape so we can upsert cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_web_endpoint_key
  ON push_subscriptions (endpoint)
  WHERE endpoint IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_fcm_token_key
  ON push_subscriptions (fcm_token)
  WHERE fcm_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_platform
  ON push_subscriptions(platform);
