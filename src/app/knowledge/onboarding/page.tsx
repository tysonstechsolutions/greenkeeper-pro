"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Trophy,
  Clock,
  ChevronRight,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  useKnowledge,
  categoryLabels,
  categoryColors,
  articleTypeLabels,
  articleTypeColors,
  type ArticleWithAuthor,
  type KnowledgeCategory,
} from "@/lib/hooks/useKnowledge";
import { useAuth } from "@/lib/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

export default function OnboardingPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { fetchOnboardingArticles, markAsRead, loading } = useKnowledge();

  const [articles, setArticles] = useState<ArticleWithAuthor[]>([]);
  const [readCount, setReadCount] = useState(0);

  // Load onboarding articles
  useEffect(() => {
    async function loadArticles() {
      const result = await fetchOnboardingArticles();
      setArticles(result.articles);
      setReadCount(result.readCount);
    }
    loadArticles();
  }, [fetchOnboardingArticles]);

  // Group articles by category
  const groupedArticles = useMemo(() => {
    const groups: Record<string, ArticleWithAuthor[]> = {};

    articles.forEach((article) => {
      const category = article.category;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(article);
    });

    return groups;
  }, [articles]);

  // Progress calculation
  const totalArticles = articles.length;
  const progressPercent = totalArticles > 0 ? Math.round((readCount / totalArticles) * 100) : 0;
  const isComplete = totalArticles > 0 && readCount === totalArticles;

  // Handle article click
  async function handleArticleClick(articleId: string) {
    // Mark as read (optimistically)
    await markAsRead(articleId);
    // Update local state
    setArticles((prev) =>
      prev.map((a) => (a.id === articleId ? { ...a, is_read: true } : a))
    );
    setReadCount((prev) => prev + 1);
    // Navigate
    router.push(`/knowledge/${articleId}`);
  }

  return (
    <div className="p-4 md:p-6">
      {/* Back button */}
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Knowledge Base
      </Link>

      <PageHeader
        title="Onboarding Checklist"
        description="Complete these articles to get started"
        icon={Sparkles}
      />

      {/* Progress Card */}
      <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            {isComplete ? (
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <Trophy className="w-8 h-8 text-green-600" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">{progressPercent}%</span>
              </div>
            )}
            <div>
              <h2 className="text-xl font-semibold">
                {isComplete ? "Onboarding Complete!" : "Your Progress"}
              </h2>
              <p className="text-muted-foreground">
                {isComplete
                  ? "You've read all onboarding articles. Great job!"
                  : `${readCount} of ${totalArticles} articles completed`}
              </p>
            </div>
          </div>

          {profile && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              {profile.full_name}
            </div>
          )}
        </div>

        <Progress value={progressPercent} className="h-3" />

        {!isComplete && (
          <p className="text-sm text-muted-foreground mt-3">
            Read each article and check it off your list. Your progress is saved automatically.
          </p>
        )}
      </div>

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

      {/* Empty State */}
      {!loading && articles.length === 0 && (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Onboarding Articles</h3>
          <p className="text-muted-foreground text-sm mb-4">
            There are no onboarding articles assigned yet.
            <br />
            Articles tagged with &quot;onboarding&quot; will appear here.
          </p>
          <Link href="/knowledge">
            <Button variant="outline">Browse Knowledge Base</Button>
          </Link>
        </div>
      )}

      {/* Articles by Category */}
      {!loading && Object.entries(groupedArticles).map(([category, categoryArticles]) => (
        <div key={category} className="mb-8">
          {/* Category Header */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: categoryColors[category as KnowledgeCategory] }}
            />
            <h2 className="font-semibold text-lg">
              {categoryLabels[category as KnowledgeCategory]}
            </h2>
            <Badge variant="secondary" className="text-xs">
              {categoryArticles.filter((a) => a.is_read).length} / {categoryArticles.length}
            </Badge>
          </div>

          {/* Article Checklist */}
          <div className="space-y-2">
            {categoryArticles.map((article, index) => (
              <button
                key={article.id}
                onClick={() => !article.is_read && handleArticleClick(article.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-colors text-left ${
                  article.is_read
                    ? "bg-green-500/5 border-green-500/20"
                    : "bg-card border-border hover:border-primary/50 cursor-pointer"
                }`}
              >
                {/* Checkbox */}
                <div className="flex-shrink-0">
                  {article.is_read ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  ) : (
                    <Circle className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-muted-foreground font-medium">
                      Step {index + 1}
                    </span>
                    <Badge
                      className="text-xs text-white"
                      style={{ backgroundColor: articleTypeColors[article.article_type] }}
                    >
                      {articleTypeLabels[article.article_type]}
                    </Badge>
                  </div>
                  <h3
                    className={`font-medium ${
                      article.is_read ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    {article.title}
                  </h3>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(article.updated_at), {
                        addSuffix: true,
                      })}
                    </span>
                    {article.author && (
                      <span>by {article.author.full_name}</span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                {!article.is_read && (
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Completion CTA */}
      {isComplete && (
        <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20 p-6 text-center">
          <Trophy className="w-12 h-12 mx-auto text-green-600 mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            Congratulations on completing your onboarding!
          </h3>
          <p className="text-muted-foreground mb-4">
            You&apos;re all set to start contributing to the team. Check out the rest of the
            Knowledge Base for more resources.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/knowledge">
              <Button variant="outline">Browse Knowledge Base</Button>
            </Link>
            <Link href="/dashboard">
              <Button>Go to Dashboard</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
