"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { BottomNav } from "@/components/layout/bottom-nav";

export default function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { profile, loading, isMember } = useAuth();

  useEffect(() => {
    // If not loading and user is not a member, redirect to appropriate page
    if (!loading && profile && !isMember) {
      // Redirect staff to their dashboard
      router.replace("/dashboard");
    }
  }, [loading, profile, isMember, router]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // If not a member, don't render anything (redirect will happen)
  if (!isMember) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <main>{children}</main>
      <BottomNav />
    </div>
  );
}
