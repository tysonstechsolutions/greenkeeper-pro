"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type {
  MemberRegistration,
  MemberType,
  PreferredTee,
} from "@/types/member";

interface UseMemberReturn {
  memberInfo: MemberRegistration | null;
  loading: boolean;
  fetchMemberInfo: () => Promise<MemberRegistration | null>;
  updateMemberInfo: (data: Partial<MemberRegistration>) => Promise<boolean>;
}

export function useMember(): UseMemberReturn {
  const supabase = createClient();
  const { profile } = useAuth();
  const [memberInfo, setMemberInfo] = useState<MemberRegistration | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMemberInfo = useCallback(async (): Promise<MemberRegistration | null> => {
    if (!profile) return null;

    setLoading(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("member_registrations")
      .select("*")
      .eq("user_id", profile.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching member info:", error);
      setLoading(false);
      return null;
    }

    const memberData = data as MemberRegistration | null;
    setMemberInfo(memberData);
    setLoading(false);
    return memberData;
  }, [supabase, profile]);

  const updateMemberInfo = useCallback(
    async (data: Partial<MemberRegistration>): Promise<boolean> => {
      if (!profile) return false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("member_registrations")
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", profile.id);

      if (error) {
        console.error("Error updating member info:", error);
        return false;
      }

      // Refresh member info
      await fetchMemberInfo();
      return true;
    },
    [supabase, profile, fetchMemberInfo]
  );

  return {
    memberInfo,
    loading,
    fetchMemberInfo,
    updateMemberInfo,
  };
}

// Registration function for creating new members
export async function registerMember(
  email: string,
  password: string,
  fullName: string,
  phone: string | null,
  memberType: MemberType,
  handicap: number | null,
  preferredTee: PreferredTee,
  wantsUpdates: boolean
): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient();

  // 1. Create the auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: "member",
      },
    },
  });

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!authData.user) {
    return { success: false, error: "Failed to create user account" };
  }

  // 2. Wait briefly for the trigger to create the profile
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 3. Update the profile with role and phone
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: profileError } = await (supabase as any)
    .from("profiles")
    .update({
      role: "member",
      phone: phone || null,
      full_name: fullName,
    })
    .eq("id", authData.user.id);

  if (profileError) {
    console.error("Error updating profile:", profileError);
    // Continue anyway - profile should exist from trigger
  }

  // 4. Create the member registration record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: memberError } = await (supabase as any)
    .from("member_registrations")
    .insert({
      user_id: authData.user.id,
      member_type: memberType,
      handicap: handicap,
      preferred_tee: preferredTee,
      wants_updates: wantsUpdates,
    });

  if (memberError) {
    console.error("Error creating member registration:", memberError);
    return { success: false, error: "Account created but registration failed. Please contact support." };
  }

  return { success: true, error: null };
}
