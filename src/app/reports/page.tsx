"use client";

import { useState, useRef, useCallback } from "react";
import {
  FileText,
  Calendar,
  Download,
  Printer,
  Users,
  Beaker,
  Wrench,
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  FileSpreadsheet,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useReports, type DailyReportData, type WeeklyReportData, type EquipmentReportData, type ChemicalReportData } from "@/lib/hooks/useReports";
import { exportElementToPDF, exportToCSV, generateReportFilename, printElement, formatReportDate, formatDateRange } from "@/lib/utils/pdf-export";
import { useAuth } from "@/lib/hooks/useAuth";
import { RoleGuard, MANAGEMENT_ROLES } from "@/components/auth/role-guard";

const REPORT_TYPES = [
  {
    id: "daily",
    name: "Daily Operations",
    description: "Summary of daily activities, tasks completed, and conditions",
    icon: Calendar,
    color: "#1B4332",
  },
  {
    id: "weekly",
    name: "Weekly Summary",
    description: "Week-over-week performance and highlights",
    icon: BarChart3,
    color: "#2D6A4F",
  },
  {
    id: "monthly",
    name: "Monthly Condition",
    description: "Comprehensive monthly analysis with trends",
    icon: TrendingUp,
    color: "#40916C",
  },
  {
    id: "staff",
    name: "Staff Performance",
    description: "Individual productivity and task completion metrics",
    icon: Users,
    color: "#52B788",
    requiresRole: ["super", "asst_super"],
  },
  {
    id: "chemical",
    name: "Chemical Compliance",
    description: "Application records and regulatory compliance",
    icon: Beaker,
    color: "#74C69D",
    requiresRole: ["super", "asst_super"],
  },
  {
    id: "equipment",
    name: "Equipment Fleet",
    description: "Maintenance history and fleet status",
    icon: Wrench,
    color: "#95D5B2",
  },
];

type ReportTypeId = "daily" | "weekly" | "monthly" | "staff" | "chemical" | "equipment";

export default function ReportsPage() {
  const { profile } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);
  const [activeReport, setActiveReport] = useState<ReportTypeId | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState("generate");

  // Report-specific state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split("T")[0];
  });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  // Report data
  const [dailyReport, setDailyReport] = useState<DailyReportData | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportData | null>(null);
  const [equipmentReport, setEquipmentReport] = useState<EquipmentReportData | null>(null);
  const [chemicalReport, setChemicalReport] = useState<ChemicalReportData | null>(null);

  const {
    generateDailyReport,
    generateWeeklyReport,
    generateChemicalReport,
    generateEquipmentReport,
  } = useReports();

  // Check if user can access report type
  const canAccessReport = useCallback((reportType: typeof REPORT_TYPES[number]) => {
    if (!reportType.requiresRole) return true;
    return reportType.requiresRole.includes(profile?.role || "");
  }, [profile?.role]);

  // Generate report
  const handleGenerateReport = useCallback(async (reportType: ReportTypeId) => {
    setGenerating(true);
    try {
      switch (reportType) {
        case "daily":
          const daily = await generateDailyReport(selectedDate);
          setDailyReport(daily);
          break;
        case "weekly":
          const weekly = await generateWeeklyReport(selectedWeekStart);
          setWeeklyReport(weekly);
          break;
        case "equipment":
          const equipment = await generateEquipmentReport(dateRange);
          setEquipmentReport(equipment);
          break;
        case "chemical":
          const chemical = await generateChemicalReport(dateRange);
          setChemicalReport(chemical);
          break;
      }
      setActiveTab("view");
    } catch (error) {
      console.error("Error generating report:", error);
    } finally {
      setGenerating(false);
    }
  }, [selectedDate, selectedWeekStart, dateRange, generateDailyReport, generateWeeklyReport, generateEquipmentReport, generateChemicalReport]);

  // Export handlers
  const handleExportPDF = async () => {
    if (!reportRef.current || !activeReport) return;
    setExporting(true);
    try {
      await exportElementToPDF(reportRef.current, {
        title: REPORT_TYPES.find(r => r.id === activeReport)?.name || "Report",
        subtitle: getReportSubtitle(),
        filename: generateReportFilename(activeReport, selectedDate),
        orientation: activeReport === "equipment" || activeReport === "chemical" ? "landscape" : "portrait",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    if (!activeReport) return;

    let data: Record<string, unknown>[] = [];
    let headers: { key: string; label: string }[] = [];

    switch (activeReport) {
      case "daily":
        if (dailyReport?.tasks?.list) {
          data = dailyReport.tasks.list.map(t => ({
            title: t.title,
            status: t.status,
            assignee: t.assignee || "",
            category: t.category,
          }));
          headers = [
            { key: "title", label: "Task" },
            { key: "status", label: "Status" },
            { key: "assignee", label: "Assigned To" },
            { key: "category", label: "Category" },
          ];
        }
        break;
      case "equipment":
        if (equipmentReport?.maintenance_log) {
          data = equipmentReport.maintenance_log.map(m => ({
            date: m.date,
            equipment: m.equipment_name,
            type: m.log_type,
            description: m.description,
            cost: m.cost,
            vendor: m.vendor || "",
          }));
          headers = [
            { key: "date", label: "Date" },
            { key: "equipment", label: "Equipment" },
            { key: "type", label: "Type" },
            { key: "description", label: "Description" },
            { key: "cost", label: "Cost" },
            { key: "vendor", label: "Vendor" },
          ];
        }
        break;
      case "chemical":
        if (chemicalReport?.applications) {
          data = chemicalReport.applications.map(a => ({
            date: a.date,
            product: a.product_name,
            zones: a.zones.join(", "),
            rate: a.application_rate || "",
            area_sqft: a.area_sqft || "",
            applicator: a.applicator_name || "",
          }));
          headers = [
            { key: "date", label: "Date" },
            { key: "product", label: "Product" },
            { key: "zones", label: "Zones" },
            { key: "rate", label: "Rate" },
            { key: "area_sqft", label: "Area (sq ft)" },
            { key: "applicator", label: "Applicator" },
          ];
        }
        break;
    }

    if (data.length > 0) {
      exportToCSV(data, generateReportFilename(activeReport, selectedDate), headers as { key: keyof typeof data[0]; label: string }[]);
    }
  };

  const handlePrint = () => {
    if (!reportRef.current) return;
    printElement(reportRef.current, REPORT_TYPES.find(r => r.id === activeReport)?.name);
  };

  const getReportSubtitle = () => {
    switch (activeReport) {
      case "daily":
        return formatReportDate(selectedDate);
      case "weekly":
        return formatDateRange(selectedWeekStart, new Date(new Date(selectedWeekStart).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString());
      case "monthly":
        return `${new Date(selectedYear, selectedMonth - 1).toLocaleString("default", { month: "long" })} ${selectedYear}`;
      default:
        return formatDateRange(dateRange.start, dateRange.end);
    }
  };

  const hasReportData = () => {
    switch (activeReport) {
      case "daily": return !!dailyReport;
      case "weekly": return !!weeklyReport;
      case "equipment": return !!equipmentReport;
      case "chemical": return !!chemicalReport;
      default: return false;
    }
  };

  return (
    <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
    <div className="p-4 md:p-6 pb-24">
      <PageHeader
        title="Reports"
        description="Generate and export operational reports"
        icon={FileText}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="generate">Generate Report</TabsTrigger>
          <TabsTrigger value="view" disabled={!hasReportData()}>View Report</TabsTrigger>
        </TabsList>

        {/* Report Type Selection */}
        <TabsContent value="generate" className="space-y-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {REPORT_TYPES.map((report) => {
              const Icon = report.icon;
              const canAccess = canAccessReport(report);
              const isSelected = activeReport === report.id;

              return (
                <Card
                  key={report.id}
                  className={`cursor-pointer transition-all ${
                    canAccess
                      ? isSelected
                        ? "border-[#1B4332] shadow-md"
                        : "hover:shadow-md hover:border-[#1B4332]/50"
                      : "opacity-50 cursor-not-allowed"
                  }`}
                  onClick={() => canAccess && setActiveReport(report.id as ReportTypeId)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div
                        className="p-3 rounded-lg"
                        style={{ backgroundColor: `${report.color}15` }}
                      >
                        <Icon
                          className="w-6 h-6"
                          style={{ color: report.color }}
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{report.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {report.description}
                        </p>
                        {!canAccess && (
                          <Badge variant="secondary" className="mt-2 text-xs">
                            Requires supervisor access
                          </Badge>
                        )}
                      </div>
                      {canAccess && (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Report Configuration */}
          {activeReport && (
            <Card>
              <CardHeader>
                <CardTitle>Configure Report</CardTitle>
                <CardDescription>
                  Set parameters for your {REPORT_TYPES.find(r => r.id === activeReport)?.name} report
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeReport === "daily" && (
                  <div className="space-y-2">
                    <Label htmlFor="date">Select Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      max={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                )}

                {activeReport === "weekly" && (
                  <div className="space-y-2">
                    <Label htmlFor="weekStart">Week Starting</Label>
                    <Input
                      id="weekStart"
                      type="date"
                      value={selectedWeekStart}
                      onChange={(e) => setSelectedWeekStart(e.target.value)}
                      max={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                )}

                {activeReport === "monthly" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="year">Year</Label>
                      <Select
                        value={String(selectedYear)}
                        onValueChange={(v) => setSelectedYear(parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[2023, 2024, 2025, 2026].map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="month">Month</Label>
                      <Select
                        value={String(selectedMonth)}
                        onValueChange={(v) => setSelectedMonth(parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>
                              {new Date(2024, i).toLocaleString("default", { month: "long" })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {(activeReport === "staff" || activeReport === "chemical" || activeReport === "equipment") && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={dateRange.start}
                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={dateRange.end}
                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                        max={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setActiveReport(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleGenerateReport(activeReport)}
                    disabled={generating}
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 mr-2" />
                        Generate Report
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Report View */}
        <TabsContent value="view">
          {activeReport && hasReportData() && (
            <div className="space-y-4">
              {/* Export Actions */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {REPORT_TYPES.find(r => r.id === activeReport)?.name}
                </h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="w-4 h-4 mr-2" />
                    Print
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportCSV}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button size="sm" onClick={handleExportPDF} disabled={exporting}>
                    {exporting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    PDF
                  </Button>
                </div>
              </div>

              {/* Report Content */}
              <div ref={reportRef} className="bg-white p-6 rounded-lg border print:border-0">
                {/* Daily Report View */}
                {activeReport === "daily" && dailyReport && (
                  <DailyReportView report={dailyReport} />
                )}

                {/* Weekly Report View */}
                {activeReport === "weekly" && weeklyReport && (
                  <WeeklyReportView report={weeklyReport} />
                )}

                {/* Equipment Report View */}
                {activeReport === "equipment" && equipmentReport && (
                  <EquipmentReportView report={equipmentReport} />
                )}

                {/* Chemical Report View */}
                {activeReport === "chemical" && chemicalReport && (
                  <ChemicalReportView report={chemicalReport} />
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </RoleGuard>
  );
}

// Daily Report Component
function DailyReportView({ report }: { report: DailyReportData }) {
  const pendingCount = report.tasks.total - report.tasks.completed - report.tasks.in_progress;
  const tasksByStatus = [
    { name: "Completed", value: report.tasks.completed, color: "#40916C" },
    { name: "In Progress", value: report.tasks.in_progress, color: "#74C69D" },
    { name: "Pending", value: pendingCount > 0 ? pendingCount : 0, color: "#B7E4C7" },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-[#1B4332]">Daily Operations Report</h1>
        <p className="text-muted-foreground">{formatReportDate(report.date)}</p>
      </div>

      {/* Weather Summary */}
      {report.weather && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">High</p>
              <p className="text-2xl font-bold">{report.weather.high_f}°F</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Low</p>
              <p className="text-2xl font-bold">{report.weather.low_f}°F</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Precipitation</p>
              <p className="text-2xl font-bold">{report.weather.precip_in}&quot;</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Conditions</p>
              <p className="text-lg font-medium">{report.weather.condition}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Task Summary */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Task Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tasksByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {tasksByStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Tasks</span>
              <span className="font-semibold">{report.tasks.total}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Photos Uploaded</span>
              <span className="font-semibold">{report.photos.count}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Equipment Issues</span>
              <span className="font-semibold">{report.equipment_issues.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Chemical Applications</span>
              <span className="font-semibold">{report.chemical_applications.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Active Diagnoses</span>
              <span className="font-semibold">{report.active_diagnostics.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Task</th>
                  <th className="text-left py-2 px-3">Assigned To</th>
                  <th className="text-left py-2 px-3">Category</th>
                  <th className="text-left py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.tasks.list.map((task) => (
                  <tr key={task.id} className="border-b">
                    <td className="py-2 px-3">{task.title}</td>
                    <td className="py-2 px-3">{task.assignee || "—"}</td>
                    <td className="py-2 px-3">{task.category}</td>
                    <td className="py-2 px-3">
                      <Badge
                        variant={task.status === "completed" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {task.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Weekly Report Component
function WeeklyReportView({ report }: { report: WeeklyReportData }) {
  const completionByStaff = report.completion_by_staff.map(s => ({
    name: s.name.split(" ")[0],
    completed: s.completed,
    total: s.assigned,
  }));

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-[#1B4332]">Weekly Summary Report</h1>
        <p className="text-muted-foreground">
          {formatDateRange(report.week_start, report.week_end)}
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Task Completion</p>
            <p className="text-2xl font-bold text-green-600">{report.task_completion_rate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Temp Range</p>
            <p className="text-2xl font-bold">{report.weather_summary.low_min}-{report.weather_summary.high_max}°F</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Week Spend</p>
            <p className="text-2xl font-bold">${report.budget.week_spend.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Photos</p>
            <p className="text-2xl font-bold">{report.photos.count}</p>
          </CardContent>
        </Card>
      </div>

      {/* Staff Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Task Completion by Staff</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={completionByStaff}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" fill="#40916C" name="Completed" />
                <Bar dataKey="total" fill="#B7E4C7" name="Assigned" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Highlights & Concerns */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Highlights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {report.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">•</span>
                  <span className="text-sm">{h}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              Concerns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {report.concerns.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-orange-600 mt-1">•</span>
                  <span className="text-sm">{c}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Equipment Report Component
function EquipmentReportView({ report }: { report: EquipmentReportData }) {
  const costsByType = report.costs_by_equipment.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-[#1B4332]">Equipment Fleet Report</h1>
        <p className="text-muted-foreground">
          {formatDateRange(report.date_range.start, report.date_range.end)}
        </p>
      </div>

      {/* Fleet Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Total Units</p>
            <p className="text-2xl font-bold">{report.fleet_summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Operational</p>
            <p className="text-2xl font-bold text-green-600">{report.fleet_summary.operational}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">In Maintenance</p>
            <p className="text-2xl font-bold text-orange-600">{report.fleet_summary.in_repair}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Out of Service</p>
            <p className="text-2xl font-bold text-red-600">{report.fleet_summary.out_of_service}</p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Maintenance Costs by Equipment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costsByType} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="equipment_name" width={150} />
                <Tooltip formatter={(value) => [`$${(typeof value === "number" ? value : 0).toLocaleString()}`, "Cost"]} />
                <Bar dataKey="total_cost" fill="#1B4332" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Maintenance Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Equipment</th>
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-left py-2 px-3">Description</th>
                  <th className="text-right py-2 px-3">Cost</th>
                </tr>
              </thead>
              <tbody>
                {report.maintenance_log.slice(0, 15).map((log, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 px-3">{new Date(log.date).toLocaleDateString()}</td>
                    <td className="py-2 px-3">{log.equipment_name}</td>
                    <td className="py-2 px-3">
                      <Badge variant="outline" className="capitalize">{log.log_type}</Badge>
                    </td>
                    <td className="py-2 px-3">{log.description}</td>
                    <td className="py-2 px-3 text-right">${(log.cost || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Service */}
      {report.upcoming_service.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Upcoming Service Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.upcoming_service.map((item, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{item.equipment_name}</p>
                    <p className="text-sm text-muted-foreground">{item.service_type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">Due: {item.due_date ? new Date(item.due_date).toLocaleDateString() : "N/A"}</p>
                    {item.due_hours && item.current_hours && item.due_hours > item.current_hours && (
                      <p className="text-xs text-muted-foreground">{item.due_hours - item.current_hours} hours remaining</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Chemical Report Component
function ChemicalReportView({ report }: { report: ChemicalReportData }) {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-[#1B4332]">Chemical Compliance Report</h1>
        <p className="text-muted-foreground">
          {formatDateRange(report.date_range.start, report.date_range.end)}
        </p>
      </div>

      {/* REI Compliance */}
      <Card className={report.rei_compliance.compliance_rate >= 100 ? "border-green-200" : "border-red-200"}>
        <CardContent className="p-4 flex items-center gap-4">
          {report.rei_compliance.compliance_rate >= 100 ? (
            <CheckCircle className="w-8 h-8 text-green-600" />
          ) : (
            <AlertCircle className="w-8 h-8 text-red-600" />
          )}
          <div>
            <p className="font-semibold">
              REI Compliance: {report.rei_compliance.compliance_rate}%
            </p>
            <p className="text-sm text-muted-foreground">
              {report.rei_compliance.with_rei} of {report.rei_compliance.total_applications} applications with REI
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Products Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Products Used</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.products_summary.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="product_name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total_applied" fill="#1B4332" name="Total Applied" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Applications Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Application Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Product</th>
                  <th className="text-left py-2 px-3">Zone</th>
                  <th className="text-left py-2 px-3">Rate</th>
                  <th className="text-left py-2 px-3">Area</th>
                  <th className="text-left py-2 px-3">Applicator</th>
                </tr>
              </thead>
              <tbody>
                {report.applications.slice(0, 20).map((app, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 px-3">{new Date(app.date).toLocaleDateString()}</td>
                    <td className="py-2 px-3">{app.product_name}</td>
                    <td className="py-2 px-3">{app.zones.join(", ")}</td>
                    <td className="py-2 px-3">{app.application_rate || "N/A"}</td>
                    <td className="py-2 px-3">{(app.area_sqft || 0).toLocaleString()} sq ft</td>
                    <td className="py-2 px-3">{app.applicator_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Applicator Certifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Applicator Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {report.applicator_log.map((applicator, i) => (
              <div key={i} className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium">{applicator.applicator_name}</p>
                <p className="text-sm text-muted-foreground">
                  {applicator.applications} applications
                </p>
                {applicator.license ? (
                  <Badge className="mt-2 bg-green-100 text-green-800">License: {applicator.license}</Badge>
                ) : (
                  <Badge className="mt-2 bg-gray-100 text-gray-800">No License</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
