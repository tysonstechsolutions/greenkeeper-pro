-- ============================================================
-- Create Jim Higgins — Director — PIN 5555
-- Run this in the Supabase SQL editor (uses postgres role, bypasses RLS).
-- Safe to re-run: uses ON CONFLICT to avoid duplicates.
-- ============================================================

DO $$
DECLARE
  v_user_id      uuid;
  v_email        text := 'jim.higgins.5555@vmgc.mil';
  v_full_name    text := 'Jim Higgins';
  v_role         text := 'director';
  v_pin          text := '5555';
  v_password     text := 'GK_Pin_Auth_2026!vmgc';  -- matches PIN_USER_PASSWORD in .env.local
BEGIN
  -- 1. Reuse existing auth.users row if one exists for this email, otherwise create it.
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider','email','providers', ARRAY['email']),
      jsonb_build_object('full_name', v_full_name, 'role', v_role),
      now(),
      now(),
      '', '', '', ''
    );

    -- Matching identity row (required by Supabase GoTrue).
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      now(),
      now(),
      now()
    );
  END IF;

  -- 2. Profile row (a trigger may have created a stub; upsert to set the fields we care about).
  INSERT INTO profiles (id, email, full_name, role, is_active)
  VALUES (v_user_id, v_email, v_full_name, v_role, true)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role      = EXCLUDED.role,
        email     = EXCLUDED.email,
        is_active = true;

  -- 3. PIN code.
  INSERT INTO pin_codes (user_id, pin, is_active)
  VALUES (v_user_id, v_pin, true)
  ON CONFLICT (user_id) DO UPDATE
    SET pin = EXCLUDED.pin,
        is_active = true;

  RAISE NOTICE 'Created/updated user % with PIN %', v_email, v_pin;
END $$;

-- Verify
SELECT p.full_name, p.role, p.email, pc.pin, pc.is_active
FROM profiles p
JOIN pin_codes pc ON pc.user_id = p.id
WHERE p.email = 'jim.higgins.5555@vmgc.mil';
