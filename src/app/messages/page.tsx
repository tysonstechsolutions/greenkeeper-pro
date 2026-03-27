"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useChannels, type ChannelWithDetails } from "@/lib/hooks/useChannels";
import { useMessages, type MessageWithSender } from "@/lib/hooks/useMessages";
import { useProfiles, getDisplayName, getInitials, roleLabels } from "@/lib/hooks/useProfiles";
import { useTasks } from "@/lib/hooks/useTasks";
import { createClient } from "@/lib/supabase/client";
import { formatTimeAgo } from "@/lib/hooks/useNotifications";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronRight,
  Edit2,
  Hash,
  MoreVertical,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Settings,
  Trash2,
  User,
  Users,
  X,
  Check,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ============================================================================
// TYPES
// ============================================================================

interface ChannelMemberInfo {
  user_id: string;
  full_name: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <MessagesPageContent />
    </Suspense>
  );
}

function MessagesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, isSuper, loading: authLoading } = useAuth();

  // Channel and message state
  const {
    channels,
    totalUnread,
    loading: channelsLoading,
    createChannel,
    createDirectChannel,
    updateChannel,
    deleteChannel,
    addMembers,
    removeMember,
    markAsRead,
    getChannel,
  } = useChannels();

  const {
    messages,
    loading: messagesLoading,
    hasMore,
    fetchMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    pinMessage,
    unpinMessage,
    clearMessages,
  } = useMessages();

  const { profiles } = useProfiles();
  const { tasks, fetchTasks } = useTasks();

  // UI State
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [showMobileConversation, setShowMobileConversation] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Modal states
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [newMessageType, setNewMessageType] = useState<"dm" | "group" | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [dmSearchQuery, setDmSearchQuery] = useState("");

  // Channel settings
  const [showMembersSheet, setShowMembersSheet] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [editChannelName, setEditChannelName] = useState("");

  // Task picker
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [taskSearchQuery, setTaskSearchQuery] = useState("");

  // Message editing
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  // Collapsed sections
  const [dmCollapsed, setDmCollapsed] = useState(false);
  const [channelsCollapsed, setChannelsCollapsed] = useState(false);

  // Channel members cache
  const [channelMembers, setChannelMembers] = useState<ChannelMemberInfo[]>([]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  // ============================================================================
  // DERIVED DATA
  // ============================================================================

  const activeChannel = useMemo(() => {
    return activeChannelId ? getChannel(activeChannelId) : null;
  }, [activeChannelId, getChannel]);

  const dmChannels = useMemo(() => {
    return channels.filter((c) => c.channel_type === "direct");
  }, [channels]);

  const groupChannels = useMemo(() => {
    return channels.filter((c) => c.channel_type !== "direct");
  }, [channels]);

  const filteredChannels = useMemo(() => {
    if (!searchQuery) return { dms: dmChannels, groups: groupChannels };

    const query = searchQuery.toLowerCase();
    return {
      dms: dmChannels.filter((c) => c.name.toLowerCase().includes(query)),
      groups: groupChannels.filter((c) => c.name.toLowerCase().includes(query)),
    };
  }, [dmChannels, groupChannels, searchQuery]);

  // Filter profiles for DM selection (exclude current user)
  const availableDMProfiles = useMemo(() => {
    const query = dmSearchQuery.toLowerCase();
    return profiles
      .filter((p) => p.id !== user?.id)
      .filter(
        (p) =>
          p.full_name.toLowerCase().includes(query) ||
          (p.display_name && p.display_name.toLowerCase().includes(query))
      );
  }, [profiles, user?.id, dmSearchQuery]);

  // Filter tasks for task picker
  const filteredTasks = useMemo(() => {
    const query = taskSearchQuery.toLowerCase();
    return tasks
      .filter((t) => t.status !== "completed" && t.status !== "cancelled")
      .filter((t) => t.title.toLowerCase().includes(query))
      .slice(0, 20);
  }, [tasks, taskSearchQuery]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Handle URL channel parameter
  useEffect(() => {
    const channelId = searchParams.get("channel");
    if (channelId && channels.length > 0) {
      const channel = channels.find((c) => c.id === channelId);
      if (channel) {
        setActiveChannelId(channelId);
        setShowMobileConversation(true);
      }
    }
  }, [searchParams, channels]);

  // Fetch channel members when active channel changes
  useEffect(() => {
    if (!activeChannelId) {
      setChannelMembers([]);
      return;
    }

    const fetchMembers = async () => {
      const { data } = await supabase
        .from("channel_members")
        .select(
          `
          user_id,
          profiles:user_id (
            full_name,
            display_name,
            avatar_url,
            role
          )
        `
        )
        .eq("channel_id", activeChannelId);

      if (data) {
        const members = data.map((m: { user_id: string; profiles: { full_name: string | null; display_name: string | null; avatar_url: string | null; role: string | null } | null }) => ({
          user_id: m.user_id,
          full_name: m.profiles?.full_name || "Unknown",
          display_name: m.profiles?.display_name || null,
          avatar_url: m.profiles?.avatar_url || null,
          role: m.profiles?.role || "crew",
        }));
        setChannelMembers(members);
      }
    };

    fetchMembers();
  }, [activeChannelId, supabase]);

  // Load messages when channel changes
  useEffect(() => {
    if (activeChannelId) {
      fetchMessages(activeChannelId);
      markAsRead(activeChannelId);
    }
  }, [activeChannelId, fetchMessages, markAsRead]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Fetch tasks for task picker
  useEffect(() => {
    if (showTaskPicker) {
      fetchTasks({ includeCompleted: false });
    }
  }, [showTaskPicker, fetchTasks]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      setActiveChannelId(channelId);
      setShowMobileConversation(true);
      clearMessages();
      router.push(`/messages?channel=${channelId}`, { scroll: false });
    },
    [clearMessages, router]
  );

  const handleBackToList = useCallback(() => {
    setShowMobileConversation(false);
    setActiveChannelId(null);
    router.push("/messages", { scroll: false });
  }, [router]);

  const handleSendMessage = useCallback(async () => {
    if (!activeChannelId || !messageInput.trim() || isSending) return;

    setIsSending(true);
    try {
      await sendMessage(activeChannelId, messageInput.trim());
      setMessageInput("");
      messageInputRef.current?.focus();
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSending(false);
    }
  }, [activeChannelId, messageInput, isSending, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const handleLoadMore = useCallback(() => {
    if (!activeChannelId || messagesLoading || !hasMore || messages.length === 0) return;
    const oldestMessage = messages[0];
    fetchMessages(activeChannelId, 50, oldestMessage.created_at);
  }, [activeChannelId, messagesLoading, hasMore, messages, fetchMessages]);

  // New Message Modal handlers
  const handleStartDM = useCallback(
    async (userId: string) => {
      const channel = await createDirectChannel(userId);
      if (channel) {
        setShowNewMessageModal(false);
        setNewMessageType(null);
        setDmSearchQuery("");
        handleSelectChannel(channel.id);
      }
    },
    [createDirectChannel, handleSelectChannel]
  );

  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return;

    const channel = await createChannel(newGroupName.trim(), "group", selectedMembers);
    if (channel) {
      setShowNewMessageModal(false);
      setNewMessageType(null);
      setNewGroupName("");
      setSelectedMembers([]);
      handleSelectChannel(channel.id);
    }
  }, [newGroupName, selectedMembers, createChannel, handleSelectChannel]);

  const handleToggleMember = useCallback((userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }, []);

  // Channel settings handlers
  const handleUpdateChannelName = useCallback(async () => {
    if (!activeChannelId || !editChannelName.trim()) return;
    await updateChannel(activeChannelId, { name: editChannelName.trim() });
    setShowChannelSettings(false);
  }, [activeChannelId, editChannelName, updateChannel]);

  const handleDeleteChannel = useCallback(async () => {
    if (!activeChannelId) return;
    const confirmed = window.confirm(
      "Are you sure you want to delete this channel? This action cannot be undone."
    );
    if (confirmed) {
      await deleteChannel(activeChannelId);
      setShowChannelSettings(false);
      handleBackToList();
    }
  }, [activeChannelId, deleteChannel, handleBackToList]);

  const handleAddMembers = useCallback(async () => {
    if (!activeChannelId || selectedMembers.length === 0) return;
    await addMembers(activeChannelId, selectedMembers);
    setShowAddMemberModal(false);
    setSelectedMembers([]);
    // Refresh member list
    const { data } = await supabase
      .from("channel_members")
      .select(
        `
        user_id,
        profiles:user_id (full_name, display_name, avatar_url, role)
      `
      )
      .eq("channel_id", activeChannelId);

    if (data) {
      const members = data.map((m: { user_id: string; profiles: { full_name: string | null; display_name: string | null; avatar_url: string | null; role: string | null } | null }) => ({
        user_id: m.user_id,
        full_name: m.profiles?.full_name || "Unknown",
        display_name: m.profiles?.display_name || null,
        avatar_url: m.profiles?.avatar_url || null,
        role: m.profiles?.role || "crew",
      }));
      setChannelMembers(members);
    }
  }, [activeChannelId, selectedMembers, addMembers, supabase]);

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      if (!activeChannelId) return;
      await removeMember(activeChannelId, userId);
      setChannelMembers((prev) => prev.filter((m) => m.user_id !== userId));
    },
    [activeChannelId, removeMember]
  );

  // Message actions
  const handleEditMessage = useCallback(
    async (messageId: string) => {
      if (!editingContent.trim()) return;
      await editMessage(messageId, editingContent.trim());
      setEditingMessageId(null);
      setEditingContent("");
    },
    [editingContent, editMessage]
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      await deleteMessage(messageId);
    },
    [deleteMessage]
  );

  const handlePinMessage = useCallback(
    async (messageId: string, isPinned: boolean) => {
      if (isPinned) {
        await unpinMessage(messageId);
      } else {
        await pinMessage(messageId);
      }
    },
    [pinMessage, unpinMessage]
  );

  // Task reference
  const handleSelectTask = useCallback(
    async (taskId: string, taskTitle: string) => {
      if (!activeChannelId) return;
      await sendMessage(activeChannelId, taskTitle, "task_ref", taskId);
      setShowTaskPicker(false);
      setTaskSearchQuery("");
    },
    [activeChannelId, sendMessage]
  );

  // Photo upload
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeChannelId) return;

      // Upload to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `messages/${activeChannelId}/${fileName}`;

      setIsSending(true);
      try {
        const { error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(filePath, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("attachments").getPublicUrl(filePath);

        await sendMessage(activeChannelId, publicUrl, "photo");
      } catch (err) {
        console.error("Failed to upload file:", err);
      } finally {
        setIsSending(false);
        if (e.target) e.target.value = "";
      }
    },
    [activeChannelId, sendMessage, supabase]
  );

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderChannelItem = (channel: ChannelWithDetails) => {
    const isActive = channel.id === activeChannelId;
    const isDM = channel.channel_type === "direct";

    // For DMs, extract the other person's name from the channel name
    const displayName = channel.name;

    return (
      <button
        key={channel.id}
        onClick={() => handleSelectChannel(channel.id)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left",
          isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"
        )}
      >
        {isDM ? (
          <div className="relative">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-muted text-xs">
                {getInitials(displayName.split(" & ")[1] || displayName)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
          </div>
        ) : (
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            {channel.channel_type === "announcement" ? (
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Hash className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "font-medium truncate",
                channel.unread_count > 0 && "font-semibold"
              )}
            >
              {isDM ? displayName.split(" & ")[1] || displayName : displayName}
            </span>
            {channel.unread_count > 0 && (
              <Badge variant="default" className="h-5 min-w-5 px-1.5 text-xs">
                {channel.unread_count}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{channel.last_message_preview || "No messages yet"}</span>
            {channel.last_message_at && (
              <>
                <span>·</span>
                <span className="shrink-0">{formatTimeAgo(channel.last_message_at)}</span>
              </>
            )}
          </div>
        </div>

        {!isDM && (
          <span className="text-xs text-muted-foreground">{channel.member_count}</span>
        )}
      </button>
    );
  };

  const renderMessage = (message: MessageWithSender, index: number) => {
    const isOwnMessage = message.sender_id === user?.id;
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const showSenderInfo =
      !prevMessage ||
      prevMessage.sender_id !== message.sender_id ||
      new Date(message.created_at).getTime() - new Date(prevMessage.created_at).getTime() >
        5 * 60 * 1000;

    const isEditing = editingMessageId === message.id;

    return (
      <div
        key={message.id}
        className={cn(
          "group flex gap-3 px-4",
          isOwnMessage ? "flex-row-reverse" : "",
          showSenderInfo ? "mt-4" : "mt-1"
        )}
      >
        {showSenderInfo && !isOwnMessage && (
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={message.sender?.avatar_url || undefined} />
            <AvatarFallback className="text-xs">
              {getInitials(message.sender?.full_name || "?")}
            </AvatarFallback>
          </Avatar>
        )}

        {!showSenderInfo && !isOwnMessage && <div className="w-8 shrink-0" />}

        <div className={cn("flex flex-col max-w-[70%]", isOwnMessage ? "items-end" : "items-start")}>
          {showSenderInfo && !isOwnMessage && (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">
                {message.sender?.display_name || message.sender?.full_name || "Unknown"}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTimeAgo(message.created_at)}
              </span>
            </div>
          )}

          <div
            className={cn(
              "relative rounded-2xl px-4 py-2",
              isOwnMessage
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-muted rounded-bl-sm",
              message.is_pinned && "ring-2 ring-amber-400"
            )}
          >
            {message.is_pinned && (
              <Pin className="absolute -top-2 -right-2 h-4 w-4 text-amber-500 fill-amber-500" />
            )}

            {isEditing ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  className="bg-background text-foreground"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleEditMessage(message.id);
                    if (e.key === "Escape") {
                      setEditingMessageId(null);
                      setEditingContent("");
                    }
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingMessageId(null);
                      setEditingContent("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => handleEditMessage(message.id)}>
                    Save
                  </Button>
                </div>
              </div>
            ) : message.message_type === "photo" ? (
              <a href={message.content} target="_blank" rel="noopener noreferrer">
                <img
                  src={message.content}
                  alt="Photo"
                  className="max-w-[300px] max-h-[200px] rounded-lg object-cover"
                />
              </a>
            ) : message.message_type === "task_ref" && message.reference_id ? (
              <Link
                href={`/tasks/${message.reference_id}`}
                className="flex items-center gap-2 p-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors"
              >
                <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <div className="text-sm font-medium">{message.content}</div>
              </Link>
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
            )}

            {message.edited_at && !isEditing && (
              <span className="text-xs opacity-60 ml-2">(edited)</span>
            )}
          </div>

          {showSenderInfo && isOwnMessage && (
            <span className="text-xs text-muted-foreground mt-1">
              {formatTimeAgo(message.created_at)}
            </span>
          )}
        </div>

        {/* Quick actions on hover */}
        <div
          className={cn(
            "opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1",
            isOwnMessage ? "order-first" : ""
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwnMessage ? "end" : "start"}>
              {isOwnMessage && (
                <DropdownMenuItem
                  onClick={() => {
                    setEditingMessageId(message.id);
                    setEditingContent(message.content);
                  }}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => handlePinMessage(message.id, message.is_pinned)}
              >
                {message.is_pinned ? (
                  <>
                    <PinOff className="h-4 w-4 mr-2" />
                    Unpin
                  </>
                ) : (
                  <>
                    <Pin className="h-4 w-4 mr-2" />
                    Pin
                  </>
                )}
              </DropdownMenuItem>
              {(isOwnMessage || isSuper) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDeleteMessage(message.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (authLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ================================================================== */}
      {/* LEFT PANEL - CHANNEL LIST */}
      {/* ================================================================== */}
      <div
        className={cn(
          "w-full md:w-[320px] md:min-w-[320px] border-r flex flex-col bg-background",
          showMobileConversation && "hidden md:flex"
        )}
      >
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">Messages</h1>
            {totalUnread > 0 && (
              <Badge variant="default">{totalUnread}</Badge>
            )}
          </div>

          <Button
            className="w-full"
            onClick={() => setShowNewMessageModal(true)}
          >
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            New Message
          </Button>
        </div>

        {/* Search */}
        <div className="p-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Channel List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {/* Direct Messages Section */}
            <div className="mb-4">
              <button
                onClick={() => setDmCollapsed(!dmCollapsed)}
                className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full"
              >
                {dmCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Direct Messages
                {filteredChannels.dms.length > 0 && (
                  <span className="ml-auto text-muted-foreground">
                    {filteredChannels.dms.length}
                  </span>
                )}
              </button>

              {!dmCollapsed && (
                <div className="mt-1 space-y-0.5">
                  {channelsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </div>
                    ))
                  ) : filteredChannels.dms.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      No direct messages
                    </p>
                  ) : (
                    filteredChannels.dms.map(renderChannelItem)
                  )}
                </div>
              )}
            </div>

            {/* Channels Section */}
            <div>
              <button
                onClick={() => setChannelsCollapsed(!channelsCollapsed)}
                className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full"
              >
                {channelsCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Channels
                {filteredChannels.groups.length > 0 && (
                  <span className="ml-auto text-muted-foreground">
                    {filteredChannels.groups.length}
                  </span>
                )}
              </button>

              {!channelsCollapsed && (
                <div className="mt-1 space-y-0.5">
                  {channelsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </div>
                    ))
                  ) : filteredChannels.groups.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No channels</p>
                  ) : (
                    filteredChannels.groups.map(renderChannelItem)
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* ================================================================== */}
      {/* RIGHT PANEL - CONVERSATION */}
      {/* ================================================================== */}
      <div
        className={cn(
          "flex-1 flex flex-col bg-background",
          !showMobileConversation && "hidden md:flex"
        )}
      >
        {!activeChannel ? (
          // Empty state
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <MessageCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Start a conversation</h2>
            <p className="text-muted-foreground mb-4">
              Message your team and keep everyone in the loop.
            </p>
            <Button onClick={() => setShowNewMessageModal(true)}>
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              New Message
            </Button>
          </div>
        ) : (
          <>
            {/* Conversation Header */}
            <div className="h-16 px-4 border-b flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={handleBackToList}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>

                {activeChannel.channel_type === "direct" ? (
                  <Avatar className="h-9 w-9">
                    <AvatarImage
                      src={channelMembers.find((m) => m.user_id !== user?.id)?.avatar_url || undefined}
                    />
                    <AvatarFallback>
                      {getInitials(
                        channelMembers.find((m) => m.user_id !== user?.id)?.full_name || "?"
                      )}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <Hash className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}

                <div>
                  <h2 className="font-semibold">
                    {activeChannel.channel_type === "direct"
                      ? channelMembers.find((m) => m.user_id !== user?.id)?.display_name ||
                        channelMembers.find((m) => m.user_id !== user?.id)?.full_name ||
                        "Direct Message"
                      : activeChannel.name}
                  </h2>
                  <button
                    onClick={() => setShowMembersSheet(true)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {activeChannel.member_count} members
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setShowMembersSheet(true)}>
                  <Users className="h-5 w-5" />
                </Button>

                {isSuper && activeChannel.channel_type !== "direct" && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => setShowAddMemberModal(true)}>
                      <Plus className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditChannelName(activeChannel.name);
                        setShowChannelSettings(true);
                      }}
                    >
                      <Settings className="h-5 w-5" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1">
              <div className="py-4">
                {/* Load more button */}
                {hasMore && (
                  <div className="flex justify-center py-2 mb-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLoadMore}
                      disabled={messagesLoading}
                    >
                      {messagesLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Load older messages
                    </Button>
                  </div>
                )}

                {messagesLoading && messages.length === 0 ? (
                  <div className="space-y-4 px-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                        <div>
                          <Skeleton className="h-4 w-24 mb-2" />
                          <Skeleton className="h-16 w-64 rounded-2xl" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No messages yet. Say hello!</p>
                  </div>
                ) : (
                  messages.map(renderMessage)
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Composer */}
            <div className="p-4 border-t shrink-0">
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={messageInputRef}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => activeChannelId && markAsRead(activeChannelId)}
                    placeholder="Type a message..."
                    className="w-full resize-none rounded-xl border bg-muted/50 px-4 py-3 pr-24 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[48px] max-h-[120px]"
                    rows={1}
                    style={{
                      height: "auto",
                      minHeight: "48px",
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = Math.min(target.scrollHeight, 120) + "px";
                    }}
                  />

                  <div className="absolute right-2 bottom-2 flex items-center gap-1">
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <Camera className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowTaskPicker(true)}
                    >
                      <Hash className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                <Button
                  size="icon"
                  className="h-12 w-12 rounded-xl shrink-0"
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || isSending}
                >
                  {isSending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ================================================================== */}
      {/* MODALS & SHEETS */}
      {/* ================================================================== */}

      {/* New Message Modal */}
      <Dialog open={showNewMessageModal} onOpenChange={setShowNewMessageModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>Start a conversation with your team</DialogDescription>
          </DialogHeader>

          {!newMessageType ? (
            <div className="grid gap-3 py-4">
              <button
                onClick={() => setNewMessageType("dm")}
                className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted transition-colors text-left"
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Direct Message</h3>
                  <p className="text-sm text-muted-foreground">
                    Private conversation with one person
                  </p>
                </div>
              </button>

              <button
                onClick={() => setNewMessageType("group")}
                className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted transition-colors text-left"
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">New Group</h3>
                  <p className="text-sm text-muted-foreground">
                    Create a channel for multiple people
                  </p>
                </div>
              </button>
            </div>
          ) : newMessageType === "dm" ? (
            <div className="py-4">
              <Command className="rounded-lg border">
                <CommandInput
                  placeholder="Search team members..."
                  value={dmSearchQuery}
                  onValueChange={setDmSearchQuery}
                />
                <CommandList>
                  <CommandEmpty>No team members found.</CommandEmpty>
                  <CommandGroup>
                    {availableDMProfiles.map((p) => (
                      <CommandItem
                        key={p.id}
                        onSelect={() => handleStartDM(p.id)}
                        className="cursor-pointer"
                      >
                        <Avatar className="h-8 w-8 mr-3">
                          <AvatarImage src={p.avatar_url || undefined} />
                          <AvatarFallback>{getInitials(p.full_name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <span className="font-medium">{getDisplayName(p)}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {roleLabels[p.role]}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>

              <Button
                variant="ghost"
                className="mt-4 w-full"
                onClick={() => setNewMessageType(null)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="group-name">Group Name</Label>
                <Input
                  id="group-name"
                  placeholder="e.g., Greens Team"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>Members</Label>
                <ScrollArea className="h-64 mt-1.5 border rounded-lg">
                  <div className="p-2 space-y-1">
                    {profiles
                      .filter((p) => p.id !== user?.id)
                      .map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedMembers.includes(p.id)}
                            onCheckedChange={() => handleToggleMember(p.id)}
                          />
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={p.avatar_url || undefined} />
                            <AvatarFallback>{getInitials(p.full_name)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <span className="font-medium text-sm">{getDisplayName(p)}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {roleLabels[p.role]}
                            </span>
                          </div>
                        </label>
                      ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setNewMessageType(null);
                    setSelectedMembers([]);
                    setNewGroupName("");
                  }}
                >
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!newGroupName.trim() || selectedMembers.length === 0}
                  onClick={handleCreateGroup}
                >
                  Create Group
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Members Sheet */}
      <Sheet open={showMembersSheet} onOpenChange={setShowMembersSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Channel Members</SheetTitle>
            <SheetDescription>
              {activeChannel?.member_count} members in this channel
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-10rem)] mt-6">
            <div className="space-y-2">
              {channelMembers.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback>{getInitials(member.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-medium">
                      {member.display_name || member.full_name}
                      {member.user_id === user?.id && (
                        <span className="text-xs text-muted-foreground ml-2">(you)</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {roleLabels[member.role as keyof typeof roleLabels] || member.role}
                    </div>
                  </div>

                  {isSuper &&
                    member.user_id !== user?.id &&
                    activeChannel?.channel_type !== "direct" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemoveMember(member.user_id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Add Member Modal */}
      <Dialog open={showAddMemberModal} onOpenChange={setShowAddMemberModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Members</DialogTitle>
            <DialogDescription>Add team members to this channel</DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-64 border rounded-lg">
            <div className="p-2 space-y-1">
              {profiles
                .filter((p) => !channelMembers.some((m) => m.user_id === p.id))
                .map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedMembers.includes(p.id)}
                      onCheckedChange={() => handleToggleMember(p.id)}
                    />
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={p.avatar_url || undefined} />
                      <AvatarFallback>{getInitials(p.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <span className="font-medium text-sm">{getDisplayName(p)}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {roleLabels[p.role]}
                      </span>
                    </div>
                  </label>
                ))}
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddMemberModal(false);
                setSelectedMembers([]);
              }}
            >
              Cancel
            </Button>
            <Button disabled={selectedMembers.length === 0} onClick={handleAddMembers}>
              Add {selectedMembers.length > 0 && `(${selectedMembers.length})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Channel Settings Modal */}
      <Dialog open={showChannelSettings} onOpenChange={setShowChannelSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Channel Settings</DialogTitle>
            <DialogDescription>Manage channel name and settings</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-name">Channel Name</Label>
              <Input
                id="edit-name"
                value={editChannelName}
                onChange={(e) => setEditChannelName(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <Button className="w-full" onClick={handleUpdateChannelName}>
              Save Changes
            </Button>

            <div className="border-t pt-4">
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleDeleteChannel}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Channel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Picker Modal */}
      <Dialog open={showTaskPicker} onOpenChange={setShowTaskPicker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link a Task</DialogTitle>
            <DialogDescription>Share a task reference in the chat</DialogDescription>
          </DialogHeader>

          <Command className="rounded-lg border">
            <CommandInput
              placeholder="Search tasks..."
              value={taskSearchQuery}
              onValueChange={setTaskSearchQuery}
            />
            <CommandList>
              <CommandEmpty>No tasks found.</CommandEmpty>
              <CommandGroup>
                {filteredTasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    onSelect={() => handleSelectTask(task.id, task.title)}
                    className="cursor-pointer"
                  >
                    <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center mr-3">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{task.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {task.status} · {task.priority}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}
