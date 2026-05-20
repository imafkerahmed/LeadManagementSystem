"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  MdDownload,
  MdRefresh,
  MdCheckCircle,
  MdSchedule,
} from "react-icons/md";
import DailyReports from "@/components/admin/DailyReports";

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

const LEAD_STATUSES = ["New", "Contacted", "Follow-Up", "Registered", "Lost"];

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
      <div className="flex items-center gap-2 rounded-lg border bg-white p-1 w-fit">
        <button
          onClick={() => setReportView("summary")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            reportView === "summary"
              ? "bg-blue-600 text-white"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          Summary Report
        </button>
        <button
          onClick={() => setReportView("daily")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            reportView === "daily"
              ? "bg-blue-600 text-white"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          Daily Report
        </button>
      </div>

      {reportView === "daily" ? (
        <DailyReports />
      ) : (
        <>
          {/* Preset Date Range Buttons */}
          <div className="flex flex-wrap gap-2">
            {PRESET_RANGES.map((range) => (
              <Button
                key={range.id}
                variant={selectedPreset === range.id ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const dates = range.getDates();
                  setStartDate(dates.start);
                  setEndDate(dates.end);
                  setSelectedPreset(range.id);
                }}
              >
                {range.label}
              </Button>
            ))}
          </div>

          {/* Filters Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setSelectedPreset(null);
                }}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setSelectedPreset(null);
                }}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              />
            </div>

            {/* Counselor Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Filter by Counselor
              </label>
              <select
                value={selectedCounselor}
                onChange={(e) => setSelectedCounselor(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              >
                <option value="all">All Counselors</option>
                {counselors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Filter by Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              >
                <option value="all">All Statuses</option>
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleGenerateReport}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <MdRefresh className="w-4 h-4" />
              {isLoading ? "Generating..." : "Generate Report"}
            </Button>

            {hasGenerated && reportData && (
              <Button
                onClick={handleExportToXLSX}
                variant="outline"
                className="flex items-center gap-2"
              >
                <MdDownload className="w-4 h-4" />
                Export to XLSX
              </Button>
            )}
          </div>

          {/* Report Summary */}
          {reportData && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="text-sm text-muted-foreground">
                    Total Leads
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {reportData.stats.totalLeads}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="text-sm text-muted-foreground">
                    Conversion Rate
                  </div>
                  <div className="text-2xl font-bold mt-1 text-green-600">
                    {reportData.stats.conversionRate}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {reportData.stats.byStatus["Registered"] || 0} registered
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="text-sm text-muted-foreground">
                    Counselors Involved
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {Object.keys(reportData.stats.byCounselor).length}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="text-sm text-muted-foreground">
                    Avg Leads/Counselor
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {reportData.stats.avgLeadsPerCounselor}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="text-sm text-muted-foreground">
                    Report Period
                  </div>
                  <div className="text-sm font-semibold mt-1">
                    {startDate} to {endDate}
                  </div>
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <MdSchedule className="w-4 h-4" />
                    Leads by Status
                  </h3>
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                    {Object.entries(reportData.stats.byStatus).map(
                      ([status, count]) => (
                        <div
                          key={status}
                          className="flex justify-between items-center p-3 bg-muted/30 rounded"
                        >
                          <span className="text-sm">{status}</span>
                          <span className="font-semibold">{count}</span>
                        </div>
                      ),
                    )}
                  </div>
                </div>

                {/* Counselor Performance */}
                <div>
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <MdCheckCircle className="w-4 h-4" />
                    Leads by Counselor
                  </h3>
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                    {Object.entries(reportData.stats.byCounselor).map(
                      ([counselorId, count]) => {
                        const counselor = reportData.counselors.find(
                          (c) => c.id === counselorId,
                        );
                        return (
                          <div
                            key={counselorId}
                            className="flex justify-between items-center p-3 bg-muted/30 rounded"
                          >
                            <span className="text-sm">
                              {counselor?.name || counselor?.email || "Unknown"}
                            </span>
                            <span className="font-semibold">{count}</span>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>

              {/* Leads Table */}
              <div>
                <h3 className="font-semibold mb-4">Lead Details</h3>
                <div className="overflow-x-auto border border-border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">
                          Student Name
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Mobile
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Course
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Assigned To
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportData.leads
                        .slice(
                          (currentPage - 1) * itemsPerPage,
                          currentPage * itemsPerPage,
                        )
                        .map((lead) => (
                          <tr key={lead.id} className="hover:bg-muted/20">
                            <td className="px-4 py-3">{lead.studentName}</td>
                            <td className="px-4 py-3 font-mono text-xs">
                              {lead.mobileWithCountry}
                            </td>
                            <td className="px-4 py-3">{lead.course}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                {lead.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">{lead.assignedToName}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(
                      currentPage * itemsPerPage,
                      reportData.leads.length,
                    )}{" "}
                    of {reportData.leads.length} leads
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-2">
                      {Array.from({
                        length: Math.ceil(
                          reportData.leads.length / itemsPerPage,
                        ),
                      }).map((_, i) => (
                        <Button
                          key={i + 1}
                          variant={
                            currentPage === i + 1 ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => setCurrentPage(i + 1)}
                          className="w-10 h-10 p-0"
                        >
                          {i + 1}
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
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
                    >
                      Next
                    </Button>
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
