"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Loader2,
  DollarSign,
  Receipt,
  Calendar,
  Building2,
  FileText,
  Upload,
  X,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useBudget,
  budgetCategoryLabels,
  budgetCategoryColors,
} from "@/lib/hooks/useBudget";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { BudgetCategory } from "@/types/database";
import { todayLocal } from "@/lib/utils/date";

export default function NewExpensePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { budgetItems, fetchBudget, createExpense, loading } = useBudget();
  const supabase = createClient();

  const currentYear = new Date().getFullYear();

  // Form state
  const [category, setCategory] = useState<BudgetCategory | "">("");
  const [budgetItemId, setBudgetItemId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayLocal());
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  // Filter budget items by category
  const filteredBudgetItems = category
    ? budgetItems.filter((item) => item.category === category)
    : [];

  // Load budget items on mount
  useEffect(() => {
    fetchBudget(currentYear);
  }, [fetchBudget, currentYear]);

  // Handle category change - reset budget item if doesn't match
  useEffect(() => {
    if (category && budgetItemId) {
      const item = budgetItems.find((i) => i.id === budgetItemId);
      if (item && item.category !== category) {
        setBudgetItemId("");
      }
    }
  }, [category, budgetItemId, budgetItems]);

  // Handle receipt file selection
  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file for the receipt");
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError("Receipt image must be less than 5MB");
        return;
      }

      setReceiptFile(file);
      setError(null);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove receipt
  const handleRemoveReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
  };

  // Upload receipt to storage
  const uploadReceipt = async (): Promise<string | null> => {
    if (!receiptFile || !user) return null;

    setUploadingReceipt(true);
    try {
      const fileExt = receiptFile.name.split(".").pop();
      const fileName = `receipts/${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(fileName, receiptFile);

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Create photo record
      const photoRecord = {
        storage_path: fileName,
        uploaded_by: user.id,
        caption: `Receipt for expense: ${description}`,
        photo_type: "other" as const,
        tags: ["receipt", "expense"],
      };
      const { data: photoData, error: photoError } = await supabase
        .from("photos")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(photoRecord as any)
        .select()
        .single();

      if (photoError) {
        throw new Error(photoError.message);
      }

      return (photoData as { id: string }).id;
    } catch (err) {
      console.error("Error uploading receipt:", err);
      setError("Failed to upload receipt");
      return null;
    } finally {
      setUploadingReceipt(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (!description.trim()) {
      setError("Please enter a description");
      return;
    }

    if (!expenseDate) {
      setError("Please select an expense date");
      return;
    }

    setSaving(true);

    try {
      // Upload receipt if present
      let receiptPhotoId: string | undefined;
      if (receiptFile) {
        const photoId = await uploadReceipt();
        if (photoId) {
          receiptPhotoId = photoId;
        }
      }

      // Create expense
      const expense = await createExpense({
        budget_item_id: budgetItemId || undefined,
        amount: parsedAmount,
        description: description.trim(),
        vendor: vendor.trim() || undefined,
        expense_date: expenseDate,
        receipt_photo_id: receiptPhotoId,
        notes: notes.trim() || undefined,
      });

      if (expense) {
        router.push("/budget");
      }
    } catch (err) {
      console.error("Error creating expense:", err);
      setError("Failed to create expense");
    } finally {
      setSaving(false);
    }
  };

  // Calculate approval status preview
  const parsedAmount = parseFloat(amount) || 0;
  const requiresApproval = parsedAmount > 500;

  // Get selected budget item info
  const selectedBudgetItem = budgetItemId
    ? budgetItems.find((i) => i.id === budgetItemId)
    : null;

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Log Expense</h1>
          <p className="text-sm text-muted-foreground">
            Record a new expense against your budget
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Category & Budget Item Selection */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Budget Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Category Select */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Category
              </label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as BudgetCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(budgetCategoryLabels) as BudgetCategory[]).map(
                    (cat) => (
                      <SelectItem key={cat} value={cat}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: budgetCategoryColors[cat] }}
                          />
                          {budgetCategoryLabels[cat]}
                        </div>
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Budget Item Select (filtered by category) */}
            {category && filteredBudgetItems.length > 0 && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Budget Line Item (Optional)
                </label>
                <Select value={budgetItemId} onValueChange={setBudgetItemId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a budget item" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No specific item</SelectItem>
                    {filteredBudgetItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>
                            {item.description ||
                              `${budgetCategoryLabels[item.category]} - ${item.month ? `Month ${item.month}` : "Annual"}`}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ${item.remaining.toLocaleString()} remaining
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Budget Item Info */}
                {selectedBudgetItem && (
                  <div className="mt-2 p-3 bg-muted/50 rounded-md">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Budgeted</span>
                      <span className="font-medium">
                        ${selectedBudgetItem.budgeted_amount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Spent</span>
                      <span className="font-medium">
                        ${selectedBudgetItem.spent.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Remaining</span>
                      <span
                        className={`font-medium ${
                          selectedBudgetItem.remaining < 0
                            ? "text-destructive"
                            : "text-green-600 dark:text-green-400"
                        }`}
                      >
                        ${selectedBudgetItem.remaining.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            selectedBudgetItem.percent_used > 100
                              ? "bg-destructive"
                              : selectedBudgetItem.percent_used > 80
                                ? "bg-yellow-500"
                                : "bg-green-500"
                          }`}
                          style={{
                            width: `${Math.min(selectedBudgetItem.percent_used, 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 text-center">
                        {selectedBudgetItem.percent_used}% used
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {category && filteredBudgetItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No budget items found for this category. The expense will be
                logged without a budget item link.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Amount & Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Expense Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Amount */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Amount <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-9"
                  required
                />
              </div>
              {parsedAmount > 0 && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  {requiresApproval ? (
                    <>
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                      <span className="text-yellow-600 dark:text-yellow-400">
                        Requires approval (over $500)
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-green-600 dark:text-green-400">
                        Auto-approved
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Description <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What was this expense for?"
                  className="pl-9 min-h-[80px]"
                  required
                />
              </div>
            </div>

            {/* Vendor */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Vendor
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="Company or supplier name"
                  className="pl-9"
                />
              </div>
            </div>

            {/* Expense Date */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Expense Date <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Receipt Upload */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Receipt (Optional)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {receiptPreview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receiptPreview}
                  alt="Receipt preview"
                  className="w-full max-h-64 object-contain rounded-lg border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={handleRemoveReceipt}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-2">
                  Upload a photo of your receipt
                </p>
                <label className="cursor-pointer">
                  <span className="text-sm text-primary hover:underline">
                    Choose file
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReceiptChange}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-muted-foreground mt-2">
                  PNG, JPG up to 5MB
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Additional Notes (Optional)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional information about this expense..."
              className="min-h-[80px]"
            />
          </CardContent>
        </Card>

        {/* Submit Buttons */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={saving || uploadingReceipt || loading}
          >
            {saving || uploadingReceipt ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {uploadingReceipt ? "Uploading..." : saving ? "Saving..." : "Save Expense"}
          </Button>
        </div>
      </form>
    </div>
  );
}
