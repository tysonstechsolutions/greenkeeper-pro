"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Book,
  Search,
  Plus,
  Filter,
  ChevronRight,
  Clock,
  User,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useKnowledge,
  categoryLabels,
  categoryColors,
  articleTypeLabels,
  articleTypeColors,
  type KnowledgeCategory,
  type ArticleType,
  type ArticleWithAuthor,
} from "@/lib/hooks/useKnowledge";
import { useAuth } from "@/lib/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

// All categories for filtering
const ALL_CATEGORIES: KnowledgeCategory[] = [
  "mowing",
  "irrigation",
  "chemical",
  "equipment",
  "greens",
  "bunkers",
  "landscaping",
  "safety",
  "admin",
  "onboarding",
  "emergency",
  "seasonal",
  "general",
];

// All article types for filtering
const ALL_ARTICLE_TYPES: ArticleType[] = [
  "sop",
  "guide",
  "manual",
  "checklist",
  "reference",
  "training",
];

export default function KnowledgePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const {
    articles,
    loading,
    fetchArticles,
    getCategoryCounts,
  } = useKnowledge();

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | "all">("all");
  const [selectedType, setSelectedType] = useState<ArticleType | "all">("all");
  const [categoryCounts, setCategoryCounts] = useState<Record<KnowledgeCategory, number>>(
    {} as Record<KnowledgeCategory, number>
  );
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Check if user can create articles
  const canCreateArticle = ["super", "asst_super"].includes(
    profile?.role || ""
  );

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch articles when filters change
  useEffect(() => {
    fetchArticles({
      category: selectedCategory === "all" ? undefined : selectedCategory,
      article_type: selectedType === "all" ? undefined : selectedType,
      search: debouncedSearch || undefined,
      sortBy: "title",
      sortOrder: "asc",
    });
  }, [fetchArticles, selectedCategory, selectedType, debouncedSearch]);

  // Fetch category counts on mount
  useEffect(() => {
    async function loadCounts() {
      const counts = await getCategoryCounts();
      setCategoryCounts(counts);
    }
    loadCounts();
  }, [getCategoryCounts]);

  // Group articles by category for display
  const groupedArticles = useMemo(() => {
    const groups: Record<string, ArticleWithAuthor[]> = {};

    articles.forEach((article) => {
      const category = article.category;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(article);
    });

    // Sort categories alphabetically
    const sortedGroups: Record<string, ArticleWithAuthor[]> = {};
    Object.keys(groups)
      .sort((a, b) => categoryLabels[a as KnowledgeCategory].localeCompare(categoryLabels[b as KnowledgeCategory]))
      .forEach((key) => {
        sortedGroups[key] = groups[key];
      });

    return sortedGroups;
  }, [articles]);

  // Total article count
  const totalCount = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);

  // Count of unread articles
  const unreadCount = articles.filter((a) => !a.is_read).length;

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Knowledge Base"
        description="SOPs, guides, and training materials"
        icon={Book}
      >
        {canCreateArticle && (
          <Button onClick={() => router.push("/knowledge/new")}>
            <Plus className="w-4 h-4 mr-2" />
            New Article
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="bg-card rounded-lg border border-border p-4 sticky top-4">
            <h3 className="font-semibold mb-3">Categories</h3>
            <nav className="space-y-1">
              {/* All categories */}
              <button
                onClick={() => setSelectedCategory("all")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedCategory === "all"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                <span>All</span>
                <span className="text-xs opacity-80">{totalCount}</span>
              </button>

              {/* Individual categories */}
              {ALL_CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedCategory === category
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: categoryColors[category] }}
                    />
                    {categoryLabels[category]}
                  </span>
                  <span className="text-xs opacity-80">{categoryCounts[category] || 0}</span>
                </button>
              ))}
            </nav>

            {/* Onboarding link */}
            <div className="mt-6 pt-4 border-t border-border">
              <Link
                href="/knowledge/onboarding"
                className="flex items-center justify-between px-3 py-2 rounded-md text-sm bg-[#1B4332]/10 text-[#1B4332] hover:bg-[#1B4332]/20 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Onboarding Checklist
                </span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>
          </div>

          {/* Mobile Category Tabs */}
          <div className="lg:hidden mb-4 overflow-x-auto">
            <Tabs
              value={selectedCategory}
              onValueChange={(v) => setSelectedCategory(v as KnowledgeCategory | "all")}
            >
              <TabsList className="inline-flex w-auto">
                <TabsTrigger value="all">All</TabsTrigger>
                {ALL_CATEGORIES.slice(0, 6).map((category) => (
                  <TabsTrigger key={category} value={category}>
                    {categoryLabels[category]}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="more">More...</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Type Filter Chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setSelectedType("all")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedType === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <Filter className="w-3 h-3 inline-block mr-1" />
              All Types
            </button>
            {ALL_ARTICLE_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedType === type
                    ? "text-white"
                    : "bg-muted hover:bg-muted/80"
                }`}
                style={{
                  backgroundColor: selectedType === type ? articleTypeColors[type] : undefined,
                }}
              >
                {articleTypeLabels[type]}s
              </button>
            ))}
          </div>

          {/* Unread indicator */}
          {unreadCount > 0 && (
            <div className="mb-4 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <Sparkles className="w-4 h-4 inline-block mr-1" />
                You have <strong>{unreadCount}</strong> unread article{unreadCount !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-card rounded-lg border border-border p-4 animate-pulse"
                >
                  <div className="h-5 w-1/3 bg-muted rounded mb-2" />
                  <div className="h-4 w-2/3 bg-muted rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Article List */}
          {!loading && Object.keys(groupedArticles).length === 0 && (
            <div className="text-center py-12">
              <Book className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No articles found</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {searchQuery
                  ? `No articles match "${searchQuery}"`
                  : "There are no articles in this category yet."}
              </p>
              {canCreateArticle && (
                <Button onClick={() => router.push("/knowledge/new")}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Article
                </Button>
              )}
            </div>
          )}

          {!loading && Object.entries(groupedArticles).map(([category, categoryArticles]) => (
            <div key={category} className="mb-8">
              {/* Category Header */}
              {selectedCategory === "all" && (
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: categoryColors[category as KnowledgeCategory] }}
                  />
                  <h2 className="font-semibold text-lg">
                    {categoryLabels[category as KnowledgeCategory]}
                  </h2>
                  <Badge variant="secondary" className="text-xs">
                    {categoryArticles.length}
                  </Badge>
                </div>
              )}

              {/* Article Cards */}
              <div className="space-y-3">
                {categoryArticles.map((article) => (
                  <Link
                    key={article.id}
                    href={`/knowledge/${article.id}`}
                    className="block bg-card rounded-lg border border-border p-4 hover:border-primary/50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {/* Unread indicator */}
                          {!article.is_read && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                          )}
                          <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                            {article.title}
                          </h3>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {selectedCategory === "all" && (
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{
                                borderColor: categoryColors[article.category],
                                color: categoryColors[article.category],
                              }}
                            >
                              {categoryLabels[article.category]}
                            </Badge>
                          )}
                          <Badge
                            className="text-xs text-white"
                            style={{ backgroundColor: articleTypeColors[article.article_type] }}
                          >
                            {articleTypeLabels[article.article_type]}
                          </Badge>

                          {/* Tags */}
                          {article.tags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {article.tags.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{article.tags.length - 3} more
                            </span>
                          )}
                        </div>

                        {/* Meta info */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(article.updated_at), {
                              addSuffix: true,
                            })}
                          </span>
                          {article.author && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {article.author.full_name}
                            </span>
                          )}
                          {article.version > 1 && (
                            <span className="text-muted-foreground">
                              v{article.version}
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
