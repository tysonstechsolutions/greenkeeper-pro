"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Book,
  ArrowLeft,
  Save,
  Upload,
  X,
  FileText,
  Link as LinkIcon,
  Eye,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReactMarkdown from "react-markdown";
import {
  useKnowledge,
  categoryLabels,
  categoryColors,
  articleTypeLabels,
  type KnowledgeCategory,
  type ArticleType,
  type ArticleAttachment,
  type CreateArticleData,
} from "@/lib/hooks/useKnowledge";
import { useAuth } from "@/lib/hooks/useAuth";

// All categories
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

// All article types
const ALL_ARTICLE_TYPES: ArticleType[] = [
  "sop",
  "guide",
  "manual",
  "checklist",
  "reference",
  "training",
];

function NewArticleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { profile } = useAuth();
  const {
    fetchArticle,
    createArticle,
    updateArticle,
    uploadAttachment,
    loading,
  } = useKnowledge();

  // Check access
  const canAccess = ["super_admin", "superintendent", "assistant_superintendent"].includes(
    profile?.role || ""
  );

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<KnowledgeCategory>("general");
  const [articleType, setArticleType] = useState<ArticleType>("guide");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [attachments, setAttachments] = useState<ArticleAttachment[]>([]);
  const [linkedTemplateIds, setLinkedTemplateIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");

  // Load existing article if editing
  useEffect(() => {
    if (editId) {
      async function loadArticle() {
        const article = await fetchArticle(editId);
        if (article) {
          setTitle(article.title);
          setContent(article.content);
          setCategory(article.category);
          setArticleType(article.article_type);
          setTags(article.tags);
          setIsPublished(article.is_published);
          setAttachments(article.attachments || []);
          setLinkedTemplateIds(article.linked_template_ids || []);
        }
      }
      loadArticle();
    }
  }, [editId, fetchArticle]);

  // Handle tag input
  const addTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
      setTagInput("");
    }
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  // Handle file upload
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const attachment = await uploadAttachment(file);
        if (attachment) {
          setAttachments((prev) => [...prev, attachment]);
        }
      }
    } catch (err) {
      setError("Failed to upload file");
    } finally {
      setUploading(false);
    }

    // Clear input
    e.target.value = "";
  }

  // Remove attachment
  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  // Format file size
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Handle save
  async function handleSave() {
    // Validation
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!content.trim()) {
      setError("Content is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const data: CreateArticleData = {
        title: title.trim(),
        content,
        category,
        article_type: articleType,
        tags,
        is_published: isPublished,
        attachments,
        linked_template_ids: linkedTemplateIds,
      };

      let result;
      if (editId) {
        result = await updateArticle(editId, data);
      } else {
        result = await createArticle(data);
      }

      if (result) {
        router.push(`/knowledge/${result.id}`);
      } else {
        setError("Failed to save article");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save article");
    } finally {
      setSaving(false);
    }
  }

  // Access denied
  if (!canAccess) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12">
          <Book className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">Access Denied</h2>
          <p className="text-muted-foreground text-sm mb-4">
            You don&apos;t have permission to create or edit articles.
          </p>
          <Link href="/knowledge">
            <Button variant="outline">Back to Knowledge Base</Button>
          </Link>
        </div>
      </div>
    );
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
        title={editId ? "Edit Article" : "New Article"}
        description={editId ? "Update article content and settings" : "Create a new knowledge base article"}
        icon={Book}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/knowledge")}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : editId ? "Update" : "Publish"}
            </Button>
          </div>
        }
      />

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <div className="bg-card rounded-lg border border-border p-4">
            <Label htmlFor="title" className="text-sm font-medium mb-2 block">
              Article Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter article title..."
              className="text-lg font-semibold"
            />
          </div>

          {/* Content Editor */}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm font-medium">Content (Markdown)</Label>
              <Tabs value={previewMode} onValueChange={(v) => setPreviewMode(v as "edit" | "preview")}>
                <TabsList>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="preview">
                    <Eye className="w-4 h-4 mr-1" />
                    Preview
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {previewMode === "edit" ? (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your article content using Markdown...

# Heading 1
## Heading 2

- Bullet point
- Another point

**Bold text** and *italic text*

```
Code block
```"
                className="min-h-[400px] font-mono text-sm"
              />
            ) : (
              <div className="min-h-[400px] p-4 bg-muted/30 rounded-lg prose prose-sm dark:prose-invert max-w-none overflow-auto">
                {content ? (
                  <ReactMarkdown>{content}</ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground italic">No content to preview</p>
                )}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm font-medium">Attachments</Label>
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
                <Button variant="outline" size="sm" disabled={uploading} asChild>
                  <span>
                    <Upload className="w-4 h-4 mr-2" />
                    {uploading ? "Uploading..." : "Upload Files"}
                  </span>
                </Button>
              </label>
            </div>

            {attachments.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-border rounded-lg">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No attachments yet. Upload PDFs, images, or documents.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 p-2 bg-muted/50 rounded-md"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{attachment.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(attachment.size)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeAttachment(attachment.id)}
                      className="p-1 hover:bg-muted rounded"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Category & Type */}
          <div className="bg-card rounded-lg border border-border p-4 space-y-4">
            <div>
              <Label htmlFor="category" className="text-sm font-medium mb-2 block">
                Category
              </Label>
              <Select value={category} onValueChange={(v) => setCategory(v as KnowledgeCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: categoryColors[cat] }}
                        />
                        {categoryLabels[cat]}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="type" className="text-sm font-medium mb-2 block">
                Article Type
              </Label>
              <Select value={articleType} onValueChange={(v) => setArticleType(v as ArticleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ARTICLE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {articleTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tags */}
          <div className="bg-card rounded-lg border border-border p-4">
            <Label className="text-sm font-medium mb-2 block">Tags</Label>
            <div className="flex gap-2 mb-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={addTag}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button onClick={() => removeTag(tag)}>
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {tags.length === 0 && (
                <p className="text-xs text-muted-foreground">No tags added</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Add &quot;onboarding&quot; tag to include in new staff checklist
            </p>
          </div>

          {/* Publish Status */}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="published" className="text-sm font-medium">
                  Published
                </Label>
                <p className="text-xs text-muted-foreground">
                  Visible to all staff members
                </p>
              </div>
              <Switch
                id="published"
                checked={isPublished}
                onCheckedChange={setIsPublished}
              />
            </div>
          </div>

          {/* Linked Templates Placeholder */}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <LinkIcon className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Link to Task Templates</Label>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Connect this article to task templates for quick access during task completion.
            </p>
            <Button variant="outline" size="sm" className="w-full" disabled>
              Coming Soon
            </Button>
          </div>

          {/* Quick Tips */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2">Markdown Tips</h4>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><code>#</code> Heading 1</p>
              <p><code>##</code> Heading 2</p>
              <p><code>**bold**</code> Bold text</p>
              <p><code>*italic*</code> Italic text</p>
              <p><code>- item</code> Bullet list</p>
              <p><code>1. item</code> Numbered list</p>
              <p><code>```code```</code> Code block</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewArticlePage() {
  return (
    <Suspense fallback={
      <div className="p-4 md:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 bg-muted rounded" />
          <div className="h-4 w-1/2 bg-muted rounded" />
          <div className="h-96 bg-muted rounded-lg" />
        </div>
      </div>
    }>
      <NewArticleContent />
    </Suspense>
  );
}
