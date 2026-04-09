'use client';

import { useEffect, useState } from 'react';
import {
  Car,
  Plus,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Camera,
  X,
  Search,
  Filter,
  MapPin,
  Check,
  Loader2,
  Clock,
  Trash2,
  ChevronDown,
} from 'lucide-react';

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
  useParkingLotIssues,
  issueTypeLabels,
  issueTypeColors,
  severityLabels,
  severityColors,
  issueStatusLabels,
  issueStatusColors,
} from '@/lib/hooks/useParkingLotIssues';
import type { ParkingLotIssue } from '@/types/database';
import { createClient } from '@/lib/supabase/client';

const ISSUE_TYPES = ['pothole', 'crack', 'drainage', 'erosion', 'marking', 'curbing', 'other'] as const;
const SEVERITIES = ['minor', 'moderate', 'severe', 'critical'] as const;
const STATUSES = ['open', 'in_progress', 'scheduled', 'completed'] as const;

interface FormData {
  title: string;
  location: string;
  issueType: typeof ISSUE_TYPES[number];
  severity: typeof SEVERITIES[number];
  description: string;
  estimatedCost: string;
  assignedTo: string;
  photos: string[];
}

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
}

export default function ParkingLotPage() {
  const { issues, loading, fetchIssues, createIssue, updateIssue, deleteIssue } = useParkingLotIssues();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [toastMessage, setToastMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    location: '',
    issueType: 'pothole',
    severity: 'moderate',
    description: '',
    estimatedCost: '',
    assignedTo: '',
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
      const { data } = await (supabase.from("profiles") as any)
        .select("id, full_name, role")
        .order("role")
        .order("full_name");
      if (data) setStaffMembers(data);
    };
    fetchStaff();
  }, []);

  const filteredIssues = issues.filter((issue) => {
    const matchesSearch =
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.location?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || issue.status === statusFilter;
    const matchesSeverity = severityFilter === 'all' || issue.severity === severityFilter;

    return matchesSearch && matchesStatus && matchesSeverity;
  });

  const stats = {
    open: issues.filter((i) => i.status === 'open').length,
    inProgress: issues.filter((i) => i.status === 'in_progress').length,
    completed: issues.filter((i) => i.status === 'completed').length,
    critical: issues.filter((i) => i.severity === 'critical').length,
  };

  const handleFormChange = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop();
      const path = `parking-lot/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('photos')
        .upload(path, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return;
      }

      if (uploadData) {
        const { data } = supabase.storage.from('photos').getPublicUrl(path);
        const publicUrl = data?.publicUrl;

        if (publicUrl) {
          setFormData((prev) => ({
            ...prev,
            photos: [...prev.photos, publicUrl],
          }));
        }
      }
    } catch (error) {
      console.error('Photo upload failed:', error);
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const removePhoto = (url: string) => {
    setFormData((prev) => ({
      ...prev,
      photos: prev.photos.filter((p) => p !== url),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim() || !formData.location.trim()) {
      showToast('error', 'Please fill in title and location');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createIssue({
        title: formData.title,
        location: formData.location || undefined,
        issue_type: formData.issueType,
        severity: formData.severity,
        description: formData.description || undefined,
        estimated_cost: formData.estimatedCost ? parseFloat(formData.estimatedCost) : undefined,
        assigned_to: formData.assignedTo || undefined,
        photos: formData.photos,
      });

      if (!result) {
        showToast('error', 'Failed to save issue. Please try again.');
        return;
      }

      setFormData({
        title: '',
        location: '',
        issueType: 'pothole',
        severity: 'moderate',
        description: '',
        estimatedCost: '',
        assignedTo: '',
        photos: [],
      });

      setIsSheetOpen(false);
      await fetchIssues();
    } catch (error) {
      console.error('Failed to add issue:', error);
      showToast('error', 'Failed to add issue');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusUpdate = async (issueId: string, newStatus: string) => {
    try {
      await updateIssue(issueId, { status: newStatus as any });
    } catch (error) {
      console.error('Failed to update status:', error);
      showToast('error', 'Failed to update status');
    }
  };

  const handleDelete = async (issueId: string) => {
    if (!confirm('Are you sure you want to delete this issue?')) {
      return;
    }

    try {
      await deleteIssue(issueId);
    } catch (error) {
      console.error('Failed to delete issue:', error);
      showToast('error', 'Failed to delete issue');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Toast Message */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border max-w-md ${
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

      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg p-2"
              style={{ backgroundColor: '#1B4332' }}
            >
              <Car className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Parking Lot & Cart Path
              </h1>
              <p className="text-sm text-gray-600">
                Track and manage pavement issues
              </p>
            </div>
          </div>

          <Button
            onClick={() => setIsSheetOpen(true)}
            style={{ backgroundColor: '#D4A853' }}
            className="flex items-center gap-2 text-gray-900 hover:opacity-90"
          >
            <Plus className="h-5 w-5" />
            Add Issue
          </Button>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Open Issues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {stats.open}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                In Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {stats.inProgress}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {stats.completed}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Critical
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {stats.critical}
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
                    placeholder="Search by title or location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="w-full sm:w-48">
                <Label htmlFor="status-filter" className="mb-2 block text-sm font-medium">
                  Status
                </Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-48">
                <Label htmlFor="severity-filter" className="mb-2 block text-sm font-medium">
                  Severity
                </Label>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger id="severity-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="severe">Severe</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Issues List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredIssues.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Car className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="text-gray-600">
                {issues.length === 0
                  ? 'No issues reported yet.'
                  : 'No issues match your filters.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredIssues.map((issue) => {
              const isExpanded = expandedIssueId === issue.id;
              const firstPhoto = issue.photos?.[0];

              return (
                <Card
                  key={issue.id}
                  className="flex flex-col overflow-hidden transition-shadow hover:shadow-lg"
                >
                  {/* Photo Thumbnail */}
                  {firstPhoto && (
                    <div className="relative h-40 w-full overflow-hidden bg-gray-200">
                      <img
                        src={firstPhoto}
                        alt={issue.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="text-base">{issue.title}</CardTitle>
                        <div className="mt-1 flex items-center gap-1 text-sm text-gray-600">
                          <MapPin className="h-4 w-4" />
                          {issue.location}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setExpandedIssueId(isExpanded ? null : issue.id)
                        }
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <ChevronDown
                          className={`h-5 w-5 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>

                    {/* Badges */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge
                        style={{
                          backgroundColor: issueTypeColors[issue.issue_type],
                          color: '#fff',
                        }}
                      >
                        {issueTypeLabels[issue.issue_type]}
                      </Badge>
                      <Badge
                        style={{
                          backgroundColor: severityColors[issue.severity],
                          color: '#fff',
                        }}
                      >
                        {severityLabels[issue.severity]}
                      </Badge>
                      <Badge
                        style={{
                          backgroundColor: issueStatusColors[issue.status],
                          color: '#fff',
                        }}
                      >
                        {issueStatusLabels[issue.status]}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1">
                    <div className="mb-3 text-xs text-gray-500">
                      {new Date(issue.created_at).toLocaleDateString()}
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="space-y-4 border-t pt-4">
                        {/* Description */}
                        {issue.description && (
                          <div>
                            <p className="text-xs font-semibold text-gray-700">
                              Description
                            </p>
                            <p className="mt-1 text-sm text-gray-600">
                              {issue.description}
                            </p>
                          </div>
                        )}

                        {/* Assigned To */}
                        {issue.assigned_to && (
                          <div>
                            <p className="text-xs font-semibold text-gray-700">
                              Assigned To
                            </p>
                            <p className="mt-1 text-sm text-gray-600">
                              {issue.assigned_to}
                            </p>
                          </div>
                        )}

                        {/* Cost */}
                        {issue.estimated_cost != null && (
                          <div>
                            <p className="text-xs font-semibold text-gray-700">
                              Estimated Cost
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              ${Number(issue.estimated_cost).toFixed(2)}
                            </p>
                          </div>
                        )}

                        {/* Repair Notes */}
                        {issue.repair_notes && (
                          <div>
                            <p className="text-xs font-semibold text-gray-700">
                              Repair Notes
                            </p>
                            <p className="mt-1 text-sm text-gray-600">
                              {issue.repair_notes}
                            </p>
                          </div>
                        )}

                        {/* Photos */}
                        {issue.photos && issue.photos.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-700 mb-2">
                              Photos ({issue.photos.length})
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {issue.photos.map((photo, idx) => (
                                <img
                                  key={idx}
                                  src={photo}
                                  alt={`Issue ${idx + 1}`}
                                  className="h-20 w-full rounded object-cover"
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Status Buttons */}
                        <div className="space-y-2 border-t pt-4">
                          {issue.status !== 'in_progress' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() =>
                                handleStatusUpdate(issue.id, 'in_progress')
                              }
                            >
                              <Clock className="mr-2 h-4 w-4" />
                              Mark In Progress
                            </Button>
                          )}

                          {issue.status !== 'scheduled' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() =>
                                handleStatusUpdate(issue.id, 'scheduled')
                              }
                            >
                              Schedule
                            </Button>
                          )}

                          {issue.status !== 'completed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() =>
                                handleStatusUpdate(issue.id, 'completed')
                              }
                            >
                              <Check className="mr-2 h-4 w-4" />
                              Mark Completed
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(issue.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Issue Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="max-h-screen overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Add New Issue
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="font-medium">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g., Large pothole in main lot"
                value={formData.title}
                onChange={(e) => handleFormChange('title', e.target.value)}
                required
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location" className="font-medium">
                Location <span className="text-red-500">*</span>
              </Label>
              <Input
                id="location"
                placeholder="e.g., Cart path between hole 3-4"
                value={formData.location}
                onChange={(e) => handleFormChange('location', e.target.value)}
                required
              />
            </div>

            {/* Issue Type */}
            <div className="space-y-2">
              <Label htmlFor="issue-type" className="font-medium">
                Issue Type
              </Label>
              <Select
                value={formData.issueType}
                onValueChange={(value) =>
                  handleFormChange('issueType', value)
                }
              >
                <SelectTrigger id="issue-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {issueTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Severity */}
            <div className="space-y-2">
              <Label htmlFor="severity" className="font-medium">
                Severity
              </Label>
              <Select
                value={formData.severity}
                onValueChange={(value) =>
                  handleFormChange('severity', value)
                }
              >
                <SelectTrigger id="severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {severityLabels[severity]}
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
                placeholder="Provide details about the issue..."
                value={formData.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
                rows={3}
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

            {/* Assigned To */}
            <div className="space-y-2">
              <Label htmlFor="assignedTo" className="font-medium">
                Assigned To
              </Label>
              <Select
                value={formData.assignedTo}
                onValueChange={(value) => handleFormChange('assignedTo', value)}
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

            {/* Photo Upload */}
            <div className="space-y-2">
              <Label className="font-medium">Photos</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                  className="cursor-pointer"
                />
                {uploadingPhoto && (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                )}
              </div>

              {/* Photo Thumbnails */}
              {formData.photos.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {formData.photos.map((photo, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={photo}
                        alt={`Preview ${idx + 1}`}
                        className="h-24 w-full rounded object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo)}
                        className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                    Add Issue
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
