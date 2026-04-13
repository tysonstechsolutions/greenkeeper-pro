'use client';

import { useEffect, useState } from 'react';
import { Building, Plus, AlertTriangle, ShoppingCart, Wrench, Sparkles, Camera, X, Search, Filter, MapPin, Check, Loader2, Clock, ChevronDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useClubhouseIssues, categoryLabels, categoryColors, clubhousePriorityLabels, clubhousePriorityColors, clubhouseStatusLabels, clubhouseStatusColors } from '@/lib/hooks/useClubhouseIssues';
import { ClubhouseIssue } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { createClient } from '@/lib/supabase/client';

type Category = 'damage' | 'cleaning' | 'order' | 'maintenance';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type Status = 'open' | 'in_progress' | 'scheduled' | 'completed';

const CATEGORIES: Category[] = ['damage', 'cleaning', 'order', 'maintenance'];
const STATUSES: Status[] = ['open', 'in_progress', 'scheduled', 'completed'];

interface FormData {
  title: string;
  category: Category | '';
  priority: Priority;
  location: string;
  description: string;
  assignedTo: string;
  estimatedCost: string;
  photos: string[];
}

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
}

export default function ClubhousePage() {
  const { issues, loading, fetchIssues, createIssue, updateIssue, deleteIssue } = useClubhouseIssues();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | Category>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | Status>('all');
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [toastMessage, setToastMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    category: '',
    priority: 'normal',
    location: '',
    description: '',
    assignedTo: '',
    estimatedCost: '',
    photos: [],
  });

  const showToast = (type: 'error' | 'success', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  useEffect(() => {
    const fetchStaff = async () => {
      const supabase = createClient();
      const { data } = await supabase.from("profiles")
        .select("id, full_name, role")
        .order("role")
        .order("full_name");
      if (data) setStaffMembers(data);
    };
    fetchStaff();
  }, []);

  const filteredIssues = issues.filter((issue) => {
    const matchesSearch = issue.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || issue.category === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || issue.status === selectedStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const stats = {
    openCount: issues.filter(i => i.status === 'open').length,
    inProgressCount: issues.filter(i => i.status === 'in_progress').length,
    completedCount: issues.filter(i => i.status === 'completed').length,
    urgentCount: issues.filter(i => i.priority === 'urgent').length,
    damageCount: issues.filter(i => i.category === 'damage').length,
    cleaningCount: issues.filter(i => i.category === 'cleaning').length,
    orderCount: issues.filter(i => i.category === 'order').length,
    maintenanceCount: issues.filter(i => i.category === 'maintenance').length,
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (value: string) => {
    setFormData(prev => ({ ...prev, category: value as Category }));
  };

  const handlePriorityChange = (value: string) => {
    setFormData(prev => ({ ...prev, priority: value as Priority }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop();
      const path = `clubhouse/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { data: uploadData, error } = await supabase.storage
        .from('photos')
        .upload(path, file);

      if (error) throw error;

      if (uploadData) {
        const { data: { publicUrl } } = supabase.storage
          .from('photos')
          .getPublicUrl(path);

        setFormData(prev => ({
          ...prev,
          photos: [...prev.photos, publicUrl],
        }));
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.category) {
      showToast('error', 'Please fill in required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createIssue({
        title: formData.title,
        category: formData.category,
        priority: formData.priority,
        location: formData.location || undefined,
        description: formData.description || undefined,
        photos: formData.photos,
        estimated_cost: formData.estimatedCost ? parseFloat(formData.estimatedCost) : undefined,
        assigned_to: formData.assignedTo || undefined,
      });

      if (!result) {
        showToast('error', 'Failed to save issue. Please try again.');
        return;
      }

      setFormData({
        title: '',
        category: '',
        priority: 'normal',
        location: '',
        description: '',
        assignedTo: '',
        estimatedCost: '',
        photos: [],
      });
      setIsSheetOpen(false);
      await fetchIssues();
    } catch (error) {
      console.error('Error adding issue:', error);
      showToast('error', 'Failed to add issue');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (issueId: string, newStatus: Status) => {
    try {
      await updateIssue(issueId, { status: newStatus });
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('error', 'Failed to update status');
    }
  };

  const handleDelete = async (issueId: string) => {
    if (!confirm('Are you sure you want to delete this issue?')) return;
    try {
      await deleteIssue(issueId);
    } catch (error) {
      console.error('Error deleting issue:', error);
      showToast('error', 'Failed to delete issue');
    }
  };

  const getCategoryIcon = (category: Category) => {
    const icons: Record<Category, React.ReactNode> = {
      damage: <AlertTriangle className="w-4 h-4" />,
      cleaning: <Sparkles className="w-4 h-4" />,
      order: <ShoppingCart className="w-4 h-4" />,
      maintenance: <Wrench className="w-4 h-4" />,
    };
    return icons[category];
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-6">
      {/* Toast Message */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border max-w-md animate-in fade-in slide-in-from-top-2 ${
          toastMessage.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-green-50 border-green-200 text-green-800'
        }`}>
          {toastMessage.type === 'error' ? (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-[#1B4332] to-[#0d2818] rounded-lg">
                <Building className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Clubhouse</h1>
                <p className="text-gray-600">Issues & Maintenance Tracking</p>
              </div>
            </div>
            <Button
              onClick={() => setIsSheetOpen(true)}
              className="bg-[#D4A853] hover:bg-[#c09640] text-gray-900 font-semibold gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Issue
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Open Issues</div>
              <div className="text-3xl font-bold text-gray-900">{stats.openCount}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">In Progress</div>
              <div className="text-3xl font-bold text-gray-900">{stats.inProgressCount}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Completed</div>
              <div className="text-3xl font-bold text-gray-900">{stats.completedCount}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Urgent</div>
              <div className="text-3xl font-bold text-gray-900">{stats.urgentCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Row 2 - By Category */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5" style={{ color: categoryColors['damage'] }} />
                <span className="text-sm text-gray-600">Damage</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.damageCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5" style={{ color: categoryColors['cleaning'] }} />
                <span className="text-sm text-gray-600">Cleaning</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.cleaningCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="w-5 h-5" style={{ color: categoryColors['order'] }} />
                <span className="text-sm text-gray-600">Orders</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.orderCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-5 h-5" style={{ color: categoryColors['maintenance'] }} />
                <span className="text-sm text-gray-600">Maintenance</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.maintenanceCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <div className="flex flex-col gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search issues..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Category and Status Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label className="text-xs font-semibold text-gray-700 mb-2 block">Category</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectedCategory === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory('all')}
                    className={selectedCategory === 'all' ? 'bg-[#1B4332] hover:bg-[#0d2818]' : ''}
                  >
                    All
                  </Button>
                  {CATEGORIES.map((cat) => (
                    <Button
                      key={cat}
                      variant={selectedCategory === cat ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory(cat)}
                      className={selectedCategory === cat ? 'bg-[#1B4332] hover:bg-[#0d2818]' : ''}
                    >
                      {categoryLabels[cat]}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex-1">
                <Label className="text-xs font-semibold text-gray-700 mb-2 block">Status</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectedStatus === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedStatus('all')}
                    className={selectedStatus === 'all' ? 'bg-[#1B4332] hover:bg-[#0d2818]' : ''}
                  >
                    All
                  </Button>
                  {STATUSES.map((status) => (
                    <Button
                      key={status}
                      variant={selectedStatus === status ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedStatus(status as Status)}
                      className={selectedStatus === status ? 'bg-[#1B4332] hover:bg-[#0d2818]' : ''}
                    >
                      {clubhouseStatusLabels[status]}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Issues Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-8 h-8 text-[#1B4332] animate-spin" />
          </div>
        ) : filteredIssues.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Building className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No issues found</p>
              <p className="text-gray-400 text-sm mt-1">Create a new issue or adjust your filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredIssues.map((issue) => (
              <Card
                key={issue.id}
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() =>
                  setExpandedIssueId(expandedIssueId === issue.id ? null : issue.id)
                }
              >
                {/* Photo Thumbnail */}
                {issue.photos && issue.photos.length > 0 && (
                  <div className="relative w-full h-48 bg-gray-200 overflow-hidden">
                    <img
                      src={issue.photos[0]}
                      alt={issue.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <CardContent className="pt-6">
                  {/* Title and Category */}
                  <div className="mb-4">
                    <h3 className="font-bold text-lg text-gray-900 mb-2">{issue.title}</h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        style={{
                          backgroundColor: categoryColors[issue.category],
                          color: '#fff',
                        }}
                        className="flex items-center gap-1"
                      >
                        {getCategoryIcon(issue.category)}
                        {categoryLabels[issue.category]}
                      </Badge>
                      <Badge
                        style={{
                          backgroundColor: clubhousePriorityColors[issue.priority],
                          color: '#fff',
                        }}
                      >
                        {clubhousePriorityLabels[issue.priority]}
                      </Badge>
                      <Badge
                        style={{
                          backgroundColor: clubhouseStatusColors[issue.status],
                          color: '#fff',
                        }}
                      >
                        {clubhouseStatusLabels[issue.status]}
                      </Badge>
                    </div>
                  </div>

                  {/* Location */}
                  {issue.location && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                      <MapPin className="w-4 h-4" />
                      {issue.location}
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="space-y-2 mb-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {new Date(issue.created_at).toLocaleDateString()}
                    </div>
                    {issue.assigned_to && (
                      <div className="text-gray-700">
                        <span className="font-semibold">Assigned to:</span> {issue.assigned_to}
                      </div>
                    )}
                    {issue.estimated_cost != null && (
                      <div className="text-gray-700">
                        <span className="font-semibold">Est. Cost:</span> ${Number(issue.estimated_cost).toFixed(2)}
                      </div>
                    )}
                  </div>

                  {/* Expanded Content */}
                  {expandedIssueId === issue.id && (
                    <div className="border-t pt-4 mt-4 space-y-4">
                      {/* Description */}
                      {issue.description && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2">Description</h4>
                          <p className="text-gray-600 text-sm">{issue.description}</p>
                        </div>
                      )}

                      {/* All Photos */}
                      {issue.photos && issue.photos.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2">
                            Photos ({issue.photos.length})
                          </h4>
                          <div className="grid grid-cols-2 gap-2">
                            {issue.photos.map((photo, idx) => (
                              <img
                                key={idx}
                                src={photo}
                                alt={`Issue photo ${idx + 1}`}
                                className="w-full h-24 object-cover rounded"
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Repair Notes */}
                      {issue.repair_notes && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2">Repair Notes</h4>
                          <p className="text-gray-600 text-sm">{issue.repair_notes}</p>
                        </div>
                      )}

                      {/* Status Update Buttons */}
                      <div className="space-y-2 border-t pt-4">
                        <div className="flex flex-wrap gap-2">
                          {issue.status !== 'in_progress' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(issue.id, 'in_progress');
                              }}
                            >
                              Mark In Progress
                            </Button>
                          )}

                          {issue.category === 'order' &&
                            issue.status !== 'scheduled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(issue.id, 'scheduled');
                                }}
                              >
                                Mark Ordered
                              </Button>
                            )}

                          {issue.status !== 'scheduled' &&
                            issue.status !== 'completed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(issue.id, 'scheduled');
                                }}
                              >
                                Mark Scheduled
                              </Button>
                            )}

                          {issue.status !== 'completed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-600 hover:bg-green-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(issue.id, 'completed');
                              }}
                            >
                              Mark Completed
                            </Button>
                          )}
                        </div>

                        {/* Delete Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-red-600 border-red-600 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(issue.id);
                          }}
                        >
                          Delete Issue
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Issue Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader className="mb-6">
            <SheetTitle>Add New Issue</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <Label htmlFor="title" className="font-semibold mb-2 block">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleFormChange}
                placeholder="Issue title"
                required
              />
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="category" className="font-semibold mb-2 block">
                Category <span className="text-red-500">*</span>
              </Label>
              <Select value={formData.category} onValueChange={handleCategoryChange}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {categoryLabels[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div>
              <Label htmlFor="priority" className="font-semibold mb-2 block">
                Priority
              </Label>
              <Select value={formData.priority} onValueChange={handlePriorityChange}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{clubhousePriorityLabels['low']}</SelectItem>
                  <SelectItem value="normal">{clubhousePriorityLabels['normal']}</SelectItem>
                  <SelectItem value="high">{clubhousePriorityLabels['high']}</SelectItem>
                  <SelectItem value="urgent">{clubhousePriorityLabels['urgent']}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div>
              <Label htmlFor="location" className="font-semibold mb-2 block">
                Location
              </Label>
              <Input
                id="location"
                name="location"
                value={formData.location}
                onChange={handleFormChange}
                placeholder="e.g., Pro shop, Men's locker room"
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description" className="font-semibold mb-2 block">
                Description
              </Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleFormChange}
                placeholder="Detailed description of the issue"
                rows={4}
              />
            </div>

            {/* Assigned To */}
            <div>
              <Label htmlFor="assignedTo" className="font-semibold mb-2 block">
                Assigned To
              </Label>
              <Select
                value={formData.assignedTo}
                onValueChange={(value) => setFormData(prev => ({ ...prev, assignedTo: value }))}
              >
                <SelectTrigger id="assignedTo">
                  <SelectValue placeholder="Select staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staffMembers.filter(s => s.role === 'mechanic').length > 0 && (
                    <>
                      <SelectItem value="__mechanic_header" disabled>— Mechanics —</SelectItem>
                      {staffMembers.filter(s => s.role === 'mechanic').map(s => (
                        <SelectItem key={s.id} value={s.full_name}>{s.full_name}</SelectItem>
                      ))}
                      <SelectItem value="__all_header" disabled>— All Staff —</SelectItem>
                    </>
                  )}
                  {staffMembers.filter(s => s.role !== 'mechanic').map(s => (
                    <SelectItem key={s.id} value={s.full_name}>
                      {s.full_name} ({s.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estimated Cost */}
            <div>
              <Label htmlFor="estimatedCost" className="font-semibold mb-2 block">
                Estimated Cost
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <Input
                  id="estimatedCost"
                  name="estimatedCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.estimatedCost}
                  onChange={handleFormChange}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
            </div>

            {/* Photo Upload */}
            <div>
              <Label className="font-semibold mb-2 block">Photos</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                  className="hidden"
                  id="photo-input"
                />
                <label
                  htmlFor="photo-input"
                  className="flex flex-col items-center justify-center cursor-pointer"
                >
                  {uploadingPhoto ? (
                    <>
                      <Loader2 className="w-6 h-6 text-gray-400 animate-spin mb-2" />
                      <span className="text-sm text-gray-600">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-6 h-6 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-600">Click to upload or take photo</span>
                    </>
                  )}
                </label>
              </div>

              {/* Photo Thumbnails */}
              {formData.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {formData.photos.map((photo, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={photo}
                        alt={`Upload ${idx + 1}`}
                        className="w-full h-20 object-cover rounded"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <SheetFooter className="gap-3 pt-6">
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
                className="bg-[#1B4332] hover:bg-[#0d2818]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Issue'
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
