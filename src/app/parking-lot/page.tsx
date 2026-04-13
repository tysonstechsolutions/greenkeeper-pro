'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import {
  Car,
  Plus,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Camera,
  X,
  Search,
  MapPin,
  Check,
  Loader2,
  Clock,
  Trash2,
  ChevronDown,
  Map,
  List,
  Move,
  ZoomIn,
  ZoomOut,
  Maximize,
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
  issueTypeIcons,
  issueTypeColors,
  severityLabels,
  severityColors,
  issueStatusLabels,
  issueStatusColors,
} from '@/lib/hooks/useParkingLotIssues';
import type { ParkingLotIssue, IssueStatus } from '@/types/database';
import { createClient } from '@/lib/supabase/client';

const ISSUE_TYPES = ['pothole', 'low_area', 'badly_cracked', 'crack', 'drainage', 'marking', 'curbing', 'other'] as const;
const SEVERITIES = ['minor', 'moderate', 'severe', 'critical'] as const;

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
}

export default function ParkingLotPage() {
  const { issues, loading, fetchIssues, createIssue, updateIssue, deleteIssue } = useParkingLotIssues();

  // View mode
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  // Map state
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [movingIssueId, setMovingIssueId] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<ParkingLotIssue | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

  // Form state
  const [showFormSheet, setShowFormSheet] = useState(false);
  const [formData, setFormData] = useState({
    issueType: 'pothole' as typeof ISSUE_TYPES[number],
    severity: 'moderate' as typeof SEVERITIES[number],
    location: '',
    description: '',
    estimatedCost: '',
    assignedTo: '',
    photos: [] as string[],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // List filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  // Staff & Toast
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [toastMessage, setToastMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  const showToast = (type: 'error' | 'success', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => { fetchIssues(); }, [fetchIssues]);
  useEffect(() => {
    const fetchStaff = async () => {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("id, full_name, role").order("full_name");
      if (data) setStaffMembers(data);
    };
    fetchStaff();
  }, []);

  // Stats
  const stats = {
    open: issues.filter((i) => i.status === 'open').length,
    inProgress: issues.filter((i) => i.status === 'in_progress').length,
    completed: issues.filter((i) => i.status === 'completed').length,
    critical: issues.filter((i) => i.severity === 'critical').length,
  };

  // Map issues (only those with coordinates, non-completed)
  const mapIssues = issues.filter((i) => i.pin_x != null && i.pin_y != null && i.status !== 'completed');

  // Filtered issues for list view
  const filteredIssues = issues.filter((issue) => {
    const matchesSearch = issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.location?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || issue.status === statusFilter;
    const matchesSeverity = severityFilter === 'all' || issue.severity === severityFilter;
    return matchesSearch && matchesStatus && matchesSeverity;
  });

  // ── Image Tap Handler ──
  const handleImageTap = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isPlacingPin && !movingIssueId) return;
    e.preventDefault();
    e.stopPropagation();

    const container = imageContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ("changedTouches" in e) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    if (movingIssueId) {
      updateIssue(movingIssueId, { pin_x: x, pin_y: y } as Partial<ParkingLotIssue>).then((result) => {
        if (result) showToast('success', 'Pin moved successfully.');
        else showToast('error', 'Failed to move pin.');
      });
      setMovingIssueId(null);
      return;
    }

    // Placing new pin
    setPendingPin({ x, y });
    setIsPlacingPin(false);
    setFormData({ issueType: 'pothole', severity: 'moderate', location: '', description: '', estimatedCost: '', assignedTo: '', photos: [] });
    setShowFormSheet(true);
  }, [isPlacingPin, movingIssueId, updateIssue]);

  // ── Photo Upload ──
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop();
      const path = `parking-lot/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('photos').upload(path, file);
      if (uploadError) { console.error('Upload error:', uploadError); return; }
      const { data } = supabase.storage.from('photos').getPublicUrl(path);
      if (data?.publicUrl) {
        setFormData((prev) => ({ ...prev, photos: [...prev.photos, data.publicUrl] }));
      }
    } catch (error) {
      console.error('Photo upload failed:', error);
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  // ── Submit New Issue ──
  const handleSubmit = async () => {
    if (!pendingPin) return;
    setIsSubmitting(true);
    try {
      const title = issueTypeLabels[formData.issueType] || formData.issueType;
      const result = await createIssue({
        title,
        location: formData.location || undefined,
        pin_x: pendingPin.x,
        pin_y: pendingPin.y,
        issue_type: formData.issueType,
        severity: formData.severity,
        description: formData.description || undefined,
        estimated_cost: formData.estimatedCost ? parseFloat(formData.estimatedCost) : undefined,
        assigned_to: formData.assignedTo || undefined,
        photos: formData.photos,
      });
      if (result) {
        setShowFormSheet(false);
        setPendingPin(null);
        showToast('success', 'Issue reported successfully.');
      } else {
        showToast('error', 'Failed to save issue.');
      }
    } catch {
      showToast('error', 'Failed to add issue.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Status & Delete ──
  const handleStatusUpdate = async (issueId: string, newStatus: string) => {
    await updateIssue(issueId, { status: newStatus as IssueStatus });
    setSelectedIssue(null);
  };

  const handleDelete = async (issueId: string) => {
    if (!confirm('Delete this issue?')) return;
    await deleteIssue(issueId);
    setSelectedIssue(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-6">
      {/* Toast */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border max-w-md ${
          toastMessage.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'
        }`}>
          {toastMessage.type === 'error' ? <AlertCircle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
          <span className="text-sm font-medium">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2" style={{ backgroundColor: '#1B4332' }}>
              <Car className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Parking & Cart Paths</h1>
              <p className="text-xs text-gray-600">Track asphalt issues across the course</p>
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-1">
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'map' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
              }`}
            >
              <Map className="w-3.5 h-3.5" /> Map
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
              }`}
            >
              <List className="w-3.5 h-3.5" /> List
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-4 grid grid-cols-4 gap-2">
          <Card className="p-3">
            <p className="text-[10px] font-medium text-gray-500 uppercase">Open</p>
            <p className="text-xl font-bold text-gray-900">{stats.open}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] font-medium text-gray-500 uppercase">In Progress</p>
            <p className="text-xl font-bold text-blue-600">{stats.inProgress}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] font-medium text-gray-500 uppercase">Done</p>
            <p className="text-xl font-bold text-green-600">{stats.completed}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] font-medium text-gray-500 uppercase">Critical</p>
            <p className="text-xl font-bold text-red-600">{stats.critical}</p>
          </Card>
        </div>

        {/* ═══════════ MAP VIEW ═══════════ */}
        {viewMode === 'map' && (
          <div className="relative">
            {/* Map Container */}
            <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100" style={{ height: 'calc(100dvh - 280px)', minHeight: '400px' }}>
              <TransformWrapper
                minScale={1}
                maxScale={8}
                initialScale={1}
                panning={{ disabled: isPlacingPin || !!movingIssueId }}
                doubleClick={{ disabled: true }}
                onTransform={(_ref: unknown, state: { scale: number }) => { setZoomScale(state.scale); }}
              >
                {({ zoomIn, zoomOut, resetTransform }) => (
                  <>
                    <TransformComponent
                      wrapperStyle={{ width: '100%', height: '100%' }}
                      contentStyle={{ width: '100%', height: '100%' }}
                    >
                      <div
                        ref={imageContainerRef}
                        className="relative w-full h-full"
                        onClick={handleImageTap}
                        onTouchEnd={handleImageTap}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/course-aerial.png"
                          alt="Course aerial view"
                          className="w-full h-full object-contain"
                          draggable={false}
                        />

                        {/* Existing issue pins — counter-scaled so they stay fixed size */}
                        {mapIssues.map((issue) => (
                          <button
                            key={issue.id}
                            className="absolute z-10 group"
                            style={{
                              left: `${(issue.pin_x ?? 0) * 100}%`,
                              top: `${(issue.pin_y ?? 0) * 100}%`,
                              transform: `translate(-50%, -100%) scale(${1 / zoomScale})`,
                              transformOrigin: 'bottom center',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isPlacingPin && !movingIssueId) setSelectedIssue(issue);
                            }}
                          >
                            <div className="relative">
                              <svg width="16" height="20" viewBox="0 0 28 36" fill="none" className="drop-shadow-md">
                                <path
                                  d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z"
                                  fill={severityColors[issue.severity] || '#6B7280'}
                                />
                                <circle cx="14" cy="13" r="6" fill="white" fillOpacity="0.9" />
                              </svg>
                              <span className="absolute top-[2px] left-1/2 -translate-x-1/2 text-[7px]">
                                {issueTypeIcons[issue.issue_type] || '📍'}
                              </span>
                            </div>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-card border border-border rounded-lg shadow-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                              {issue.title}
                            </div>
                          </button>
                        ))}

                        {/* Pending pin (gold) — counter-scaled */}
                        {pendingPin && (
                          <div
                            className="absolute z-20 animate-bounce"
                            style={{
                              left: `${pendingPin.x * 100}%`,
                              top: `${pendingPin.y * 100}%`,
                              transform: `translate(-50%, -100%) scale(${1 / zoomScale})`,
                              transformOrigin: 'bottom center',
                            }}
                          >
                            <svg width="18" height="22" viewBox="0 0 28 36" fill="none">
                              <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#D4A853" />
                              <circle cx="14" cy="13" r="6" fill="white" fillOpacity="0.9" />
                              <circle cx="14" cy="13" r="3" fill="#D4A853" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </TransformComponent>

                    {/* Zoom Controls */}
                    <div className="absolute top-3 right-3 flex flex-col gap-1 z-20">
                      <button onClick={() => zoomIn()} className="bg-white/90 backdrop-blur rounded-lg p-2 shadow border border-gray-200 hover:bg-gray-50">
                        <ZoomIn className="w-4 h-4 text-gray-700" />
                      </button>
                      <button onClick={() => zoomOut()} className="bg-white/90 backdrop-blur rounded-lg p-2 shadow border border-gray-200 hover:bg-gray-50">
                        <ZoomOut className="w-4 h-4 text-gray-700" />
                      </button>
                      <button onClick={() => resetTransform()} className="bg-white/90 backdrop-blur rounded-lg p-2 shadow border border-gray-200 hover:bg-gray-50">
                        <Maximize className="w-4 h-4 text-gray-700" />
                      </button>
                    </div>
                  </>
                )}
              </TransformWrapper>

              {/* Pin placement overlay */}
              {isPlacingPin && (
                <div className="absolute inset-0 pointer-events-none flex items-end justify-center pb-4 z-30">
                  <div className="bg-[#1B4332] text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2 pointer-events-auto">
                    <MapPin className="w-4 h-4" />
                    Tap to place issue pin
                    <button onClick={() => { setIsPlacingPin(false); }} className="ml-2 bg-white/20 rounded-full p-1">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Move pin overlay */}
              {movingIssueId && (
                <div className="absolute inset-0 pointer-events-none flex items-end justify-center pb-4 z-30">
                  <div className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2 pointer-events-auto">
                    <Move className="w-4 h-4" />
                    Tap new location
                    <button onClick={() => setMovingIssueId(null)} className="ml-2 bg-white/20 rounded-full p-1">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* FAB — Report Issue */}
            {!isPlacingPin && !movingIssueId && (
              <button
                onClick={() => setIsPlacingPin(true)}
                className="fixed bottom-24 right-4 md:hidden w-14 h-14 rounded-full shadow-lg flex items-center justify-center z-30 active:scale-95 transition-all"
                style={{ backgroundColor: '#D4A853' }}
              >
                <Plus className="w-6 h-6 text-gray-900" />
              </button>
            )}

            {/* Desktop report button */}
            <div className="hidden md:flex justify-end mt-3">
              <Button onClick={() => setIsPlacingPin(true)} style={{ backgroundColor: '#D4A853' }} className="text-gray-900 hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Report Issue
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════ LIST VIEW ═══════════ */}
        {viewMode === 'list' && (
          <>
            {/* Filters */}
            <Card className="mb-4">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severity</SelectItem>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="severe">Severe</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Issues Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
            ) : filteredIssues.length === 0 ? (
              <Card><CardContent className="py-12 text-center"><Car className="mx-auto mb-4 h-12 w-12 text-gray-300" /><p className="text-gray-600">{issues.length === 0 ? 'No issues reported yet.' : 'No issues match your filters.'}</p></CardContent></Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredIssues.map((issue) => {
                  const isExpanded = expandedIssueId === issue.id;
                  const firstPhoto = issue.photos?.[0];
                  return (
                    <Card key={issue.id} className="flex flex-col overflow-hidden transition-shadow hover:shadow-lg">
                      {firstPhoto && (
                        <div className="relative h-32 w-full overflow-hidden bg-gray-200">
                          <img src={firstPhoto} alt={issue.title} className="h-full w-full object-cover" />
                        </div>
                      )}
                      <CardHeader className="pb-2 pt-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <CardTitle className="text-sm">{issueTypeIcons[issue.issue_type]} {issue.title}</CardTitle>
                            {issue.location && <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500"><MapPin className="h-3 w-3" />{issue.location}</p>}
                          </div>
                          <button onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)} className="text-gray-400 hover:text-gray-600">
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Badge className="text-[10px] px-1.5 py-0.5" style={{ backgroundColor: issueTypeColors[issue.issue_type], color: '#fff' }}>{issueTypeLabels[issue.issue_type]}</Badge>
                          <Badge className="text-[10px] px-1.5 py-0.5" style={{ backgroundColor: severityColors[issue.severity], color: '#fff' }}>{severityLabels[issue.severity]}</Badge>
                          <Badge className="text-[10px] px-1.5 py-0.5" style={{ backgroundColor: issueStatusColors[issue.status], color: '#fff' }}>{issueStatusLabels[issue.status]}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3">
                        <p className="text-[10px] text-gray-400">{new Date(issue.created_at).toLocaleDateString()}</p>
                        {isExpanded && (
                          <div className="space-y-3 border-t mt-2 pt-3">
                            {issue.description && <p className="text-xs text-gray-600">{issue.description}</p>}
                            {issue.estimated_cost != null && <p className="text-xs font-semibold">${Number(issue.estimated_cost).toFixed(2)}</p>}
                            {issue.photos && issue.photos.length > 0 && (
                              <div className="grid grid-cols-3 gap-1">{issue.photos.map((p, i) => <img key={i} src={p} alt="" className="h-16 rounded object-cover w-full" />)}</div>
                            )}
                            <div className="space-y-1.5 pt-2">
                              {issue.status !== 'completed' && (
                                <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => handleStatusUpdate(issue.id, 'completed')}>
                                  <Check className="mr-1 h-3 w-3" /> Complete
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="w-full h-8 text-xs border-red-200 text-red-600" onClick={() => handleDelete(issue.id)}>
                                <Trash2 className="mr-1 h-3 w-3" /> Delete
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
          </>
        )}
      </div>

      {/* ═══════════ ADD ISSUE SHEET ═══════════ */}
      <Sheet open={showFormSheet} onOpenChange={(open) => { setShowFormSheet(open); if (!open) setPendingPin(null); }}>
        <SheetContent className="max-h-screen overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Report Issue
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 py-4">
            {/* Issue Type */}
            <div className="space-y-2">
              <Label className="font-medium">Issue Type</Label>
              <Select value={formData.issueType} onValueChange={(v) => setFormData((p) => ({ ...p, issueType: v as typeof ISSUE_TYPES[number] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ISSUE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        <span>{issueTypeIcons[type]}</span> {issueTypeLabels[type]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Severity */}
            <div className="space-y-2">
              <Label className="font-medium">Severity</Label>
              <Select value={formData.severity} onValueChange={(v) => setFormData((p) => ({ ...p, severity: v as typeof SEVERITIES[number] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>{severityLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label className="font-medium">Location</Label>
              <Input placeholder="e.g., Cart path between holes 5-6" value={formData.location} onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))} />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="font-medium">Description</Label>
              <Textarea placeholder="Describe the issue..." value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} rows={3} />
            </div>

            {/* Estimated Cost */}
            <div className="space-y-2">
              <Label className="font-medium">Estimated Cost</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <Input type="number" step="0.01" min="0" placeholder="0.00" className="pl-7" value={formData.estimatedCost} onChange={(e) => setFormData((p) => ({ ...p, estimatedCost: e.target.value }))} />
              </div>
            </div>

            {/* Assigned To */}
            <div className="space-y-2">
              <Label className="font-medium">Assign To</Label>
              <Select value={formData.assignedTo} onValueChange={(v) => setFormData((p) => ({ ...p, assignedTo: v }))}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staffMembers.map((s) => (
                    <SelectItem key={s.id} value={s.full_name}>{s.full_name} ({s.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Photo */}
            <div className="space-y-2">
              <Label className="font-medium">Photo</Label>
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-3 cursor-pointer hover:border-gray-400 transition-colors">
                  <Camera className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-500">{uploadingPhoto ? 'Uploading...' : 'Take or choose photo'}</span>
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} disabled={uploadingPhoto} className="hidden" />
                </label>
              </div>
              {formData.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {formData.photos.map((photo, idx) => (
                    <div key={idx} className="relative">
                      <img src={photo} alt="" className="h-20 w-full rounded object-cover" />
                      <button type="button" onClick={() => setFormData((p) => ({ ...p, photos: p.photos.filter((_, i) => i !== idx) }))} className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <SheetFooter className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowFormSheet(false); setPendingPin(null); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} style={{ backgroundColor: '#1B4332' }} className="text-white hover:opacity-90">
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Plus className="mr-2 h-4 w-4" />Report Issue</>}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ═══════════ DETAIL SHEET ═══════════ */}
      <Sheet open={!!selectedIssue} onOpenChange={(open) => { if (!open) setSelectedIssue(null); }}>
        <SheetContent className="max-h-screen overflow-y-auto sm:max-w-lg">
          {selectedIssue && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="text-lg">{issueTypeIcons[selectedIssue.issue_type]}</span>
                  <span className="flex-1 truncate">{selectedIssue.title}</span>
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-4 mt-4 pb-6">
                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge style={{ backgroundColor: issueTypeColors[selectedIssue.issue_type], color: '#fff' }}>{issueTypeLabels[selectedIssue.issue_type]}</Badge>
                  <Badge style={{ backgroundColor: severityColors[selectedIssue.severity], color: '#fff' }}>{severityLabels[selectedIssue.severity]}</Badge>
                  <Badge style={{ backgroundColor: issueStatusColors[selectedIssue.status], color: '#fff' }}>{issueStatusLabels[selectedIssue.status]}</Badge>
                </div>

                {/* Location */}
                {selectedIssue.location && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4" />
                    {selectedIssue.location}
                  </div>
                )}

                {/* Description */}
                {selectedIssue.description && <p className="text-sm text-gray-700">{selectedIssue.description}</p>}

                {/* Cost */}
                {selectedIssue.estimated_cost != null && (
                  <p className="text-sm"><span className="font-medium">Est. Cost:</span> ${Number(selectedIssue.estimated_cost).toFixed(2)}</p>
                )}

                {/* Photos */}
                {selectedIssue.photos?.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedIssue.photos.map((p, i) => <img key={i} src={p} alt="" className="rounded-lg object-cover w-full h-32" />)}
                  </div>
                )}

                {/* Date */}
                <p className="text-xs text-gray-400">Reported {new Date(selectedIssue.created_at).toLocaleDateString()}</p>

                {/* Actions */}
                <div className="space-y-2 border-t pt-4">
                  {selectedIssue.status !== 'completed' && (
                    <>
                      <Button size="sm" variant="outline" className="w-full" onClick={() => {
                        setMovingIssueId(selectedIssue.id);
                        setSelectedIssue(null);
                      }}>
                        <Move className="mr-2 h-4 w-4" /> Move Pin
                      </Button>
                      {selectedIssue.status !== 'in_progress' && (
                        <Button size="sm" variant="outline" className="w-full" onClick={() => handleStatusUpdate(selectedIssue.id, 'in_progress')}>
                          <Clock className="mr-2 h-4 w-4" /> Mark In Progress
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="w-full" onClick={() => handleStatusUpdate(selectedIssue.id, 'completed')}>
                        <Check className="mr-2 h-4 w-4" /> Mark Completed
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleDelete(selectedIssue.id)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
