"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Lock, AlertCircle } from "lucide-react";
import type { UserRole } from "@/types/database";

// Route users based on their role
function getRedirectPath(role: UserRole | undefined): string {
  switch (role) {
    case "member":
      return "/member/home";
    case "pro":
      return "/pro-dashboard";
    default:
      return "/dashboard";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Fetch user profile to determine redirect
    if (authData.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      const profileData = profile as { role: UserRole } | null;
      const redirectPath = getRedirectPath(profileData?.role);
      router.push(redirectPath);
    } else {
      router.push("/dashboard");
    }

    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-md">
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <span className="text-primary-foreground font-bold text-2xl">GK</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">VMGC</h1>
          <p className="text-muted-foreground mt-1">Championship Course Management</p>
        </div>

        {/* Login Form */}
        <div className="bg-card rounded-xl border border-border shadow-lg p-6">
          <h2 className="text-lg font-semibold mb-6">Sign in to your account</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          {/* PIN Login */}
          <div className="mt-6 pt-6 border-t border-border">
            <a
              href="/pin-login"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-muted/50 hover:bg-muted text-sm font-medium text-foreground transition-colors"
            >
              <span className="text-lg">🔢</span>
              Crew PIN Login
            </a>
          </div>

          {/* Links */}
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Golfer?{" "}
              <a href="/join" className="text-primary font-medium hover:underline">
                Join our community
              </a>
            </p>
            <p className="text-sm text-muted-foreground text-center">
              Staff member?{" "}
              <span className="text-foreground font-medium">
                Use the invite link from your superintendent.
              </span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Veterans Memorial Golf Course
        </p>
      </div>
    </div>
  );
}
