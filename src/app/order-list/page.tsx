'use client';

import { useEffect, useState } from 'react';
import { Download, Plus, Package, AlertTriangle, X, Search, Loader2, Trash2, Check, Wrench } from 'lucide-react';
import Link from 'next/link';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  orderCategoryColors,
  orderPriorityLabels,
  orderPriorityColors,
  orderStatusLabels,
  orderStatusColors,
  type DisplayOrderItem,
} from '@/lib/hooks/useOrderItems';
import type { OrderItemStatus, OrderCategory } from '@/types/database';
import { downloadOrderListReport, OrderListReportError } from '@/lib/reports/order-list-report';

const CATEGORIES = ['clubhouse', 'cart_paths', 'turf_course', 'general'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const STATUSES = ['needed', 'ordered', 'received'] as const;

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
    <div className="min-h-screen bg-gray-50 p-6 pb-24 md:pb-6">
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
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg p-2"
              style={{ backgroundColor: '#1B4332' }}
            >
              <Package className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Order List
              </h1>
              <p className="text-sm text-gray-600">
                Manage supplies and materials
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleDownloadReport}
              disabled={isDownloading}
              variant="outline"
              className="flex items-center gap-2"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" />
                  Download List
                </>
              )}
            </Button>

            <Button
              onClick={() => setIsSheetOpen(true)}
              style={{ backgroundColor: '#D4A853' }}
              className="flex items-center gap-2 text-gray-900 hover:opacity-90"
            >
              <Plus className="h-5 w-5" />
              Add Item
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {stats.total}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Needed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" style={{ color: '#EA580C' }}>
                {stats.needed}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Ordered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" style={{ color: '#CA8A04' }}>
                {stats.ordered}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Received
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {stats.received}
              </div>
            </CardContent>
          </Card>
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
          <div className="space-y-8">
            {/* Needed Items */}
            {itemsByStatus.needed.length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: orderStatusColors['needed'] }}
                  ></span>
                  Needed ({itemsByStatus.needed.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {itemsByStatus.needed.map((item) => (
                    <OrderItemCard
                      key={item.id}
                      item={item}
                      onMarkOrdered={() => handleMarkOrdered(item.id)}
                      onDelete={() => handleDelete(item.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Ordered Items */}
            {itemsByStatus.ordered.length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: orderStatusColors['ordered'] }}
                  ></span>
                  Ordered ({itemsByStatus.ordered.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {itemsByStatus.ordered.map((item) => (
                    <OrderItemCard
                      key={item.id}
                      item={item}
                      onMarkReceived={() => handleMarkReceived(item.id)}
                      onDelete={() => handleDelete(item.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Received Items */}
            {itemsByStatus.received.length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: orderStatusColors['received'] }}
                  ></span>
                  Received ({itemsByStatus.received.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {itemsByStatus.received.map((item) => (
                    <OrderItemCard
                      key={item.id}
                      item={item}
                      onDelete={() => handleDelete(item.id)}
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

interface OrderItemCardProps {
  item: DisplayOrderItem;
  onMarkOrdered?: () => void;
  onMarkReceived?: () => void;
  onDelete: () => void;
}

function OrderItemCard({
  item,
  onMarkOrdered,
  onMarkReceived,
  onDelete,
}: OrderItemCardProps) {
  const isEquipmentPart = item.source === 'equipment_part';
  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-base">{item.item_name}</CardTitle>
            {/* Show source link for equipment-part items */}
            {isEquipmentPart && item.equipment_id && (
              <Link
                href={`/equipment/${item.equipment_id}`}
                className="mt-1 inline-flex items-center gap-1 text-xs text-[#1B4332] hover:underline"
              >
                <Wrench className="h-3 w-3" />
                {item.equipment_name || 'Equipment'}
              </Link>
            )}
          </div>
          {/* Equipment parts must be deleted from the equipment page — hide the trash icon */}
          {!isEquipmentPart && (
            <button
              onClick={onDelete}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Delete item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Badges */}
        <div className="mt-3 flex flex-wrap gap-2">
          {isEquipmentPart ? (
            <Badge className="bg-[#1B4332] text-white">
              <Wrench className="mr-1 h-3 w-3" />
              Equipment Part
            </Badge>
          ) : (
            <Badge
              style={{
                backgroundColor: orderCategoryColors[item.category],
                color: '#fff',
              }}
            >
              {orderCategoryLabels[item.category]}
            </Badge>
          )}
          <Badge
            style={{
              backgroundColor: orderPriorityColors[item.priority],
              color: '#fff',
            }}
          >
            {orderPriorityLabels[item.priority]}
          </Badge>
          <Badge
            style={{
              backgroundColor: orderStatusColors[item.status],
              color: '#fff',
            }}
          >
            {orderStatusLabels[item.status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        {/* Quantity */}
        {item.quantity && (
          <div>
            <p className="text-xs font-semibold text-gray-700">Quantity</p>
            <p className="mt-1 text-sm text-gray-900">{item.quantity}</p>
          </div>
        )}

        {/* Vendor */}
        {item.vendor && (
          <div>
            <p className="text-xs font-semibold text-gray-700">Vendor</p>
            <p className="mt-1 text-sm text-gray-900">{item.vendor}</p>
          </div>
        )}

        {/* Description */}
        {item.description && (
          <div>
            <p className="text-xs font-semibold text-gray-700">Description</p>
            <p className="mt-1 text-sm text-gray-600">{item.description}</p>
          </div>
        )}

        {/* Cost */}
        {item.estimated_cost != null && (
          <div>
            <p className="text-xs font-semibold text-gray-700">Est. Cost</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              ${Number(item.estimated_cost).toFixed(2)}
            </p>
          </div>
        )}

        {/* Notes */}
        {item.notes && (
          <div>
            <p className="text-xs font-semibold text-gray-700">Notes</p>
            <p className="mt-1 text-sm text-gray-600">{item.notes}</p>
          </div>
        )}

        {/* Dates */}
        {item.ordered_date && (
          <div>
            <p className="text-xs font-semibold text-gray-700">Ordered Date</p>
            <p className="mt-1 text-sm text-gray-600">
              {new Date(item.ordered_date).toLocaleDateString()}
            </p>
          </div>
        )}

        {item.received_date && (
          <div>
            <p className="text-xs font-semibold text-gray-700">Received Date</p>
            <p className="mt-1 text-sm text-gray-600">
              {new Date(item.received_date).toLocaleDateString()}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 border-t pt-3">
          {item.status === 'needed' && onMarkOrdered && (
            <Button
              size="sm"
              className="w-full"
              style={{ backgroundColor: '#2D6A4F' }}
              onClick={onMarkOrdered}
            >
              <Check className="mr-2 h-4 w-4" />
              Mark Ordered
            </Button>
          )}

          {item.status === 'ordered' && onMarkReceived && (
            <Button
              size="sm"
              className="w-full"
              style={{ backgroundColor: '#16A34A' }}
              onClick={onMarkReceived}
            >
              <Check className="mr-2 h-4 w-4" />
              Mark Received
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
