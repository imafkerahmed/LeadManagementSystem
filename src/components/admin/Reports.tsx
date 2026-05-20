"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import DailyReports from "@/components/admin/DailyReports";
import { Download, RefreshCw, PieChart, Users, Table } from "lucide-react";

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
  const [reportView, setReportView] = useState<"summary" | "daily">("summary");
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

  // Initialize dates on mount
  useEffect(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStartDate(formatLocalDate(startOfMonth));
    setEndDate(formatLocalDate(today));
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
    setCurrentPage(1); // Reset to first page
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
      // Prepare leads sheet data
      const leadsData = reportData.leads.map((lead) => ({
        "Student Name": lead.studentName,
        Mobile: lead.mobileWithCountry,
        Course: lead.course,
        Status: lead.status,
        "Assigned To": lead.assignedToName,
        "Created Date": new Date(lead.createdAt).toLocaleDateString(),
        "Updated Date": new Date(lead.updatedAt).toLocaleDateString(),
      }));

      // Create workbook with multiple sheets
      const wb = XLSX.utils.book_new();

      // Sheet 1: Leads data
      const leadsSheet = XLSX.utils.json_to_sheet(leadsData);
      XLSX.utils.book_append_sheet(wb, leadsSheet, "Leads");

      // Sheet 2: Summary Statistics
      const summaryData = [
        { Metric: "Total Leads", Value: reportData.stats.totalLeads },
        { Metric: "Report Period", Value: `${startDate} to ${endDate}` },
        { Metric: "Generated Date", Value: new Date().toLocaleDateString() },
      ];

      // Add status breakdown
      Object.entries(reportData.stats.byStatus).forEach(([status, count]) => {
        summaryData.push({ Metric: `Status: ${status}`, Value: count });
      });

      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

      // Sheet 3: Counselor Performance
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

      // Sheet 4: Lead History (new)
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

      // Generate filename
      const filename = `Lead_Report_${startDate}_to_${endDate}.xlsx`;

      // Write file
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

  return (
    <div className="space-y-6">
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
                    {reportData.stats.byStatus["Registered"] || 0} registered
                    leads
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
                  <table className="w-full border-separate border-spacing-0 text-sm">
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
