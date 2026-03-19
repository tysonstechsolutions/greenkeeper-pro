"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  UserPlus,
  Copy,
  Check,
  Trash2,
  Loader2,
  AlertCircle,
  Clock,
  Mail,
  Users,
} from "lucide-react";
import type { Invite, InviteRole } from "@/types/database";

const roleOptions: { value: InviteRole; label: string; description: string }[] = [
  {
    value: "asst_super",
    label: "Assistant Superintendent",
    description: "Full management access, can create invites",
  },
  {
    value: "foreman",
    label: "Foreman / Crew Lead",
    description: "Can assign tasks, approve timesheets",
  },
  {
    value: "mechanic",
    label: "Mechanic / Equipment Tech",
    description: "Equipment management, maintenance logs",
  },
  {
    value: "crew",
    label: "Crew Member",
    description: "View and complete assigned tasks",
  },
  {
    value: "seasonal",
    label: "Seasonal / Part-Time",
    description: "Limited access for temporary staff",
  },
];

export default function InvitePage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, canCreateInvites } = useAuth();

  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [selectedRole, setSelectedRole] = useState<InviteRole>("crew");
  const [inviteEmail, setInviteEmail] = useState("");

  const supabase = createClient();

  useEffect(() => {
    if (!authLoading && !canCreateInvites) {
      router.push("/dashboard");
      return;
    }

    async function fetchInvites() {
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("invites")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Error fetching invites:", fetchError);
        setError("Failed to load invites");
      } else {
        setInvites(data as Invite[]);
      }
      setLoading(false);
    }

    if (user && canCreateInvites) {
      fetchInvites();
    }
  }, [user, authLoading, canCreateInvites, router, supabase]);

  const createInvite = async () => {
    if (!profile) return;

    setCreating(true);
    setError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: createError } = await (supabase.from("invites") as any)
      .insert({
        role: selectedRole,
        email: inviteEmail || null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating invite:", createError);
      setError("Failed to create invite");
      setCreating(false);
      return;
    }

    setInvites([data as Invite, ...invites]);
    setInviteEmail("");
    setCreating(false);
  };

  const deleteInvite = async (inviteId: string) => {
    const { error: deleteError } = await supabase
      .from("invites")
      .delete()
      .eq("id", inviteId);

    if (deleteError) {
      console.error("Error deleting invite:", deleteError);
      setError("Failed to delete invite");
      return;
    }

    setInvites(invites.filter((inv) => inv.id !== inviteId));
  };

  const copyInviteLink = async (token: string, inviteId: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(inviteId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getInviteStatus = (invite: Invite) => {
    if (invite.used_by) {
      return { label: "Used", color: "text-muted-foreground bg-muted" };
    }
    if (new Date(invite.expires_at) < new Date()) {
      return { label: "Expired", color: "text-destructive bg-destructive/10" };
    }
    return { label: "Active", color: "text-primary bg-primary/10" };
  };

  const formatExpiry = (expiresAt: string) => {
    const date = new Date(expiresAt);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return "Expired";
    if (days === 0) return "Expires today";
    if (days === 1) return "Expires tomorrow";
    return `Expires in ${days} days`;
  };

  if (authLoading || loading) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canCreateInvites) {
    return null;
  }

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Team Invites"
        description="Invite new staff members to GreenKeeper Pro"
        icon={UserPlus}
      />

      {error && (
        <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-destructive/10 text-destructive text-sm max-w-2xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Create Invite Form */}
      <div className="bg-card rounded-xl border border-border p-6 mb-8 max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">Create New Invite</h2>

        <div className="space-y-4">
          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Role</label>
            <div className="grid gap-2">
              {roleOptions.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => setSelectedRole(role.value)}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                    selectedRole === role.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div
                    className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center ${
                      selectedRole === role.value
                        ? "border-primary"
                        : "border-muted-foreground"
                    }`}
                  >
                    {selectedRole === role.value && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium">{role.label}</div>
                    <div className="text-sm text-muted-foreground">
                      {role.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Email (Optional) */}
          <div>
            <label htmlFor="inviteEmail" className="block text-sm font-medium mb-1.5">
              Email Address <span className="text-muted-foreground">(optional)</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="newmember@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              If provided, the invite will be locked to this email address.
            </p>
          </div>

          <Button onClick={createInvite} disabled={creating} className="w-full sm:w-auto">
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Create Invite Link
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Existing Invites */}
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Recent Invites</h2>
        </div>

        {invites.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center">
            <UserPlus className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No invites created yet.</p>
            <p className="text-sm text-muted-foreground">
              Create an invite above to add team members.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {invites.map((invite) => {
              const status = getInviteStatus(invite);
              const isUsed = !!invite.used_by;
              const isExpired = new Date(invite.expires_at) < new Date();
              const canCopy = !isUsed && !isExpired;

              return (
                <div
                  key={invite.id}
                  className="bg-card rounded-lg border border-border p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {roleOptions.find((r) => r.value === invite.role)?.label}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </div>

                      {invite.email && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                          <Mail className="w-3.5 h-3.5" />
                          <span>{invite.email}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatExpiry(invite.expires_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {canCopy && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyInviteLink(invite.token, invite.id)}
                        >
                          {copiedId === invite.id ? (
                            <>
                              <Check className="w-4 h-4 mr-1" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4 mr-1" />
                              Copy Link
                            </>
                          )}
                        </Button>
                      )}

                      {!isUsed && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteInvite(invite.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
