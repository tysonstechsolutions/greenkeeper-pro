/**
 * Knowledge Base Hook
 *
 * Manages knowledge articles, SOPs, guides, and training materials
 * with read tracking and version control.
 *
 * SQL Schema:
 * -----------
 * CREATE TABLE knowledge_articles (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
 *   title TEXT NOT NULL,
 *   content TEXT NOT NULL,
 *   category TEXT NOT NULL CHECK (category IN (
 *     'mowing','irrigation','chemical','equipment','greens',
 *     'bunkers','landscaping','safety','admin','onboarding',
 *     'emergency','seasonal','general'
 *   )),
 *   article_type TEXT NOT NULL CHECK (article_type IN (
 *     'sop','guide','manual','checklist','reference','training'
 *   )),
 *   tags TEXT[] DEFAULT '{}',
 *   version INTEGER DEFAULT 1,
 *   is_published BOOLEAN DEFAULT true,
 *   linked_template_ids UUID[] DEFAULT '{}',
 *   attachments JSONB DEFAULT '[]',
 *   created_by UUID REFERENCES profiles(id),
 *   updated_by UUID REFERENCES profiles(id),
 *   created_at TIMESTAMPTZ DEFAULT now(),
 *   updated_at TIMESTAMPTZ DEFAULT now()
 * );
 *
 * CREATE TABLE knowledge_read_log (
 *   article_id UUID REFERENCES knowledge_articles(id) ON DELETE CASCADE,
 *   user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
 *   read_at TIMESTAMPTZ DEFAULT now(),
 *   PRIMARY KEY (article_id, user_id)
 * );
 *
 * CREATE INDEX idx_knowledge_articles_course ON knowledge_articles(course_id);
 * CREATE INDEX idx_knowledge_articles_category ON knowledge_articles(category);
 * CREATE INDEX idx_knowledge_articles_type ON knowledge_articles(article_type);
 * CREATE INDEX idx_knowledge_articles_tags ON knowledge_articles USING GIN(tags);
 * CREATE INDEX idx_knowledge_articles_search ON knowledge_articles
 *   USING GIN(to_tsvector('english', title || ' ' || content));
 */

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCourse } from "@/lib/hooks/useCourse";

// Types
export type KnowledgeCategory =
  | "mowing"
  | "irrigation"
  | "chemical"
  | "equipment"
  | "greens"
  | "bunkers"
  | "landscaping"
  | "safety"
  | "admin"
  | "onboarding"
  | "emergency"
  | "seasonal"
  | "general";

export type ArticleType =
  | "sop"
  | "guide"
  | "manual"
  | "checklist"
  | "reference"
  | "training";

export interface ArticleAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface KnowledgeArticle {
  id: string;
  course_id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  article_type: ArticleType;
  tags: string[];
  version: number;
  is_published: boolean;
  linked_template_ids: string[];
  attachments: ArticleAttachment[];
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleWithAuthor extends KnowledgeArticle {
  author?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
  updater?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
  is_read?: boolean;
  read_count?: number;
  total_staff?: number;
}

export interface ArticleFilters {
  category?: KnowledgeCategory;
  article_type?: ArticleType;
  tags?: string[];
  search?: string;
  is_published?: boolean;
  sortBy?: "title" | "updated_at" | "created_at";
  sortOrder?: "asc" | "desc";
}

export interface CreateArticleData {
  title: string;
  content: string;
  category: KnowledgeCategory;
  article_type: ArticleType;
  tags?: string[];
  is_published?: boolean;
  linked_template_ids?: string[];
  attachments?: ArticleAttachment[];
}

export interface UpdateArticleData {
  title?: string;
  content?: string;
  category?: KnowledgeCategory;
  article_type?: ArticleType;
  tags?: string[];
  is_published?: boolean;
  linked_template_ids?: string[];
  attachments?: ArticleAttachment[];
}

// Category labels
export const categoryLabels: Record<KnowledgeCategory, string> = {
  mowing: "Mowing",
  irrigation: "Irrigation",
  chemical: "Chemical Applications",
  equipment: "Equipment",
  greens: "Greens Management",
  bunkers: "Bunker Maintenance",
  landscaping: "Landscaping",
  safety: "Safety",
  admin: "Administration",
  onboarding: "Onboarding",
  emergency: "Emergency Procedures",
  seasonal: "Seasonal Operations",
  general: "General",
};

// Category colors for badges
export const categoryColors: Record<KnowledgeCategory, string> = {
  mowing: "#40916C",
  irrigation: "#2196F3",
  chemical: "#FF9800",
  equipment: "#795548",
  greens: "#4CAF50",
  bunkers: "#FFC107",
  landscaping: "#8BC34A",
  safety: "#F44336",
  admin: "#9C27B0",
  onboarding: "#00BCD4",
  emergency: "#E91E63",
  seasonal: "#FF5722",
  general: "#607D8B",
};

// Article type labels
export const articleTypeLabels: Record<ArticleType, string> = {
  sop: "SOP",
  guide: "Guide",
  manual: "Manual",
  checklist: "Checklist",
  reference: "Reference",
  training: "Training",
};

// Article type colors
export const articleTypeColors: Record<ArticleType, string> = {
  sop: "#1B4332",
  guide: "#2D6A4F",
  manual: "#40916C",
  checklist: "#52B788",
  reference: "#74C69D",
  training: "#95D5B2",
};

export function useKnowledge() {
  const { activeCourse } = useCourse();
  const supabase = createClient();

  const [articles, setArticles] = useState<ArticleWithAuthor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch articles with optional filters
   */
  const fetchArticles = useCallback(
    async (filters?: ArticleFilters): Promise<ArticleWithAuthor[]> => {
      if (!activeCourse?.id) return [];

      setLoading(true);
      setError(null);

      try {
        // Get current user for read status
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let query = supabase
          .from("knowledge_articles")
          .select(
            `
            *,
            author:profiles!knowledge_articles_created_by_fkey(id, full_name, avatar_url),
            updater:profiles!knowledge_articles_updated_by_fkey(id, full_name, avatar_url)
          `
          )
          .eq("course_id", activeCourse.id);

        // Apply filters
        if (filters?.category) {
          query = query.eq("category", filters.category);
        }

        if (filters?.article_type) {
          query = query.eq("article_type", filters.article_type);
        }

        if (filters?.is_published !== undefined) {
          query = query.eq("is_published", filters.is_published);
        } else {
          // Default to only published articles
          query = query.eq("is_published", true);
        }

        if (filters?.tags && filters.tags.length > 0) {
          query = query.contains("tags", filters.tags);
        }

        if (filters?.search) {
          query = query.or(
            `title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`
          );
        }

        // Sorting
        const sortBy = filters?.sortBy || "title";
        const sortOrder = filters?.sortOrder || "asc";
        query = query.order(sortBy, { ascending: sortOrder === "asc" });

        const { data, error: fetchError } = await query as { data: ArticleWithAuthor[] | null; error: Error | null };

        if (fetchError) throw fetchError;

        // Get read status for current user
        let readArticleIds: Set<string> = new Set();
        if (user) {
          const { data: readLog } = await supabase
            .from("knowledge_read_log")
            .select("article_id")
            .eq("user_id", user.id) as { data: { article_id: string }[] | null };

          if (readLog) {
            readArticleIds = new Set(readLog.map((r) => r.article_id));
          }
        }

        const articlesWithReadStatus = (data || []).map((article) => ({
          ...article,
          is_read: readArticleIds.has(article.id),
        }));

        setArticles(articlesWithReadStatus);
        return articlesWithReadStatus;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch articles";
        setError(message);
        console.error("Error fetching articles:", err);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [activeCourse?.id, supabase]
  );

  /**
   * Fetch a single article by ID with full details
   */
  const fetchArticle = useCallback(
    async (id: string): Promise<ArticleWithAuthor | null> => {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data, error: fetchError } = await supabase
          .from("knowledge_articles")
          .select(
            `
            *,
            author:profiles!knowledge_articles_created_by_fkey(id, full_name, avatar_url),
            updater:profiles!knowledge_articles_updated_by_fkey(id, full_name, avatar_url)
          `
          )
          .eq("id", id)
          .single() as { data: ArticleWithAuthor | null; error: Error | null };

        if (fetchError) throw fetchError;
        if (!data) throw new Error("Article not found");

        // Check if user has read this article
        let isRead = false;
        if (user) {
          const { data: readLog } = await supabase
            .from("knowledge_read_log")
            .select("read_at")
            .eq("article_id", id)
            .eq("user_id", user.id)
            .single() as { data: { read_at: string } | null };

          isRead = !!readLog;
        }

        // Get read count (for supervisors)
        const { count: readCount } = await supabase
          .from("knowledge_read_log")
          .select("*", { count: "exact", head: true })
          .eq("article_id", id) as { count: number | null };

        // Get total staff count
        const { count: totalStaff } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("active_course_id", data.course_id) as { count: number | null };

        return {
          ...data,
          is_read: isRead,
          read_count: readCount || 0,
          total_staff: totalStaff || 0,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch article";
        setError(message);
        console.error("Error fetching article:", err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Create a new article
   */
  const createArticle = useCallback(
    async (data: CreateArticleData): Promise<KnowledgeArticle | null> => {
      if (!activeCourse?.id) {
        setError("No active course selected");
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) throw new Error("Not authenticated");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: article, error: createError } = await (supabase as any)
          .from("knowledge_articles")
          .insert({
            ...data,
            course_id: activeCourse.id,
            created_by: user.id,
            version: 1,
            tags: data.tags || [],
            linked_template_ids: data.linked_template_ids || [],
            attachments: data.attachments || [],
            is_published: data.is_published ?? true,
          })
          .select()
          .single() as { data: KnowledgeArticle | null; error: Error | null };

        if (createError) throw createError;

        return article;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create article";
        setError(message);
        console.error("Error creating article:", err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [activeCourse?.id, supabase]
  );

  /**
   * Update an existing article
   */
  const updateArticle = useCallback(
    async (id: string, data: UpdateArticleData): Promise<KnowledgeArticle | null> => {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) throw new Error("Not authenticated");

        // Get current version
        const { data: current } = await supabase
          .from("knowledge_articles")
          .select("version")
          .eq("id", id)
          .single() as { data: { version: number } | null };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: article, error: updateError } = await (supabase as any)
          .from("knowledge_articles")
          .update({
            ...data,
            version: (current?.version || 1) + 1,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single() as { data: KnowledgeArticle | null; error: Error | null };

        if (updateError) throw updateError;

        return article;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update article";
        setError(message);
        console.error("Error updating article:", err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Delete (unpublish) an article
   */
  const deleteArticle = useCallback(
    async (id: string): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: deleteError } = await (supabase as any)
          .from("knowledge_articles")
          .update({ is_published: false })
          .eq("id", id) as { error: Error | null };

        if (deleteError) throw deleteError;

        // Update local state
        setArticles((prev) => prev.filter((a) => a.id !== id));

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete article";
        setError(message);
        console.error("Error deleting article:", err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Mark an article as read
   */
  const markAsRead = useCallback(
    async (articleId: string): Promise<boolean> => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: upsertError } = await (supabase as any)
          .from("knowledge_read_log")
          .upsert(
            {
              article_id: articleId,
              user_id: user.id,
              read_at: new Date().toISOString(),
            },
            { onConflict: "article_id,user_id" }
          ) as { error: Error | null };

        if (upsertError) throw upsertError;

        // Update local state
        setArticles((prev) =>
          prev.map((a) =>
            a.id === articleId ? { ...a, is_read: true } : a
          )
        );

        return true;
      } catch (err) {
        console.error("Error marking article as read:", err);
        return false;
      }
    },
    [supabase]
  );

  /**
   * Fetch unread articles for a user
   */
  const fetchUnreadForUser = useCallback(
    async (userId?: string): Promise<ArticleWithAuthor[]> => {
      if (!activeCourse?.id) return [];

      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const targetUserId = userId || user?.id;
        if (!targetUserId) return [];

        // Get all read article IDs for the user
        const { data: readLog } = await supabase
          .from("knowledge_read_log")
          .select("article_id")
          .eq("user_id", targetUserId) as { data: { article_id: string }[] | null };

        const readIds = readLog?.map((r) => r.article_id) || [];

        // Get all published articles not in read list
        let query = supabase
          .from("knowledge_articles")
          .select(
            `
            *,
            author:profiles!knowledge_articles_created_by_fkey(id, full_name, avatar_url)
          `
          )
          .eq("course_id", activeCourse.id)
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        if (readIds.length > 0) {
          query = query.not("id", "in", `(${readIds.join(",")})`);
        }

        const { data, error: fetchError } = await query as { data: ArticleWithAuthor[] | null; error: Error | null };

        if (fetchError) throw fetchError;

        const unreadArticles = (data || []).map((a) => ({
          ...a,
          is_read: false,
        }));

        return unreadArticles;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch unread articles";
        setError(message);
        console.error("Error fetching unread articles:", err);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [activeCourse?.id, supabase]
  );

  /**
   * Fetch articles linked to a task template
   */
  const fetchArticlesByTemplate = useCallback(
    async (templateId: string): Promise<ArticleWithAuthor[]> => {
      if (!activeCourse?.id) return [];

      try {
        const { data, error: fetchError } = await supabase
          .from("knowledge_articles")
          .select(
            `
            *,
            author:profiles!knowledge_articles_created_by_fkey(id, full_name, avatar_url)
          `
          )
          .eq("course_id", activeCourse.id)
          .eq("is_published", true)
          .contains("linked_template_ids", [templateId]) as { data: ArticleWithAuthor[] | null; error: Error | null };

        if (fetchError) throw fetchError;

        return data || [];
      } catch (err) {
        console.error("Error fetching articles by template:", err);
        return [];
      }
    },
    [activeCourse?.id, supabase]
  );

  /**
   * Full-text search on articles
   */
  const searchArticles = useCallback(
    async (query: string): Promise<ArticleWithAuthor[]> => {
      if (!activeCourse?.id || !query.trim()) return [];

      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // Search in title and content
        const { data, error: searchError } = await supabase
          .from("knowledge_articles")
          .select(
            `
            *,
            author:profiles!knowledge_articles_created_by_fkey(id, full_name, avatar_url)
          `
          )
          .eq("course_id", activeCourse.id)
          .eq("is_published", true)
          .or(`title.ilike.%${query}%,content.ilike.%${query}%,tags.cs.{${query}}`)
          .order("title") as { data: ArticleWithAuthor[] | null; error: Error | null };

        if (searchError) throw searchError;

        // Get read status
        let readArticleIds: Set<string> = new Set();
        if (user) {
          const { data: readLog } = await supabase
            .from("knowledge_read_log")
            .select("article_id")
            .eq("user_id", user.id) as { data: { article_id: string }[] | null };

          if (readLog) {
            readArticleIds = new Set(readLog.map((r) => r.article_id));
          }
        }

        return (data || []).map((article) => ({
          ...article,
          is_read: readArticleIds.has(article.id),
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Search failed";
        setError(message);
        console.error("Error searching articles:", err);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [activeCourse?.id, supabase]
  );

  /**
   * Get category counts for sidebar
   */
  const getCategoryCounts = useCallback(async (): Promise<Record<KnowledgeCategory, number>> => {
    if (!activeCourse?.id) {
      return Object.keys(categoryLabels).reduce(
        (acc, key) => ({ ...acc, [key]: 0 }),
        {} as Record<KnowledgeCategory, number>
      );
    }

    try {
      const { data } = await supabase
        .from("knowledge_articles")
        .select("category")
        .eq("course_id", activeCourse.id)
        .eq("is_published", true) as { data: { category: string }[] | null };

      const counts = Object.keys(categoryLabels).reduce(
        (acc, key) => ({ ...acc, [key]: 0 }),
        {} as Record<KnowledgeCategory, number>
      );

      (data || []).forEach((article) => {
        if (article.category in counts) {
          counts[article.category as KnowledgeCategory]++;
        }
      });

      return counts;
    } catch (err) {
      console.error("Error getting category counts:", err);
      return Object.keys(categoryLabels).reduce(
        (acc, key) => ({ ...acc, [key]: 0 }),
        {} as Record<KnowledgeCategory, number>
      );
    }
  }, [activeCourse?.id, supabase]);

  /**
   * Fetch onboarding articles
   */
  const fetchOnboardingArticles = useCallback(
    async (userId?: string): Promise<{ articles: ArticleWithAuthor[]; readCount: number }> => {
      if (!activeCourse?.id) return { articles: [], readCount: 0 };

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const targetUserId = userId || user?.id;

        // Get articles tagged with "onboarding"
        const { data } = await supabase
          .from("knowledge_articles")
          .select(
            `
            *,
            author:profiles!knowledge_articles_created_by_fkey(id, full_name, avatar_url)
          `
          )
          .eq("course_id", activeCourse.id)
          .eq("is_published", true)
          .contains("tags", ["onboarding"])
          .order("category")
          .order("title") as { data: ArticleWithAuthor[] | null };

        // Get read status
        let readArticleIds: Set<string> = new Set();
        if (targetUserId) {
          const { data: readLog } = await supabase
            .from("knowledge_read_log")
            .select("article_id")
            .eq("user_id", targetUserId) as { data: { article_id: string }[] | null };

          if (readLog) {
            readArticleIds = new Set(readLog.map((r) => r.article_id));
          }
        }

        const articlesWithStatus = (data || []).map((article) => ({
          ...article,
          is_read: readArticleIds.has(article.id),
        }));

        const readCount = articlesWithStatus.filter((a) => a.is_read).length;

        return { articles: articlesWithStatus, readCount };
      } catch (err) {
        console.error("Error fetching onboarding articles:", err);
        return { articles: [], readCount: 0 };
      }
    },
    [activeCourse?.id, supabase]
  );

  /**
   * Upload attachment to storage
   */
  const uploadAttachment = useCallback(
    async (file: File): Promise<ArticleAttachment | null> => {
      if (!activeCourse?.id) return null;

      try {
        const fileExt = file.name.split(".").pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `knowledge/${activeCourse.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("attachments").getPublicUrl(filePath);

        return {
          id: crypto.randomUUID(),
          name: file.name,
          url: publicUrl,
          type: file.type,
          size: file.size,
        };
      } catch (err) {
        console.error("Error uploading attachment:", err);
        return null;
      }
    },
    [activeCourse?.id, supabase]
  );

  return {
    // State
    articles,
    loading,
    error,

    // Article CRUD
    fetchArticles,
    fetchArticle,
    createArticle,
    updateArticle,
    deleteArticle,

    // Read tracking
    markAsRead,
    fetchUnreadForUser,

    // Search & Filter
    searchArticles,
    fetchArticlesByTemplate,
    getCategoryCounts,

    // Onboarding
    fetchOnboardingArticles,

    // Attachments
    uploadAttachment,
  };
}
