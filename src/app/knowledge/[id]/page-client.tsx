"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  Book,
  ArrowLeft,
  Edit,
  Trash2,
  Clock,
  User,
  Users,
  Eye,
  Download,
  ExternalLink,
  FileText,
  Paperclip,
  Tag,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useKnowledge,
  categoryLabels,
  categoryColors,
  articleTypeLabels,
  articleTypeColors,
  type ArticleWithAuthor,
} from "@/lib/hooks/useKnowledge";
import { useAuth } from "@/lib/hooks/useAuth";
import { format } from "date-fns";

export default function RouteContent() {
  const routeParams = useParams<{ id: string }>();
  const id = routeParams?.id ?? "";
  const router = useRouter();
  const { profile } = useAuth();
  const { fetchArticle, markAsRead, deleteArticle, loading } = useKnowledge();

  const [article, setArticle] = useState<ArticleWithAuthor | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Check if user can edit/delete
  const canEdit = ["super", "asst_super"].includes(
    profile?.role || ""
  );

  // Fetch article on mount
  useEffect(() => {
    async function loadArticle() {
      const data = await fetchArticle(id);
      if (data) {
        setArticle(data);
        // Mark as read
        await markAsRead(id);
      }
    }
    loadArticle();
  }, [id, fetchArticle, markAsRead]);

  // Handle delete
  async function handleDelete() {
    setDeleting(true);
    const success = await deleteArticle(id);
    if (success) {
      router.push("/knowledge");
    }
    setDeleting(false);
  }

  // Format file size
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading || !article) {
    return (
      <div className="p-4 md:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 bg-muted rounded" />
          <div className="h-4 w-1/2 bg-muted rounded" />
          <div className="h-96 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <DetailPageHeader
        backHref="/knowledge"
        backLabel="Knowledge Base"
        title={article.title}
        subtitle={
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {article.author && (
              <span className="flex items-center gap-1">
                <User className="w-4 h-4" />
                Created by {article.author.full_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Updated {format(new Date(article.updated_at), "MMM d, yyyy")}
            </span>
          </div>
        }
        className="mb-6"
        actions={
          canEdit && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/knowledge/new?edit=${article.id}`)}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Article</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete &quot;{article.title}&quot;? This will hide the article from all users.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-red-600 hover:bg-red-700"
                      disabled={deleting}
                    >
                      {deleting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )
        }
      />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Article card with badges */}
          <div className="bg-card rounded-lg border border-border p-6 mb-6">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Badge
                variant="outline"
                style={{
                  borderColor: categoryColors[article.category],
                  color: categoryColors[article.category],
                }}
              >
                {categoryLabels[article.category]}
              </Badge>
              <Badge
                className="text-white"
                style={{ backgroundColor: articleTypeColors[article.article_type] }}
              >
                {articleTypeLabels[article.article_type]}
              </Badge>
              {article.version > 1 && (
                <Badge variant="secondary">v{article.version}</Badge>
              )}
            </div>

            {/* Tags */}
            {article.tags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap pt-4 border-t border-border">
                <Tag className="w-4 h-4 text-muted-foreground" />
                {article.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="bg-card rounded-lg border border-border p-6">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-2xl font-bold mt-6 mb-4 first:mt-0">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-xl font-semibold mt-6 mb-3">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>
                  ),
                  p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
                  ul: ({ children }) => (
                    <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>
                  ),
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  code: ({ children, className }) => {
                    const isBlock = className?.includes("language-");
                    if (isBlock) {
                      return (
                        <pre className="bg-muted p-4 rounded-lg overflow-x-auto mb-4">
                          <code className="text-sm">{children}</code>
                        </pre>
                      );
                    }
                    return (
                      <code className="bg-muted px-1.5 py-0.5 rounded text-sm">
                        {children}
                      </code>
                    );
                  },
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-primary pl-4 italic my-4">
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {children}
                    </a>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full border-collapse border border-border">
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-border bg-muted px-4 py-2 text-left font-semibold">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-border px-4 py-2">{children}</td>
                  ),
                }}
              >
                {article.content}
              </ReactMarkdown>
            </div>
          </div>
        </main>

        {/* Sidebar */}
        <aside className="w-full lg:w-80 flex-shrink-0 space-y-4">
          {/* Read Stats (supervisors only) */}
          {canEdit && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Read Stats
              </h3>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Staff who read</span>
                <span className="font-medium">
                  {article.read_count || 0} / {article.total_staff || 0}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: `${
                      article.total_staff
                        ? ((article.read_count || 0) / article.total_staff) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {article.total_staff
                  ? Math.round(((article.read_count || 0) / article.total_staff) * 100)
                  : 0}
                % completion rate
              </p>
            </div>
          )}

          {/* Attachments */}
          {article.attachments && article.attachments.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                Attachments
              </h3>
              <div className="space-y-2">
                {article.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2 bg-muted/50 rounded-md hover:bg-muted transition-colors"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{attachment.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(attachment.size)}
                      </p>
                    </div>
                    <Download className="w-4 h-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Linked Templates */}
          {article.linked_template_ids && article.linked_template_ids.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                Related Tasks
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                This article is linked to task templates.
              </p>
              <Link
                href="/tasks"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                View in Task Manager
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {/* Article Info */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold mb-3">Article Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span>{article.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{format(new Date(article.created_at), "MMM d, yyyy")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{format(new Date(article.updated_at), "MMM d, yyyy")}</span>
              </div>
              {article.updater && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated By</span>
                  <span>{article.updater.full_name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Mark as Read Confirmation */}
          {article.is_read && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">You&apos;ve read this article</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
