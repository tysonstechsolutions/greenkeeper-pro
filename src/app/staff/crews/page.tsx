"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  UserPlus,
  UserMinus,
  ChevronLeft,
  Loader2,
  AlertTriangle,
  X,
  Crown,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { useCrews, type Crew } from "@/lib/hooks/useCrews";
import { useProfiles, roleLabels, roleColors, getDisplayName, getInitials } from "@/lib/hooks/useProfiles";

export default function CrewsPage() {
  const router = useRouter();
  const { profile: currentUser, loading: authLoading, isSuper } = useAuth();
  const {
    crews,
    loading: crewsLoading,
    error: crewsError,
    createCrew,
    deleteCrew,
    renameCrew,
    setCrewForeman,
    addMemberToCrew,
    removeMemberFromCrew,
  } = useCrews();
  const { loading: profilesLoading, foremen, allStaff } = useProfiles();

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  // Form states
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewForeman, setNewCrewForeman] = useState("");
  const [selectedCrew, setSelectedCrew] = useState<Crew | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [selectedMember, setSelectedMember] = useState("");

  // Action states
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [settingForeman, setSettingForeman] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Check authorization
  useEffect(() => {
    if (!authLoading && currentUser && !isSuper) {
      router.push("/dashboard");
    }
  }, [authLoading, currentUser, isSuper, router]);

  // Create crew handler
  const handleCreateCrew = async () => {
    if (!newCrewName.trim()) return;
    setCreating(true);
    setActionError(null);

    const success = await createCrew(newCrewName.trim(), newCrewForeman || undefined);

    if (success) {
      setShowCreateModal(false);
      setNewCrewName("");
      setNewCrewForeman("");
    } else {
      setActionError("Failed to create crew");
    }

    setCreating(false);
  };

  // Delete crew handler
  const handleDeleteCrew = async () => {
    if (!selectedCrew) return;
    setDeleting(true);
    setActionError(null);

    const success = await deleteCrew(selectedCrew.name);

    if (success) {
      setShowDeleteModal(false);
      setSelectedCrew(null);
    } else {
      setActionError("Failed to delete crew");
    }

    setDeleting(false);
  };

  // Rename crew handler
  const handleRenameCrew = async () => {
    if (!selectedCrew || !renameValue.trim()) return;
    setRenaming(true);
    setActionError(null);

    const success = await renameCrew(selectedCrew.name, renameValue.trim());

    if (success) {
      setShowRenameModal(false);
      setSelectedCrew(null);
      setRenameValue("");
    } else {
      setActionError("Failed to rename crew");
    }

    setRenaming(false);
  };

  // Set foreman handler
  const handleSetForeman = async (crewName: string, foremanId: string | null) => {
    setSettingForeman(crewName);
    setActionError(null);

    await setCrewForeman(crewName, foremanId);

    setSettingForeman(null);
  };

  // Add member handler
  const handleAddMember = async () => {
    if (!selectedCrew || !selectedMember) return;
    setAddingMember(true);
    setActionError(null);

    const success = await addMemberToCrew(selectedMember, selectedCrew.name);

    if (success) {
      setShowAddMemberModal(false);
      setSelectedMember("");
    } else {
      setActionError("Failed to add member");
    }

    setAddingMember(false);
  };

  // Remove member handler
  const handleRemoveMember = async (userId: string) => {
    setRemovingMember(userId);
    setActionError(null);

    await removeMemberFromCrew(userId);

    setRemovingMember(null);
  };

  // Get staff not in any crew (for add member modal)
  const getAvailableStaff = useCallback(() => {
    if (!selectedCrew) return allStaff;

    const memberIds = new Set(selectedCrew.members.map((m) => m.id));
    return allStaff.filter((s) => !memberIds.has(s.id));
  }, [selectedCrew, allStaff]);

  // Open rename modal
  const openRenameModal = (crew: Crew) => {
    setSelectedCrew(crew);
    setRenameValue(crew.name);
    setShowRenameModal(true);
    setActionError(null);
  };

  // Open delete modal
  const openDeleteModal = (crew: Crew) => {
    setSelectedCrew(crew);
    setShowDeleteModal(true);
    setActionError(null);
  };

  // Open add member modal
  const openAddMemberModal = (crew: Crew) => {
    setSelectedCrew(crew);
    setSelectedMember("");
    setShowAddMemberModal(true);
    setActionError(null);
  };

  // Auth check - show nothing while loading
  if (authLoading || crewsLoading || profilesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser || !isSuper) {
    return null;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 pb-24 md:pb-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Link
            href="/staff"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Staff
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Crew Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {crews.length} crew{crews.length !== 1 ? "s" : ""} configured
          </p>
        </div>

        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Crew
        </Button>
      </div>

      {/* Error display */}
      {crewsError && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          {crewsError}
        </div>
      )}

      {/* Crews list */}
      {crews.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">No crews configured yet</p>
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Your First Crew
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {crews.map((crew) => (
            <div
              key={crew.name}
              className="bg-card rounded-lg border border-border overflow-hidden"
            >
              {/* Crew header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">{crew.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {crew.member_count} member{crew.member_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openRenameModal(crew)}
                    title="Rename crew"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openDeleteModal(crew)}
                    className="text-destructive hover:text-destructive"
                    title="Delete crew"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Foreman section */}
              <div className="p-4 bg-muted/30 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium">Foreman</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={crew.foreman_id || ""}
                      onChange={(e) => handleSetForeman(crew.name, e.target.value || null)}
                      disabled={settingForeman === crew.name}
                      className="px-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">No foreman assigned</option>
                      {foremen.map((f) => (
                        <option key={f.id} value={f.id}>
                          {getDisplayName(f)}
                        </option>
                      ))}
                    </select>
                    {settingForeman === crew.name && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                  </div>
                </div>

                {crew.foreman && (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      {crew.foreman.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={crew.foreman.avatar_url}
                          alt={crew.foreman.full_name || ""}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-primary-foreground text-xs font-medium">
                          {getInitials(crew.foreman.full_name)}
                        </span>
                      )}
                    </div>
                    <span className="text-sm">{getDisplayName(crew.foreman)}</span>
                  </div>
                )}
              </div>

              {/* Members list */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Crew Members</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAddMemberModal(crew)}
                    className="gap-1"
                  >
                    <UserPlus className="w-4 h-4" />
                    Add Member
                  </Button>
                </div>

                {crew.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No members assigned to this crew
                  </p>
                ) : (
                  <div className="space-y-2">
                    {crew.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                            {member.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={member.avatar_url}
                                alt={member.full_name || ""}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-primary-foreground text-xs font-medium">
                                {getInitials(member.full_name)}
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-sm font-medium">
                              {getDisplayName(member)}
                            </span>
                            <span
                              className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                                roleColors[member.role].bg
                              } ${roleColors[member.role].text}`}
                            >
                              {roleLabels[member.role]}
                            </span>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={removingMember === member.id}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remove from crew"
                        >
                          {removingMember === member.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserMinus className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Crew Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-lg shadow-lg w-full max-w-md">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-lg">Create New Crew</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCreateModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {actionError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                  {actionError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">
                  Crew Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={newCrewName}
                  onChange={(e) => setNewCrewName(e.target.value)}
                  placeholder="e.g., Morning Crew A"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Foreman (optional)
                </label>
                <select
                  value={newCrewForeman}
                  onChange={(e) => setNewCrewForeman(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">No foreman assigned</option>
                  {foremen.map((f) => (
                    <option key={f.id} value={f.id}>
                      {getDisplayName(f)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateCrew}
                disabled={!newCrewName.trim() || creating}
                className="gap-2"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create Crew
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Crew Modal */}
      {showRenameModal && selectedCrew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-lg shadow-lg w-full max-w-md">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-lg">Rename Crew</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowRenameModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {actionError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                  {actionError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">
                  New Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="Enter new crew name"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowRenameModal(false)}
                disabled={renaming}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRenameCrew}
                disabled={!renameValue.trim() || renameValue === selectedCrew.name || renaming}
                className="gap-2"
              >
                {renaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Crew Modal */}
      {showDeleteModal && selectedCrew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-lg shadow-lg w-full max-w-md">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Delete Crew
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDeleteModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4">
              {actionError && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                  {actionError}
                </div>
              )}

              <p>
                Are you sure you want to delete <strong>{selectedCrew.name}</strong>?
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                This will remove all crew assignments. Tasks assigned to this crew will
                retain their assignment text but will need to be re-assigned.
              </p>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteCrew}
                disabled={deleting}
                className="gap-2"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete Crew
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && selectedCrew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-lg shadow-lg w-full max-w-md">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-lg">
                Add Member to {selectedCrew.name}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAddMemberModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {actionError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                  {actionError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">
                  Select Staff Member <span className="text-destructive">*</span>
                </label>
                <select
                  value={selectedMember}
                  onChange={(e) => setSelectedMember(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Choose a staff member...</option>
                  {getAvailableStaff().map((s) => (
                    <option key={s.id} value={s.id}>
                      {getDisplayName(s)} ({roleLabels[s.role]})
                    </option>
                  ))}
                </select>
              </div>

              {getAvailableStaff().length === 0 && (
                <p className="text-sm text-muted-foreground">
                  All staff members are already assigned to crews.
                </p>
              )}
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAddMemberModal(false)}
                disabled={addingMember}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddMember}
                disabled={!selectedMember || addingMember}
                className="gap-2"
              >
                {addingMember ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                Add Member
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
