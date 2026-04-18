#!/usr/bin/env python3
"""
One-shot patcher for pin-login and pin-signup callsites — swaps their
fetch("/api/auth/pin-*") calls for supabase.functions.invoke(...) and adds
setSession() logic so the returned access/refresh tokens get applied.

Safe to re-run; it checks whether the target pattern is still present
before editing.
"""
from pathlib import Path

PATCHES = []

PATCHES.append((
    "src/app/pin-login/page.tsx",
    b'''    try {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid PIN");
        setPin("");
        setLoading(false);
        return;
      }

      setUserName(data.user?.name || "User");

      // Brief delay to show welcome message
      setTimeout(() => {
        const destination = returnTo || data.redirectPath || "/dashboard";
        router.push(destination);
        router.refresh();
      }, 800);
    } catch {
      setError("Connection error. Please try again.");
      setPin("");
      setLoading(false);
    }''',
    b'''    try {
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke<PinLoginResponse>(
        "pin-login",
        {
          method: "POST",
          body: { pin },
        },
      );

      if (fnError || !data) {
        setError(fnError?.message || "Invalid PIN");
        setPin("");
        setLoading(false);
        return;
      }

      if (!data.success) {
        setError(data.error || "Invalid PIN");
        setPin("");
        setLoading(false);
        return;
      }

      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      setUserName(data.user?.name || "User");

      setTimeout(() => {
        const destination = returnTo || data.redirectPath || "/dashboard";
        router.push(destination);
        router.refresh();
      }, 800);
    } catch {
      setError("Connection error. Please try again.");
      setPin("");
      setLoading(false);
    }''',
))

PATCHES.append((
    "src/app/invite/[token]/page-client.tsx",
    b'''    try {
      const res = await fetch("/api/auth/pin-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          pin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create account.");
        setSubmitting(false);
        return;
      }

      router.push(data.redirectPath || "/dashboard");
      router.refresh();
    } catch {
      setError("Connection error. Please try again.");
      setSubmitting(false);
    }''',
    b'''    try {
      const supabase = createClient();
      interface PinSignupResponse {
        success: boolean;
        user?: { id: string; name: string; role: string };
        session?: {
          access_token: string;
          refresh_token: string;
        } | null;
        redirectPath?: string;
        error?: string;
      }
      const { data, error: fnError } = await supabase.functions.invoke<PinSignupResponse>(
        "pin-signup",
        {
          method: "POST",
          body: {
            token,
            fullName: fullName.trim(),
            phone: phone.trim() || null,
            pin,
          },
        },
      );

      if (fnError || !data) {
        setError(fnError?.message || "Failed to create account.");
        setSubmitting(false);
        return;
      }

      if (!data.success) {
        setError(data.error || "Failed to create account.");
        setSubmitting(false);
        return;
      }

      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      router.push(data.redirectPath || "/dashboard");
      router.refresh();
    } catch {
      setError("Connection error. Please try again.");
      setSubmitting(false);
    }''',
))


def main():
    for p, old, new in PATCHES:
        path = Path(p)
        if not path.exists():
            print("MISSING:", p)
            continue
        raw = path.read_bytes()
        if new in raw:
            print("ALREADY PATCHED:", p)
            continue
        if old not in raw:
            print("PATTERN NOT FOUND:", p)
            continue
        path.write_bytes(raw.replace(old, new))
        print("PATCHED:", p)


if __name__ == "__main__":
    main()
