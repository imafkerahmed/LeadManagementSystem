"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import DailyReports from "@/components/admin/DailyReports";
import { 
  Download, 
  RefreshCw, 
  PieChart, 
  Users, 
  Table, 
  ArrowLeft, 
  ListTodo, 
  BarChart3 
} from "lucide-react";
import { createPocketBaseClient } from "@/lib/pocketbase";

interface CounselorOption {
  id: string;
  name: string;
  email: string;
}

interface ReportData {
  leads: Array<{
    id: string;
    studentName: string;
    mobileWithCountry: string;
    course: string;
    status: string;
    assignedTo: string;
    assignedToName: string;
    createdAt: string;
    updatedAt: string;
    historyCount?: number;
  }>;
  counselors: CounselorOption[];
  stats: {
    totalLeads: number;
    byStatus: Record<string, number>;
    byCounselor: Record<string, number>;
    enrollmentRate: number;
    conversionRate: number;
    avgLeadsPerCounselor: number;
  };
  history?: Array<{
    id?: string;
    eventType?: string;
    comment?: string;
    oldValue?: string;
    newValue?: string;
    created?: string;
    studentName?: string;
    changedByName?: string;
  }>;
}

interface PresetRange {
  label: string;
  id: string;
  getDates: () => { start: string; end: string };
}

const LEAD_STATUSES = [
  "New",
  "Ringing-No-Answer",
  "Contacted",
  "Follow-Up",
  "Registered",
  "Lost",
];

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-100 text-blue-800",
  "Ringing-No-Answer": "bg-indigo-100 text-indigo-800",
  "Ringing No Answer": "bg-indigo-100 text-indigo-800",
  Contacted: "bg-yellow-100 text-yellow-800",
  "Follow-Up": "bg-orange-100 text-orange-800",
  "Follow-up": "bg-orange-100 text-orange-800",
  Registered: "bg-green-100 text-green-800",
  Lost: "bg-red-100 text-red-800",
};

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const PRESET_RANGES: PresetRange[] = [
  {
    label: "Today",
    id: "today",
    getDates: () => {
      const today = new Date();
      const dateStr = formatLocalDate(today);
      return { start: dateStr, end: dateStr };
    },
  },
  {
    label: "This Week",
    id: "week",
    getDates: () => {
      const today = new Date();
      const startOfWeek = new Date(today);
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      startOfWeek.setDate(today.getDate() + mondayOffset);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return {
        start: formatLocalDate(startOfWeek),
        end: formatLocalDate(endOfWeek),
      };
    },
  },
  {
    label: "This Month",
    id: "month",
    getDates: () => {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        start: formatLocalDate(startOfMonth),
        end: formatLocalDate(today),
      };
    },
  },
  {
    label: "Last 7 Days",
    id: "last7",
    getDates: () => {
      const today = new Date();
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        start: formatLocalDate(sevenDaysAgo),
        end: formatLocalDate(today),
      };
    },
  },
  {
    label: "Last 30 Days",
    id: "last30",
    getDates: () => {
      const today = new Date();
      const thirtyDaysAgo = new Date(
        today.getTime() - 30 * 24 * 60 * 60 * 1000,
      );
      return {
        start: formatLocalDate(thirtyDaysAgo),
        end: formatLocalDate(today),
      };
    },
  },
];
export default function AdminReports() {
  const [reportsView, _setReportsView] = useState<"menu" | "leads" | "tasks">("menu");

  const setReportsView = (view: "menu" | "leads" | "tasks") => {
    _setReportsView(view);
    try {
      localStorage.setItem("admin_reports_view", view);
      const params = new URLSearchParams(window.location.search);
      if (view === "menu") {
        params.delete("sub");
      } else {
        params.set("sub", view);
      }
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
      window.history.replaceState(null, "", newUrl);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      let view = params.get("sub") as "menu" | "leads" | "tasks" | null;
      if (!view) {
        const saved = localStorage.getItem("admin_reports_view") as "menu" | "leads" | "tasks" | null;
        if (saved === "menu" || saved === "leads" || saved === "tasks") {
          view = saved;
        }
      }
      if (view === "leads" || view === "tasks" || view === "menu") {
        _setReportsView(view || "menu");
        
        const params = new URLSearchParams(window.location.search);
        if (view && view !== "menu") {
          params.set("sub", view);
        } else {
          params.delete("sub");
        }
        const newSearch = params.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
        window.history.replaceState(null, "", newUrl);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const [reportView, setReportView] = useState<"summary" | "daily">("summary");

  // Lead report state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCounselor, setSelectedCounselor] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [counselors, setCounselors] = useState<CounselorOption[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Task report state
  const [taskStartDate, setTaskStartDate] = useState("");
  const [taskEndDate, setTaskEndDate] = useState("");
  const [selectedTaskCounselor, setSelectedTaskCounselor] = useState("all");
  const [selectedTaskStatus, setSelectedTaskStatus] = useState("all");
  const [selectedTaskPriority, setSelectedTaskPriority] = useState("all");
  const [taskPreset, setTaskPreset] = useState<string | null>(null);
  const [taskReportData, setTaskReportData] = useState<any[]>([]);
  const [taskStats, setTaskStats] = useState<any>(null);
  const [isTaskLoading, setIsTaskLoading] = useState(false);
  const [hasGeneratedTasks, setHasGeneratedTasks] = useState(false);
  const [taskCurrentPage, setTaskCurrentPage] = useState(1);

  // Initialize dates on mount
  useEffect(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(formatLocalDate(startOfMonth));
    setEndDate(formatLocalDate(today));
    setTaskStartDate(formatLocalDate(startOfMonth));
    setTaskEndDate(formatLocalDate(today));
  }, []);

  useEffect(() => {
    // Fetch counselors
    const fetchCounselors = async () => {
      try {
        const res = await fetch("/api/users/lookup");
        if (!res.ok) {
          throw new Error(`Failed to fetch counselors: HTTP ${res.status}`);
        }
        const counselorList = await res.json();
        setCounselors(Array.isArray(counselorList) ? counselorList : []);
      } catch (error) {
        console.error(
          "Error fetching counselors:",
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    fetchCounselors();
  }, []);

  const getDateDifference = (start: string, end: string) => {
    const startD = new Date(start);
    const endD = new Date(end);
    const diffTime = Math.abs(endD.getTime() - startD.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleGenerateReport = async () => {
    if (!startDate || !endDate) {
      toast.error("Please select both start and end dates");
      return;
    }

    const daysDiff = getDateDifference(startDate, endDate);
    if (daysDiff > 30) {
      toast.error("Date range cannot exceed 30 days");
      return;
    }

    setIsLoading(true);
    setCurrentPage(1);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        counselor: selectedCounselor,
        status: selectedStatus,
      });

      const res = await fetch(`/api/admin/reports?${params}`);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.details || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setReportData(data);
      setHasGenerated(true);
      toast.success(`Report generated: ${data.stats.totalLeads} leads found`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Error generating report:", errorMsg);
      toast.error(`Failed to generate report: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportToXLSX = () => {
    if (!reportData) {
      toast.error("No report data to export");
      return;
    }

    try {
      const leadsData = reportData.leads.map((lead) => ({
        "Student Name": lead.studentName,
        Mobile: lead.mobileWithCountry,
        Course: lead.course,
        Status: lead.status,
        "Assigned To": lead.assignedToName,
        "Created Date": new Date(lead.createdAt).toLocaleDateString(),
        "Updated Date": new Date(lead.updatedAt).toLocaleDateString(),
      }));

      const wb = XLSX.utils.book_new();

      const leadsSheet = XLSX.utils.json_to_sheet(leadsData);
      XLSX.utils.book_append_sheet(wb, leadsSheet, "Leads");

      const summaryData = [
        { Metric: "Total Leads", Value: reportData.stats.totalLeads },
        { Metric: "Report Period", Value: `${startDate} to ${endDate}` },
        { Metric: "Generated Date", Value: new Date().toLocaleDateString() },
      ];

      Object.entries(reportData.stats.byStatus).forEach(([status, count]) => {
        summaryData.push({ Metric: `Status: ${status}`, Value: count });
      });

      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

      const counselorData = Object.entries(reportData.stats.byCounselor).map(
        ([counselorId, count]) => ({
          Counselor:
            reportData.counselors.find((c) => c.id === counselorId)?.name ||
            counselorId,
          "Leads Assigned": count,
        }),
      );

      const counselorSheet = XLSX.utils.json_to_sheet(counselorData);
      XLSX.utils.book_append_sheet(wb, counselorSheet, "Counselor Stats");

      if (reportData.history && reportData.history.length > 0) {
        const historyData = reportData.history.map((h) => ({
          "Student Name": h.studentName || "Unknown",
          "Event Type": h.eventType || "-",
          "Old Value": h.oldValue || "-",
          "New Value": h.newValue || "-",
          "Changed By": h.changedByName || "Unknown",
          Date: h.created
            ? new Date(h.created).toLocaleDateString()
            : "Unknown",
          Comment: h.comment || "-",
        }));
        const historySheet = XLSX.utils.json_to_sheet(historyData);
        XLSX.utils.book_append_sheet(wb, historySheet, "Lead History");
      }

      const filename = `Lead_Report_${startDate}_to_${endDate}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success("Report exported successfully");
    } catch (error) {
      console.error(
        "Error exporting to XLSX:",
        error instanceof Error ? error.message : String(error),
      );
      toast.error("Failed to export report");
    }
  };

  const handleGenerateTaskReport = async () => {
    if (!taskStartDate || !taskEndDate) {
      toast.error("Please select both start and end dates");
      return;
    }

    const daysDiff = getDateDifference(taskStartDate, taskEndDate);
    if (daysDiff > 30) {
      toast.error("Date range cannot exceed 30 days");
      return;
    }

    setIsTaskLoading(true);
    setTaskCurrentPage(1);
    try {
      const pb = createPocketBaseClient();
      
      let start: Date;
      let end: Date;

      const startParts = taskStartDate.split("-");
      if (startParts.length === 3) {
        start = new Date(Date.UTC(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]), 0, 0, 0, 0));
      } else {
        start = new Date(taskStartDate);
        start.setHours(0, 0, 0, 0);
      }

      const endParts = taskEndDate.split("-");
      if (endParts.length === 3) {
        end = new Date(Date.UTC(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]), 23, 59, 59, 999));
      } else {
        end = new Date(taskEndDate);
        end.setHours(23, 59, 59, 999);
      }

      const filters: string[] = [];
      filters.push(`created >= "${start.toISOString()}"`);
      filters.push(`created <= "${end.toISOString()}"`);

      if (selectedTaskCounselor && selectedTaskCounselor !== "all") {
        filters.push(`assignedTo = "${selectedTaskCounselor}"`);
      }

      if (selectedTaskStatus && selectedTaskStatus !== "all") {
        filters.push(`status = "${selectedTaskStatus}"`);
      }

      if (selectedTaskPriority && selectedTaskPriority !== "all") {
        filters.push(`priority = "${selectedTaskPriority}"`);
      }

      const filter = filters.join(" && ");

      const fetchedTasks = await pb.collection("tasks").getFullList({
        filter,
        sort: "-created",
        expand: "assignedTo",
      });

      const total = fetchedTasks.length;
      const completed = fetchedTasks.filter((t: any) => t.status === "Completed").length;
      const pending = fetchedTasks.filter((t: any) => t.status === "Pending" || !t.status).length;
      const inProgress = fetchedTasks.filter((t: any) => t.status === "In-Progress").length;
      const high = fetchedTasks.filter((t: any) => t.priority === "High").length;
      const medium = fetchedTasks.filter((t: any) => t.priority === "Medium").length;
      const low = fetchedTasks.filter((t: any) => t.priority === "Low").length;

      const todayD = new Date();
      todayD.setHours(0, 0, 0, 0);
      const overdue = fetchedTasks.filter((t: any) => {
        if (t.status === "Completed" || !t.dueDate) return false;
        try {
          const due = new Date(t.dueDate);
          due.setHours(0, 0, 0, 0);
          return due < todayD;
        } catch {
          return false;
        }
      }).length;

      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      const byCounselor: Record<string, { total: number; completed: number; overdue: number }> = {};
      const counselorIds = new Set<string>();

      fetchedTasks.forEach((task: any) => {
        const counselorId = task.assignedTo || "Unassigned";
        counselorIds.add(counselorId);

        if (!byCounselor[counselorId]) {
          byCounselor[counselorId] = { total: 0, completed: 0, overdue: 0 };
        }
        
        byCounselor[counselorId].total += 1;
        if (task.status === "Completed") {
          byCounselor[counselorId].completed += 1;
        }

        if (task.status !== "Completed" && task.dueDate) {
          try {
            const due = new Date(task.dueDate);
            due.setHours(0, 0, 0, 0);
            if (due < todayD) {
              byCounselor[counselorId].overdue += 1;
            }
          } catch {}
        }
      });

      const avgTasksPerCounselor = counselorIds.size > 0 ? Math.round(total / counselorIds.size) : 0;

      setTaskReportData(fetchedTasks);
      setTaskStats({
        total,
        completed,
        pending,
        inProgress,
        overdue,
        high,
        medium,
        low,
        completionRate,
        byCounselor,
        avgTasksPerCounselor,
      });
      setHasGeneratedTasks(true);
      toast.success(`Task report generated: ${total} tasks found`);
    } catch (error: any) {
      console.error("Error generating tasks report:", error);
      toast.error(`Failed to generate task report: ${error.message || String(error)}`);
    } finally {
      setIsTaskLoading(false);
    }
  };

  const handleExportTasksToXLSX = () => {
    if (taskReportData.length === 0 || !taskStats) {
      toast.error("No task report data to export");
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      const excelTasksData = taskReportData.map((task) => {
        const assignee = task.expand?.assignedTo as any;
        return {
          "Task ID": task.task_id || task.id,
          Title: task.title,
          Description: task.description || "",
          Assignee: assignee?.name || assignee?.email || "Unassigned",
          Priority: task.priority || "Medium",
          Status: task.status || "Pending",
          "Due Date": task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No deadline",
          Created: new Date(task.created).toLocaleDateString(),
          Updated: new Date(task.updated).toLocaleDateString(),
          Notes: task.notes || "",
        };
      });

      const tasksSheet = XLSX.utils.json_to_sheet(excelTasksData);
      XLSX.utils.book_append_sheet(wb, tasksSheet, "Tasks");

      const summaryData = [
        { Metric: "Total Tasks", Value: taskStats.total },
        { Metric: "Completed Tasks", Value: taskStats.completed },
        { Metric: "To Do Tasks", Value: taskStats.pending },
        { Metric: "In Progress Tasks", Value: taskStats.inProgress },
        { Metric: "Overdue Tasks", Value: taskStats.overdue },
        { Metric: "High Priority Tasks", Value: taskStats.high },
        { Metric: "Task Completion Rate (%)", Value: `${taskStats.completionRate}%` },
        { Metric: "Report Period", Value: `${taskStartDate} to ${taskEndDate}` },
        { Metric: "Generated Date", Value: new Date().toLocaleDateString() },
      ];
      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

      const counselorPerformanceData = Object.entries(taskStats.byCounselor).map(([counselorId, data]: [string, any]) => {
        const counselor = counselors.find((c) => c.id === counselorId);
        const name = counselor?.name || counselor?.email || (counselorId === "Unassigned" ? "Unassigned" : counselorId);
        return {
          Assignee: name,
          "Total Tasks": data.total,
          "Completed Tasks": data.completed,
          "Overdue Tasks": data.overdue,
          "Completion Rate (%)": data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
        };
      });
      const counselorSheet = XLSX.utils.json_to_sheet(counselorPerformanceData);
      XLSX.utils.book_append_sheet(wb, counselorSheet, "Assignee Performance");

      const filename = `Task_Report_${taskStartDate}_to_${taskEndDate}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success("Task report exported successfully");
    } catch (error) {
      console.error("Error exporting tasks report:", error);
      toast.error("Failed to export task report");
    }
  };

  if (reportsView === "menu") {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Menu Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Lead Reports Card */}
          <div
            onClick={() => setReportsView("leads")}
            className="group relative overflow-hidden bg-white border border-blue-100/30 rounded-2xl p-6 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-blue-100 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[160px]"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500" />
            <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-blue-500" />

            <div className="flex items-start justify-between relative z-10">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                <PieChart className="h-5 w-5" />
              </div>
              <span className="text-[9px] font-bold text-blue-600 bg-blue-50/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Leads
              </span>
            </div>

            <div className="relative z-10 mt-4">
              <h4 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                Lead Reports
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Generate summary statistics, status breakdowns, counselor performance indexes, and export lead records.
              </p>
            </div>
          </div>

          {/* Task Report Card */}
          <div
            onClick={() => setReportsView("tasks")}
            className="group relative overflow-hidden bg-white border border-indigo-100/30 rounded-2xl p-6 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-indigo-100 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[160px]"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500" />
            <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-indigo-500" />

            <div className="flex items-start justify-between relative z-10">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                <ListTodo className="h-5 w-5" />
              </div>
              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Checklists
              </span>
            </div>

            <div className="relative z-10 mt-4">
              <h4 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                Task Report
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Analyze checklist completion rates, track pending/overdue assignments, and export task audit sheets.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (reportsView === "leads") {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <button
            onClick={() => setReportsView("menu")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Reports
          </button>
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Reports / Lead Reports
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-2xl border border-slate-100 bg-white p-1.5 w-fit shadow-sm">
          <button
            onClick={() => setReportView("summary")}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
              reportView === "summary"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            Summary Analytics
          </button>
          <button
            onClick={() => setReportView("daily")}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
              reportView === "daily"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            Daily Timeline
          </button>
        </div>

        {reportView === "daily" ? (
          <DailyReports />
        ) : (
          <>
            {/* Preset Date Range Buttons */}
            <div className="flex flex-wrap gap-2">
              {PRESET_RANGES.map((range) => (
                <button
                  key={range.id}
                  onClick={() => {
                    const dates = range.getDates();
                    setStartDate(dates.start);
                    setEndDate(dates.end);
                    setSelectedPreset(range.id);
                  }}
                  className={`rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-sm ${
                    selectedPreset === range.id
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>

            {/* Filters Grid */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-100 shadow-sm rounded-2xl p-5">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setSelectedPreset(null);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setSelectedPreset(null);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Filter by Counselor
                </label>
                <select
                  value={selectedCounselor}
                  onChange={(e) => setSelectedCounselor(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option value="all">All Counselors</option>
                  {counselors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Filter by Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option value="all">All Statuses</option>
                  {LEAD_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status.replace(/-/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleGenerateReport}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
                {isLoading ? "Generating..." : "Generate Report"}
              </button>

              {hasGenerated && reportData && (
                <button
                  onClick={handleExportToXLSX}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all"
                >
                  <Download className="h-4 w-4 text-slate-500" />
                  Export to XLSX
                </button>
              )}
            </div>

            {/* Report Summary */}
            {reportData && (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
                  <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all duration-300">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Total Leads
                    </div>
                    <div className="text-2xl font-black mt-2 text-slate-800">
                      {reportData.stats.totalLeads}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all duration-300">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Enrollment Rate
                    </div>
                    <div className="text-2xl font-black mt-2 text-emerald-600">
                      {reportData.stats.enrollmentRate}%
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium mt-1">
                      {reportData.stats.byStatus["Registered"] || 0} registered leads
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all duration-300">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Counselors Involved
                    </div>
                    <div className="text-2xl font-black mt-2 text-slate-800">
                      {Object.keys(reportData.stats.byCounselor).length}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all duration-300">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Avg Leads/Counselor
                    </div>
                    <div className="text-2xl font-black mt-2 text-slate-800">
                      {reportData.stats.avgLeadsPerCounselor}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all duration-300">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Report Period
                    </div>
                    <div className="text-xs font-bold text-slate-700 mt-2">
                      {startDate} to {endDate}
                    </div>
                  </div>
                </div>

                {/* Status Breakdown & Counselor Performance */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 hover:shadow-md transition-all duration-300">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <PieChart className="w-4 h-4 text-blue-600" />
                      Leads by Status
                    </h3>
                    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                      {Object.entries(reportData.stats.byStatus).map(
                        ([status, count]) => (
                          <div
                            key={status}
                            className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition-colors"
                          >
                            <span className="text-xs font-semibold text-slate-600">
                              {status}
                            </span>
                            <span className="text-xs font-bold text-slate-800">
                              {count}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 hover:shadow-md transition-all duration-300">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-600" />
                      Leads by Counselor
                    </h3>
                    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                      {Object.entries(reportData.stats.byCounselor).map(
                        ([counselorId, count]) => {
                          const counselor = reportData.counselors.find(
                            (c) => c.id === counselorId,
                          );
                          return (
                            <div
                              key={counselorId}
                              className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition-colors"
                            >
                              <span className="text-xs font-semibold text-slate-600">
                                {counselor?.name || counselor?.email || "Unknown"}
                              </span>
                              <span className="text-xs font-bold text-slate-800">
                                {count}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                </div>

                {/* Leads Table */}
                <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 hover:shadow-md transition-all duration-300">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Table className="w-4 h-4 text-blue-600" />
                    Lead Details Log
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
                    <table className="w-full border-separate border-spacing-0 text-sm min-w-[800px]">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-3 font-semibold rounded-l-xl">
                            Student Name
                          </th>
                          <th className="px-4 py-3 font-semibold">Mobile</th>
                          <th className="px-4 py-3 font-semibold">Course</th>
                          <th className="px-4 py-3 font-semibold text-center">
                            Status
                          </th>
                          <th className="px-4 py-3 font-semibold rounded-r-xl">
                            Assigned To
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reportData.leads
                          .slice(
                            (currentPage - 1) * itemsPerPage,
                            currentPage * itemsPerPage,
                          )
                          .map((lead) => (
                            <tr
                              key={lead.id}
                              className="hover:bg-slate-50/30 transition-colors"
                            >
                              <td className="px-4 py-3 font-semibold text-slate-800">
                                {lead.studentName}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                {lead.mobileWithCountry}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {lead.course}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[lead.status] || "bg-slate-50 text-slate-700 border border-slate-200"}`}
                                >
                                  {lead.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {lead.assignedToName}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mt-5 pt-4 border-t border-slate-50">
                    <div className="text-xs font-semibold text-slate-400">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                      {Math.min(
                        currentPage * itemsPerPage,
                        reportData.leads.length,
                      )}{" "}
                      of {reportData.leads.length} leads
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({
                          length: Math.ceil(
                            reportData.leads.length / itemsPerPage,
                          ),
                        }).map((_, i) => (
                          <button
                            key={i + 1}
                            onClick={() => setCurrentPage(i + 1)}
                            className={`w-9 h-9 rounded-xl text-xs font-bold shadow-sm transition-all ${
                              currentPage === i + 1
                                ? "bg-blue-600 text-white"
                                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() =>
                          setCurrentPage((p) =>
                            Math.min(
                              Math.ceil(reportData.leads.length / itemsPerPage),
                              p + 1,
                            ),
                          )
                        }
                        disabled={
                          currentPage ===
                          Math.ceil(reportData.leads.length / itemsPerPage)
                        }
                        className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (reportsView === "tasks") {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <button
            onClick={() => setReportsView("menu")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Reports
          </button>
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Reports / Task Report
          </div>
        </div>

        {/* Preset Date Range Buttons */}
        <div className="flex flex-wrap gap-2">
          {PRESET_RANGES.map((range) => (
            <button
              key={range.id}
              onClick={() => {
                const dates = range.getDates();
                setTaskStartDate(dates.start);
                setTaskEndDate(dates.end);
                setTaskPreset(range.id);
              }}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-sm ${
                taskPreset === range.id
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5 bg-white border border-slate-100 shadow-sm rounded-2xl p-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
              Start Date
            </label>
            <input
              type="date"
              value={taskStartDate}
              onChange={(e) => {
                setTaskStartDate(e.target.value);
                setTaskPreset(null);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
              End Date
            </label>
            <input
              type="date"
              value={taskEndDate}
              onChange={(e) => {
                setTaskEndDate(e.target.value);
                setTaskPreset(null);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
              Filter by Assignee
            </label>
            <select
              value={selectedTaskCounselor}
              onChange={(e) => setSelectedTaskCounselor(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            >
              <option value="all">All Assignees</option>
              {counselors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
              Filter by Status
            </label>
            <select
              value={selectedTaskStatus}
              onChange={(e) => setSelectedTaskStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            >
              <option value="all">All Statuses</option>
              <option value="Pending">To Do (Pending)</option>
              <option value="In-Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
              Filter by Priority
            </label>
            <select
              value={selectedTaskPriority}
              onChange={(e) => setSelectedTaskPriority(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            >
              <option value="all">All Priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleGenerateTaskReport}
            disabled={isTaskLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isTaskLoading ? "animate-spin" : ""}`}
            />
            {isTaskLoading ? "Generating..." : "Generate Task Report"}
          </button>

          {hasGeneratedTasks && taskReportData.length > 0 && (
            <button
              onClick={handleExportTasksToXLSX}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all"
            >
              <Download className="h-4 w-4 text-slate-500" />
              Export to XLSX
            </button>
          )}
        </div>

        {/* Report Summary */}
        {hasGeneratedTasks && taskStats && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all duration-300">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Total Tasks
                </div>
                <div className="text-2xl font-black mt-2 text-slate-800">
                  {taskStats.total}
                </div>
              </div>

              <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all duration-300">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Completion Rate
                </div>
                <div className="text-2xl font-black mt-2 text-emerald-600">
                  {taskStats.completionRate}%
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-1">
                  {taskStats.completed} completed tasks
                </div>
              </div>

              <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all duration-300">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Overdue Tasks
                </div>
                <div className={`text-2xl font-black mt-2 ${taskStats.overdue > 0 ? "text-rose-600" : "text-slate-800"}`}>
                  {taskStats.overdue}
                </div>
              </div>

              <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all duration-300">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Avg Tasks/Assignee
                </div>
                <div className="text-2xl font-black mt-2 text-slate-800">
                  {taskStats.avgTasksPerCounselor}
                </div>
              </div>

              <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all duration-300">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Report Period
                </div>
                <div className="text-xs font-bold text-slate-700 mt-2">
                  {taskStartDate} to {taskEndDate}
                </div>
              </div>
            </div>

            {/* Breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Status Breakdown */}
              <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 hover:shadow-md transition-all duration-300">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-blue-600" />
                  Tasks by Status
                </h3>
                <div className="space-y-2.5">
                  {[
                    { status: "To Do (Pending)", count: taskStats.pending, color: "bg-slate-100 text-slate-700" },
                    { status: "In Progress", count: taskStats.inProgress, color: "bg-blue-50 text-blue-700" },
                    { status: "Completed", count: taskStats.completed, color: "bg-emerald-50 text-emerald-700 animate-pulse" },
                  ].map((item) => (
                    <div
                      key={item.status}
                      className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition-colors"
                    >
                      <span className="text-xs font-semibold text-slate-600">
                        {item.status}
                      </span>
                      <span className={`text-xs font-bold ${item.color.split(" ")[1]}`}>
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Priority Breakdown */}
              <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 hover:shadow-md transition-all duration-300">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-500" />
                  Tasks by Priority
                </h3>
                <div className="space-y-2.5">
                  {[
                    { priority: "High", count: taskStats.high, color: "bg-rose-50 text-rose-600" },
                    { priority: "Medium", count: taskStats.medium, color: "bg-amber-50 text-amber-700" },
                    { priority: "Low", count: taskStats.low, color: "bg-slate-50 text-slate-500" },
                  ].map((item) => (
                    <div
                      key={item.priority}
                      className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition-colors"
                    >
                      <span className="text-xs font-semibold text-slate-600">
                        {item.priority} Priority
                      </span>
                      <span className={`text-xs font-bold ${item.color.split(" ")[1]}`}>
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Counselor Breakdown */}
              <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 hover:shadow-md transition-all duration-300">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  Tasks by Assignee
                </h3>
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                  {Object.entries(taskStats.byCounselor).map(([counselorId, data]: [string, any]) => {
                    const counselor = counselors.find((c) => c.id === counselorId);
                    const name = counselor?.name || counselor?.email || (counselorId === "Unassigned" ? "Unassigned" : counselorId);
                    return (
                      <div
                        key={counselorId}
                        className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition-colors"
                      >
                        <span className="text-xs font-semibold text-slate-600">
                          {name}
                        </span>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span>{data.completed}</span>
                          <span className="text-slate-300">/</span>
                          <span className="text-slate-400">{data.total}</span>
                          {data.overdue > 0 && (
                            <span className="text-[10px] font-extrabold text-rose-600 bg-rose-50 border border-rose-100 px-1 rounded animate-pulse">
                              {data.overdue} overdue
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Task Details Table */}
            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 hover:shadow-md transition-all duration-300">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Table className="w-4 h-4 text-blue-600" />
                Task Details Log
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
                <table className="w-full border-separate border-spacing-0 text-sm min-w-[800px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-3 font-semibold rounded-l-xl">Task ID</th>
                      <th className="px-4 py-3 font-semibold">Title</th>
                      <th className="px-4 py-3 font-semibold">Assignee</th>
                      <th className="px-4 py-3 font-semibold text-center">Priority</th>
                      <th className="px-4 py-3 font-semibold text-center">Status</th>
                      <th className="px-4 py-3 font-semibold rounded-r-xl">Due Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {taskReportData
                      .slice(
                        (taskCurrentPage - 1) * itemsPerPage,
                        taskCurrentPage * itemsPerPage,
                      )
                      .map((task) => {
                        const assignee = task.expand?.assignedTo as any;
                        const isOverdue =
                          task.status !== "Completed" &&
                          task.dueDate &&
                          new Date(task.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0);

                        return (
                          <tr
                            key={task.id}
                            className="hover:bg-slate-50/30 transition-colors"
                          >
                            <td className="px-4 py-3 font-mono text-xs text-slate-400">
                              {task.task_id || task.id}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              {task.title}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {assignee?.name || assignee?.email || "Unassigned"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                                task.priority === "High"
                                  ? "bg-rose-50 text-rose-700 border-rose-100"
                                  : task.priority === "Medium"
                                    ? "bg-amber-50 text-amber-700 border-amber-100"
                                    : "bg-slate-50 text-slate-600 border-slate-200"
                              }`}>
                                {task.priority || "Medium"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                task.status === "Completed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : task.status === "In-Progress"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-slate-100 text-slate-800"
                              }`}>
                                {task.status || "Pending"}
                              </span>
                            </td>
                            <td className={`px-4 py-3 text-xs ${isOverdue ? "text-rose-600 font-bold" : "text-slate-500"}`}>
                              {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No deadline"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mt-5 pt-4 border-t border-slate-50">
                <div className="text-xs font-semibold text-slate-400">
                  Showing {(taskCurrentPage - 1) * itemsPerPage + 1} to{" "}
                  {Math.min(
                    taskCurrentPage * itemsPerPage,
                    taskReportData.length,
                  )}{" "}
                  of {taskReportData.length} tasks
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setTaskCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={taskCurrentPage === 1}
                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({
                      length: Math.ceil(
                        taskReportData.length / itemsPerPage,
                      ),
                    }).map((_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => setTaskCurrentPage(i + 1)}
                        className={`w-9 h-9 rounded-xl text-xs font-bold shadow-sm transition-all ${
                          taskCurrentPage === i + 1
                            ? "bg-blue-600 text-white"
                            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      setTaskCurrentPage((p) =>
                        Math.min(
                          Math.ceil(taskReportData.length / itemsPerPage),
                          p + 1,
                        ),
                      )
                    }
                    disabled={
                      taskCurrentPage ===
                      Math.ceil(taskReportData.length / itemsPerPage)
                    }
                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
