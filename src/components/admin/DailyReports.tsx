"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Image from "next/image";
import {
  Download,
  Image as ImageIcon,
  Copy,
  CalendarRange,
  RefreshCw,
  Users,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import { toPng } from "html-to-image";
import * as XLSX from "xlsx";
import { DailyReportMetrics } from "@/types";
import { createPocketBaseClient } from "@/lib/pocketbase";

interface DailyReportData {
  date: string;
  reports: DailyReportMetrics[];
}

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatFileDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function DailyReports() {
  const [selectedDate, setSelectedDate] = useState("");
  const [reportData, setReportData] = useState<DailyReportData | null>(null);
  const [selectedCounselorIds, setSelectedCounselorIds] = useState<string[]>([]);
  const [isCounselorDropdownOpen, setIsCounselorDropdownOpen] = useState(false);
  const [counselorSearchTerm, setCounselorSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isCopyingImage, setIsCopyingImage] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close counselor filter dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsCounselorDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Hoisted fetch function so effects can call it

  // Initialize date to today on mount
  useEffect(() => {
    const today = new Date();
    setTimeout(() => setSelectedDate(formatLocalDate(today)), 0);
  }, []);

  // Auto-refresh logic - poll every 60 seconds
  useEffect(() => {
    if (!selectedDate) return;

    const refreshInterval = setInterval(() => {
      fetchDailyReport(selectedDate);
    }, 60000); // 60 seconds

    return () => clearInterval(refreshInterval);
  }, [selectedDate]);

  // Fetch daily report when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchDailyReport(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;
    const pb = createPocketBaseClient();

    pb.collection("leads").subscribe("*", () => {
      void fetchDailyReport(selectedDate, true);
    });
    pb.collection("leadHistory").subscribe("*", () => {
      void fetchDailyReport(selectedDate, true);
    });

    return () => {
      pb.collection("leads").unsubscribe("*");
      pb.collection("leadHistory").unsubscribe("*");
    };
  }, [selectedDate]);

  async function fetchDailyReport(dateStr: string, isBackground = false) {
    if (!isBackground) {
      setIsLoading(true);
    }
    try {
      const parts = dateStr.split("-");
      let startParam = "";
      let endParam = "";
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);

        const localStart = new Date(year, month, day, 0, 0, 0, 0);
        const localEnd = new Date(year, month, day, 23, 59, 59, 999);
        startParam = localStart.toISOString();
        endParam = localEnd.toISOString();
      }

      const queryUrl =
        startParam && endParam
          ? `/api/admin/daily-reports?date=${dateStr}&startOfDay=${encodeURIComponent(startParam)}&endOfDay=${encodeURIComponent(endParam)}`
          : `/api/admin/daily-reports?date=${dateStr}`;

      const res = await fetch(queryUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch daily report: HTTP ${res.status}`);
      }
      const data = await res.json();
      setReportData(data);
    } catch (error) {
      console.error(
        "Error fetching daily report:",
        error instanceof Error ? error.message : String(error),
      );
      toast.error("Failed to load daily report");
    } finally {
      setIsLoading(false);
    }
  }

  const allReports = reportData?.reports || [];
  const allCounselorIds = allReports.map((r) => r.counselorId);

  const activeSelectedCounselorIds = selectedCounselorIds;

  const isAllSelected =
    activeSelectedCounselorIds.length === allReports.length &&
    allReports.length > 0;

  const displayedReports = allReports.filter((report) =>
    activeSelectedCounselorIds.includes(report.counselorId),
  );

  const filteredCounselorOptions = allReports.filter((report) =>
    report.counselorName
      .toLowerCase()
      .includes(counselorSearchTerm.toLowerCase()),
  );

  const toggleCounselor = (counselorId: string) => {
    const current = activeSelectedCounselorIds;
    if (current.includes(counselorId)) {
      setSelectedCounselorIds(current.filter((id) => id !== counselorId));
    } else {
      setSelectedCounselorIds([...current, counselorId]);
    }
  };

  const handleSelectAllCounselors = () => {
    setSelectedCounselorIds(allCounselorIds);
  };

  const handleDeselectAllCounselors = () => {
    setSelectedCounselorIds([]);
  };

  const handleRefresh = async () => {
    if (selectedDate) {
      await fetchDailyReport(selectedDate);
      toast.success("Report refreshed");
    }
  };

  const handlePrevDay = () => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() - 1);
    setSelectedDate(formatLocalDate(current));
  };

  const handleNextDay = () => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + 1);
    setSelectedDate(formatLocalDate(current));
  };

  const handleToday = () => {
    const today = new Date();
    setSelectedDate(formatLocalDate(today));
  };

  const buildExportRows = (rows: DailyReportMetrics[]) =>
    rows.map((report) => ({
      User: report.counselorName,
      "Leads Created Today": report.newLeads,
      "New Status": report.statusNew,
      "Ringing No Answer": report.statusRingingNoAnswer,
      Contacted: report.statusContacted,
      "Follow-Up": report.statusFollowUp,
      Registered: report.statusRegistered,
      Lost: report.statusLost,
      "Overdue Follow-ups": report.overdueFollowups,
    }));

  const handleExportXlsx = async () => {
    if (!reportData || displayedReports.length === 0) {
      toast.error(
        displayedReports.length === 0 && reportData && reportData.reports.length > 0
          ? "No users selected to export"
          : "No daily report data to export",
      );
      return;
    }

    try {
      setIsExportingXlsx(true);
      const worksheet = XLSX.utils.json_to_sheet(
        buildExportRows(displayedReports),
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Daily Reports");
      XLSX.writeFile(
        workbook,
        `daily-reports-${formatFileDate(new Date(selectedDate || new Date()))}.xlsx`,
      );
      toast.success("XLSX export downloaded");
    } catch (error) {
      console.error("Failed to export XLSX", error);
      toast.error("Failed to export XLSX");
    } finally {
      setIsExportingXlsx(false);
    }
  };

  const handleExportImage = async () => {
    if (!exportRef.current || !reportData || displayedReports.length === 0) {
      toast.error(
        displayedReports.length === 0 && reportData && reportData.reports.length > 0
          ? "No users selected to export as an image"
          : "No daily report data to export as an image",
      );
      return;
    }

    try {
      setIsExportingImage(true);
      const pngDataUrl = await toPng(exportRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
      });

      setImagePreviewUrl(pngDataUrl);
      toast.success("Preview ready");
    } catch (error) {
      console.error("Failed to export image", error);
      toast.error("Failed to export image");
    } finally {
      setIsExportingImage(false);
    }
  };

  const handleDownloadPreviewImage = () => {
    if (!imagePreviewUrl) return;

    const link = document.createElement("a");
    link.download = `daily-reports-${formatFileDate(
      new Date(selectedDate || new Date()),
    )}.png`;
    link.href = imagePreviewUrl;
    link.click();
    toast.success("Image downloaded");
  };

  const handleCopyPreviewImage = async () => {
    if (!imagePreviewUrl) return;

    try {
      setIsCopyingImage(true);
      const response = await fetch(imagePreviewUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      toast.success(
        "Image copied to clipboard! You can now paste it directly.",
      );
    } catch (error) {
      console.error("Failed to copy image", error);
      toast.error(
        "Failed to copy image to clipboard. Try downloading it instead.",
      );
    } finally {
      setIsCopyingImage(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
            <CalendarRange className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Daily Performance Reports
            </h2>
            <p className="text-sm text-slate-400">
              Real-time daily status and conversion metrics for all users
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportXlsx}
            disabled={
              isLoading ||
              isExportingXlsx ||
              !reportData ||
              displayedReports.length === 0
            }
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isExportingXlsx ? (
              <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
              <Download className="h-4 w-4 text-slate-500" />
            )}
            Export XLSX
          </button>
          <button
            onClick={handleExportImage}
            disabled={
              isLoading ||
              isExportingImage ||
              !reportData ||
              displayedReports.length === 0
            }
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isExportingImage ? (
              <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
              <ImageIcon className="h-4 w-4 text-slate-500" />
            )}
            Generate Image
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Date Navigation & User Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-100 shadow-sm rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevDay}
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600 shadow-sm transition-all"
          >
            ← Previous Day
          </button>
          <button
            onClick={handleToday}
            className="rounded-xl bg-slate-100 hover:bg-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all"
          >
            Today
          </button>
          <button
            onClick={handleNextDay}
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600 shadow-sm transition-all"
          >
            Next Day →
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* User Multi-Select Dropdown */}
          {allReports.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsCounselorDropdownOpen((prev) => !prev)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                  activeSelectedCounselorIds.length > 0
                    ? "border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100/50"
                    : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                }`}
              >
                <Users className="h-4 w-4 text-slate-500" />
                <span>
                  {activeSelectedCounselorIds.length === 0
                    ? `Select Users (${allReports.length})`
                    : isAllSelected
                      ? `All Users (${allReports.length})`
                      : `${activeSelectedCounselorIds.length} of ${allReports.length} Users Selected`}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                    isCounselorDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isCounselorDropdownOpen && (
                <div className="absolute right-0 sm:right-0 mt-2 w-72 rounded-2xl bg-white border border-slate-100 shadow-xl z-30 p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800">
                      Select Users
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllCounselors}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        Select All
                      </button>
                      <span className="text-slate-200">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllCounselors}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Search Filter */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search user..."
                      value={counselorSearchTerm}
                      onChange={(e) => setCounselorSearchTerm(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
                    />
                    {counselorSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setCounselorSearchTerm("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* List of Users with Checkboxes */}
                  <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                    {filteredCounselorOptions.length === 0 ? (
                      <p className="text-center text-xs text-slate-400 py-3">
                        No users found
                      </p>
                    ) : (
                      filteredCounselorOptions.map((report) => {
                        const isChecked = activeSelectedCounselorIds.includes(
                          report.counselorId,
                        );
                        return (
                          <label
                            key={report.counselorId}
                            className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl cursor-pointer text-xs transition-colors ${
                              isChecked
                                ? "bg-blue-50/70 text-blue-900 font-medium"
                                : "hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleCounselor(report.counselorId)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <span className="truncate">
                                {report.counselorName}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium shrink-0 bg-white/80 px-1.5 py-0.5 rounded border border-slate-100">
                              {report.newLeads} leads
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Select Date:
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
            />
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && !reportData && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="p-3 bg-blue-50 rounded-full text-blue-500 animate-spin">
            <RefreshCw className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Querying Daily Database records...
          </p>
        </div>
      )}

      {/* Reports Table Card */}
      {reportData && reportData.reports.length > 0 && (
        <div
          ref={exportRef}
          className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md"
        >
          <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-5 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Daily Breakdown Log
              </h3>
              <p className="mt-0.5 text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Date: {reportData.date}
              </p>
            </div>
          </div>

          {displayedReports.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex p-3.5 bg-blue-50 text-blue-600 rounded-2xl mb-3 shadow-sm border border-blue-100">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold text-slate-800">
                Select Users to View Report
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Choose the users you want to include in the breakdown from the dropdown above, or click below to show all users.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsCounselorDropdownOpen(true)}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-xl transition-all shadow-sm"
                >
                  <Users className="h-4 w-4" />
                  Select Users
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllCounselors}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl transition-all"
                >
                  Show All Users
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-3.5 font-semibold">User</th>
                    <th className="px-6 py-3.5 font-semibold text-center">
                      Leads Created Today
                    </th>
                    <th className="px-6 py-3.5 font-semibold text-center">
                      New Status
                    </th>
                    <th className="px-6 py-3.5 font-semibold text-center">
                      Ringing No Answer
                    </th>
                    <th className="px-6 py-3.5 font-semibold text-center">
                      Contacted
                    </th>
                    <th className="px-6 py-3.5 font-semibold text-center">
                      Follow-Up
                    </th>
                    <th className="px-6 py-3.5 font-semibold text-center font-bold text-emerald-600">
                      Registered
                    </th>
                    <th className="px-6 py-3.5 font-semibold text-center text-rose-500">
                      Lost
                    </th>
                    <th className="px-6 py-3.5 font-semibold text-center">
                      Follow-up Overdue
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedReports.map((report) => (
                    <tr
                      key={report.counselorId}
                      className="hover:bg-slate-50/30 transition-colors duration-200"
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-slate-800">
                        {report.counselorName}
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full font-bold text-xs">
                          {report.newLeads}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-md font-medium text-xs">
                          {report.statusNew}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md font-medium text-xs">
                          {report.statusRingingNoAnswer}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 bg-amber-50/50 text-amber-700 border border-amber-100 rounded-md font-medium text-xs">
                          {report.statusContacted}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 bg-orange-50/50 text-orange-700 border border-orange-100 rounded-md font-medium text-xs">
                          {report.statusFollowUp}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className="inline-flex items-center justify-center px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md font-bold text-xs">
                          {report.statusRegistered}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-md font-medium text-xs">
                          {report.statusLost}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-semibold ${
                            report.overdueFollowups > 0
                              ? "bg-red-50 text-red-600 border border-red-100"
                              : "bg-green-50 text-green-600 border border-green-100"
                          }`}
                        >
                          {report.overdueFollowups}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {reportData && reportData.reports.length === 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-12 text-center">
          <p className="text-slate-600 font-semibold text-lg">
            No activity found for {reportData.date}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            No leads were created or modified by any counselors on this date.
          </p>
        </div>
      )}

      {/* Info Footer Card */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 relative overflow-hidden transition-all duration-300">
        <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-blue-500" />
        <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          Metrics Explained
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs text-slate-600">
          <div className="space-y-3">
            <div>
              <strong className="text-slate-800 font-semibold">
                Leads Created Today:
              </strong>
              <p className="text-slate-400 mt-0.5">
                Total brand new lead profiles registered in the system on this
                calendar day.
              </p>
            </div>
            <div>
              <strong className="text-slate-800 font-semibold">
                New Status:
              </strong>
              <p className="text-slate-400 mt-0.5">
                Leads whose current status is New, regardless of when they were
                created.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <strong className="text-slate-800 font-semibold">
                Status Columns:
              </strong>
              <p className="text-slate-400 mt-0.5">
                Total counts of leads successfully moved into these specific
                status conditions today.
              </p>
            </div>
            <div>
              <strong className="text-slate-800 font-semibold">
                Overdue Follow-ups:
              </strong>
              <p className="text-slate-400 mt-0.5">
                Assigned scheduler tasks past their active dates that are still
                uncompleted.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 pt-3 border-t border-slate-50 text-[10px] font-semibold text-slate-400">
          Data is synced in real-time using PocketBase triggers. Auto-polling
          refreshes the state every 60 seconds automatically.
        </p>
      </div>

      {imagePreviewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Preview Daily Performance Image
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Date: {reportData?.date || selectedDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImagePreviewUrl(null)}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-all"
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto bg-slate-50 p-6 flex justify-center items-center">
              <Image
                src={imagePreviewUrl as string}
                alt="Daily report preview"
                width={1200}
                height={800}
                className="mx-auto h-auto w-full max-w-4xl rounded-xl bg-white shadow-md border border-slate-100"
                unoptimized
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => setImagePreviewUrl(null)}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCopyPreviewImage}
                disabled={isCopyingImage}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                {isCopyingImage ? "Copying..." : "Copy to Clipboard"}
              </button>
              <button
                type="button"
                onClick={handleDownloadPreviewImage}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all"
              >
                <Download className="h-4 w-4" />
                Download PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
