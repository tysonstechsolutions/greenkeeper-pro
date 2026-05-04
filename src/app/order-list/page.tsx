'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Package, AlertTriangle, X, Search, Loader2, Check, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';

import {
  useOrderItems,
  orderCategoryLabels,
  orderPriorityLabels,
  orderStatusLabels,
  orderStatusColors,
  type DisplayOrderItem,
} from '@/lib/hooks/useOrderItems';
import type { OrderItemStatus } from '@/types/database';
import { downloadOrderListReport, OrderListReportError } from '@/lib/reports/order-list-report';

const CATEGORIES = ['clubhouse', 'cart_paths', 'turf_course', 'general'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const STATUSES = ['needed', 'ordered', 'received'] as const;

// ──────────────────────────────────────────────────────────────────────
// Consolidation helpers
//
// Groups items by canonical key (part_number || lowercase item_name) so a
// part needed by 3 different mowers shows up once with the total qty
// instead of three separate rows. The user expands to see which equipment
// needs it.
// ──────────────────────────────────────────────────────────────────────

interface ConsolidatedGroup {
  key: string;
  primary: DisplayOrderItem;
  members: DisplayOrderItem[];
  totalQty: number;
  totalCost: number;
}

function consolidateKey(item: DisplayOrderItem): string {
  const pn = item.part_number?.trim();
  if (pn) return `pn:${pn.toLowerCase()}`;
  const name = (item.item_name || '').trim().toLowerCase();
  return `name:${name}`;
}

function parseQty(q: string | number | null | undefined): number {
  if (q == null) return 0;
  if (typeof q === 'number') return q;
  const m = String(q).match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function consolidate(items: DisplayOrderItem[]): ConsolidatedGroup[] {
  const map = new Map<string, ConsolidatedGroup>();
  for (const item of items) {
    const key = consolidateKey(item);
    const qty = parseQty(item.quantity) || 1;
    const cost = (item.estimated_cost || 0) * qty;
    const existing = map.get(key);
    if (existing) {
      existing.members.push(item);
      existing.totalQty += qty;
      existing.totalCost += cost;
    } else {
      map.set(key, {
        key,
        primary: item,
        members: [item],
        totalQty: qty,
        totalCost: cost,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.primary.item_name || '').localeCompare(b.primary.item_name || ''),
  );
}

function ConsolidatedCard({
  group,
  onMarkOrdered,
  onMarkReceived,
  onDelete,
}: {
  group: ConsolidatedGroup;
  onMarkOrdered?: (id: string) => void;
  onMarkReceived?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isMulti = group.members.length > 1;
  const status = group.primary.status;
  const partNum = group.primary.part_number;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ backgroundColor: orderStatusColors[status] }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm leading-snug break-words">
              {group.primary.item_name || '(no name)'}
            </p>
            <span className="text-base font-bold text-primary shrink-0">
              ×{group.totalQty || group.members.length}
            </span>
          </div>
          {partNum && (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              Part #: {partNum}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge
              variant="secondary"
              style={{
                backgroundColor: `${orderStatusColors[status]}20`,
                color: orderStatusColors[status],
              }}
            >
              {orderStatusLabels[status]}
            </Badge>
            {isMulti && (
              <span className="text-[11px] text-muted-foreground">
                {group.members.length} requests
              </span>
            )}
            {group.totalCost > 0 && (
              <span className="text-[11px] text-muted-foreground">
                ~${group.totalCost.toFixed(2)}
              </span>
            )}
          </div>
        </div>
        {isMulti ? (
          open ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
          )
        ) : null}
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 divide-y divide-border">
          {group.members.map((m) => (
            <div key={m.id} className="px-3 py-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="font-medium truncate">
                  {m.equipment_name || m.vendor || '—'}
                </span>
                <span className="text-muted-foreground shrink-0">
                  qty {parseQty(m.quantity) || 1}
                </span>
              </div>
              {m.description && (
                <p className="text-muted-foreground line-clamp-2">
                  {m.description}
                </p>
              )}
              {m.notes && (
                <p className="text-muted-foreground line-clamp-2">{m.notes}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                {m.source === 'order_item' &&
                  status === 'needed' &&
                  onMarkOrdered && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkOrdered(m.id);
                      }}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Mark ordered
                    </button>
                  )}
                {m.source === 'order_item' &&
                  status === 'ordered' &&
                  onMarkReceived && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkReceived(m.id);
                      }}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Mark received
                    </button>
                  )}
                {m.source === 'order_item' && onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(m.id);
                    }}
                    className="text-[11px] text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterCard({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-card rounded-lg border p-3 text-left transition-all hover:shadow-md active:scale-[0.98] ${
        active ? 'ring-2 ring-primary border-primary' : 'border-border'
      }`}
    >
      <div className="text-xs font-medium text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>
        {count}
      </div>
    </button>
  );
}

interface FormData {
  itemName: string;
  category: typeof CATEGORIES[number] | '';
  description: string;
  quantity: string;
  estimatedCost: string;
  priority: typeof PRIORITIES[number];
  vendor: string;
  notes: string;
}

export default function OrderListPage() {
  const { items, loading, stats, fetchItems, createItem, updateItem, deleteItem } = useOrderItems();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | typeof CATEGORIES[number]>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | typeof STATUSES[number]>('all');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const showToast = (type: 'error' | 'success', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const [formData, setFormData] = useState<FormData>({
    itemName: '',
    category: '',
    description: '',
    quantity: '',
    estimatedCost: '',
    priority: 'normal',
    vendor: '',
    notes: '',
  });

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      (item.item_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (item.vendor?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (item.description?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Group items by status
  const itemsByStatus = {
    needed: filteredItems.filter((i) => i.status === 'needed'),
    ordered: filteredItems.filter((i) => i.status === 'ordered'),
    received: filteredItems.filter((i) => i.status === 'received'),
  };

  // Consolidate within each status group: items with the same part_number
  // (or item name when no part #) appear once with a summed qty. Tap to
  // expand and see which equipment requested each.
  const consolidatedByStatus = useMemo(
    () => ({
      needed: consolidate(itemsByStatus.needed),
      ordered: consolidate(itemsByStatus.ordered),
      received: consolidate(itemsByStatus.received),
    }),
    [itemsByStatus.needed, itemsByStatus.ordered, itemsByStatus.received],
  );

  const handleFormChange = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.itemName.trim() || !formData.category) {
      showToast('error', 'Please fill in item name and category');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createItem({
        name: formData.itemName,
        category: formData.category,
        description: formData.description || undefined,
        quantity: formData.quantity || undefined,
        estimated_cost: formData.estimatedCost ? parseFloat(formData.estimatedCost) : undefined,
        priority: formData.priority,
        vendor: formData.vendor || undefined,
        notes: formData.notes || undefined,
      });

      if (!result) {
        showToast('error', 'Failed to save order item. Please try again.');
        return;
      }

      setFormData({
        itemName: '',
        category: '',
        description: '',
        quantity: '',
        estimatedCost: '',
        priority: 'normal',
        vendor: '',
        notes: '',
      });

      setIsSheetOpen(false);
      await fetchItems();
    } catch (error) {
      console.error('Failed to add order item:', error);
      showToast('error', 'Failed to add order item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkOrdered = async (itemId: string) => {
    try {
      const result = await updateItem(itemId, {
        status: 'ordered' as OrderItemStatus,
        ordered_date: new Date().toISOString().slice(0, 10),
      });
      if (!result) {
        showToast('error', 'Failed to update status. Please try again.');
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      showToast('error', 'Failed to update status');
    }
  };

  const handleMarkReceived = async (itemId: string) => {
    try {
      const result = await updateItem(itemId, {
        status: 'received' as OrderItemStatus,
        received_date: new Date().toISOString().slice(0, 10),
      });
      if (!result) {
        showToast('error', 'Failed to update status. Please try again.');
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      showToast('error', 'Failed to update status');
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this order item?')) {
      return;
    }

    try {
      await deleteItem(itemId);
    } catch (error) {
      console.error('Failed to delete item:', error);
      showToast('error', 'Failed to delete item');
    }
  };

  const handleDownloadReport = async () => {
    setIsDownloading(true);
    try {
      await downloadOrderListReport();
    } catch (error) {
      console.error('Failed to download report:', error);
      if (error instanceof OrderListReportError && error.step === 'no-data') {
        showToast('error', 'No order items or equipment parts to report');
      } else {
        showToast('error', 'Failed to download report');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 pb-40 md:pb-6">
      {/* Toast Message */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg ${
          toastMessage.type === 'error'
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          {toastMessage.type === 'error' ? (
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <Check className="h-4 w-4 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="rounded-lg p-2 shrink-0"
              style={{ backgroundColor: '#1B4332' }}
            >
              <Package className="h-8 w-8 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 truncate">
                Order List
              </h1>
              <p className="text-sm text-gray-600">
                Manage supplies and materials
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={handleDownloadReport}
              disabled={isDownloading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Downloading...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download List</span>
                  <span className="sm:hidden">Download</span>
                </>
              )}
            </Button>

            <Button
              onClick={() => setIsSheetOpen(true)}
              size="sm"
              style={{ backgroundColor: '#D4A853' }}
              className="flex items-center gap-2 text-gray-900 hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Item</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Stats — clickable filter cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FilterCard
            label="Total"
            count={stats.total}
            color="#0F172A"
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          />
          <FilterCard
            label="Needed"
            count={stats.needed}
            color="#EA580C"
            active={statusFilter === 'needed'}
            onClick={() =>
              setStatusFilter((prev) => (prev === 'needed' ? 'all' : 'needed'))
            }
          />
          <FilterCard
            label="Ordered"
            count={stats.ordered}
            color="#CA8A04"
            active={statusFilter === 'ordered'}
            onClick={() =>
              setStatusFilter((prev) => (prev === 'ordered' ? 'all' : 'ordered'))
            }
          />
          <FilterCard
            label="Received"
            count={stats.received}
            color="#16A34A"
            active={statusFilter === 'received'}
            onClick={() =>
              setStatusFilter((prev) => (prev === 'received' ? 'all' : 'received'))
            }
          />
        </div>

        {/* Filter Bar */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="search" className="mb-2 block text-sm font-medium">
                  Search
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Search by name, vendor, or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="w-full sm:w-48">
                <Label htmlFor="category-filter" className="mb-2 block text-sm font-medium">
                  Category
                </Label>
                <Select
                  value={categoryFilter}
                  onValueChange={(value: string) => setCategoryFilter(value as typeof categoryFilter)}
                >
                  <SelectTrigger id="category-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {orderCategoryLabels[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-48">
                <Label htmlFor="status-filter" className="mb-2 block text-sm font-medium">
                  Status
                </Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value: string) => setStatusFilter(value as typeof statusFilter)}
                >
                  <SelectTrigger id="status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {orderStatusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredItems.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="text-gray-600">
                {items.length === 0
                  ? 'No order items yet.'
                  : 'No items match your filters.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {consolidatedByStatus.needed.length > 0 && (
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: orderStatusColors['needed'] }}
                  ></span>
                  Needed ({consolidatedByStatus.needed.length} item
                  {consolidatedByStatus.needed.length === 1 ? '' : 's'})
                </h2>
                <div className="space-y-2">
                  {consolidatedByStatus.needed.map((g) => (
                    <ConsolidatedCard
                      key={g.key}
                      group={g}
                      onMarkOrdered={handleMarkOrdered}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )}

            {consolidatedByStatus.ordered.length > 0 && (
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: orderStatusColors['ordered'] }}
                  ></span>
                  Ordered ({consolidatedByStatus.ordered.length} item
                  {consolidatedByStatus.ordered.length === 1 ? '' : 's'})
                </h2>
                <div className="space-y-2">
                  {consolidatedByStatus.ordered.map((g) => (
                    <ConsolidatedCard
                      key={g.key}
                      group={g}
                      onMarkReceived={handleMarkReceived}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )}

            {consolidatedByStatus.received.length > 0 && (
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: orderStatusColors['received'] }}
                  ></span>
                  Received ({consolidatedByStatus.received.length} item
                  {consolidatedByStatus.received.length === 1 ? '' : 's'})
                </h2>
                <div className="space-y-2">
                  {consolidatedByStatus.received.map((g) => (
                    <ConsolidatedCard
                      key={g.key}
                      group={g}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Item Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="max-h-screen overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-gray-700" />
              Add New Order Item
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-6">
            {/* Item Name */}
            <div className="space-y-2">
              <Label htmlFor="item-name" className="font-medium">
                Item Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="item-name"
                placeholder="e.g., Premium grass seed, Fertilizer bags"
                value={formData.itemName}
                onChange={(e) => handleFormChange('itemName', e.target.value)}
                required
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category" className="font-medium">
                Category <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.category}
                onValueChange={(value) => handleFormChange('category', value as FormData['category'])}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {orderCategoryLabels[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="font-medium">
                Description
              </Label>
              <Textarea
                id="description"
                placeholder="Details about the item..."
                value={formData.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
                rows={2}
              />
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity" className="font-medium">
                Quantity
              </Label>
              <Input
                id="quantity"
                placeholder="e.g., 2 cases, 50 bags, 100 lbs"
                value={formData.quantity}
                onChange={(e) => handleFormChange('quantity', e.target.value)}
              />
            </div>

            {/* Estimated Cost */}
            <div className="space-y-2">
              <Label htmlFor="cost" className="font-medium">
                Estimated Cost
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="pl-7"
                  value={formData.estimatedCost}
                  onChange={(e) => handleFormChange('estimatedCost', e.target.value)}
                />
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label htmlFor="priority" className="font-medium">
                Priority
              </Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => handleFormChange('priority', value as FormData['priority'])}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {orderPriorityLabels[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Vendor */}
            <div className="space-y-2">
              <Label htmlFor="vendor" className="font-medium">
                Vendor
              </Label>
              <Input
                id="vendor"
                placeholder="Supplier name"
                value={formData.vendor}
                onChange={(e) => handleFormChange('vendor', e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="font-medium">
                Notes
              </Label>
              <Textarea
                id="notes"
                placeholder="Additional notes or specifications..."
                value={formData.notes}
                onChange={(e) => handleFormChange('notes', e.target.value)}
                rows={2}
              />
            </div>

            <SheetFooter className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                style={{ backgroundColor: '#1B4332' }}
                className="text-white hover:opacity-90"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Item
                  </>
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
