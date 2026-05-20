"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MdRefresh } from "react-icons/md";
import Image from "next/image";
import { Download, Image as ImageIcon, Copy } from "lucide-react";
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
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isCopyingImage, setIsCopyingImage] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

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
      void fetchDailyReport(selectedDate);
    });
    pb.collection("leadHistory").subscribe("*", () => {
      void fetchDailyReport(selectedDate);
    });

    return () => {
      pb.collection("leads").unsubscribe("*");
      pb.collection("leadHistory").unsubscribe("*");
    };
  }, [selectedDate]);

  async function fetchDailyReport(dateStr: string) {
    setIsLoading(true);
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

      const queryUrl = startParam && endParam
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
      Counselor: report.counselorName,
      "Leads Created Today": report.newLeads,
      New: report.statusNew,
      "Ringing No Answer": report.statusRingingNoAnswer,
      Contacted: report.statusContacted,
      "Follow-Up": report.statusFollowUp,
      Registered: report.statusRegistered,
      Lost: report.statusLost,
      "Overdue Follow-ups": report.overdueFollowups,
    }));

  const handleExportXlsx = async () => {
    if (!reportData || reportData.reports.length === 0) {
      toast.error("No daily report data to export");
      return;
    }

    try {
      setIsExportingXlsx(true);
      const worksheet = XLSX.utils.json_to_sheet(
        buildExportRows(reportData.reports),
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
    if (!exportRef.current || !reportData || reportData.reports.length === 0) {
      toast.error("No daily report data to export as an image");
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
      toast.success("Image copied to clipboard! You can now paste it directly.");
    } catch (error) {
      console.error("Failed to copy image", error);
      toast.error("Failed to copy image to clipboard. Try downloading it instead.");
    } finally {
      setIsCopyingImage(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Daily Reports</h2>
          <p className="text-gray-600 text-sm">
            Real-time daily metrics for each counselor
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExportXlsx}
            disabled={
              isLoading ||
              isExportingXlsx ||
              !reportData ||
              reportData.reports.length === 0
            }
            variant="outline"
            className="gap-2"
          >
            {isExportingXlsx ? (
              <MdRefresh className="animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            XLSX
          </Button>
          <Button
            onClick={handleExportImage}
            disabled={
              isLoading ||
              isExportingImage ||
              !reportData ||
              reportData.reports.length === 0
            }
            variant="outline"
            className="gap-2"
          >
            {isExportingImage ? (
              <MdRefresh className="animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            Image
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-2"
          >
            <MdRefresh className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-lg border">
        <button
          onClick={handlePrevDay}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition"
        >
          ← Previous
        </button>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleToday}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded transition"
        >
          Today
        </button>

        <button
          onClick={handleNextDay}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition"
        >
          Next →
        </button>
      </div>

      {/* Loading State */}
      {isLoading && !reportData && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin">
            <MdRefresh className="text-3xl text-blue-500" />
          </div>
          <p className="ml-3 text-gray-600">Loading report...</p>
        </div>
      )}

      {/* Reports Table */}
      {reportData && reportData.reports.length > 0 && (
        <div
          ref={exportRef}
          className="bg-white rounded-lg border overflow-hidden"
        >
          <div className="border-b bg-slate-50 px-6 py-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Daily Reports
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Date: {reportData.date}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Counselor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider text-center">
                    Leads Created Today
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider text-center">
                    New
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider text-center">
                    Ringing No Answer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider text-center">
                    Contacted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider text-center">
                    Follow-Up
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider text-center">
                    Registered
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider text-center">
                    Lost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider text-center">
                    Overdue Follow-ups
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reportData.reports.map((report, idx) => (
                  <tr
                    key={report.counselorId}
                    className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {report.counselorName}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 rounded-full font-semibold">
                        {report.newLeads}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-200 text-gray-800 rounded-full">
                        {report.statusNew}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-800 rounded-full">
                        {report.statusRingingNoAnswer}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-100 text-yellow-800 rounded-full">
                        {report.statusContacted}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-purple-100 text-purple-800 rounded-full">
                        {report.statusFollowUp}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-green-100 text-green-800 rounded-full font-semibold">
                        {report.statusRegistered}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-red-100 text-red-800 rounded-full">
                        {report.statusLost}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
                          report.overdueFollowups > 0
                             ? "bg-red-100 text-red-800 font-semibold"
                             : "bg-green-100 text-green-800"
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
        </div>
      )}

      {/* Empty State */}
      {reportData && reportData.reports.length === 0 && (
        <div className="bg-white rounded-lg border p-8 text-center">
          <p className="text-gray-600 text-lg">
            No activity for {reportData.date}
          </p>
          <p className="text-gray-500 text-sm mt-1">
            No leads were created or modified on this date.
          </p>
        </div>
      )}

      {/* Info Footer */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-gray-700">
        <p className="font-semibold">Metrics Explained:</p>
        <ul className="mt-2 space-y-1 ml-4 list-disc">
          <li>
            <strong>Leads Created Today:</strong> Total new leads brought in on
            this date
          </li>
          <li>
            <strong>New:</strong> Leads created on this date that are still in New status (deducted if converted to a different status)
          </li>
          <li>
            <strong>
              Status Columns (Ringing No Answer, Contacted, Follow-Up, Registered, Lost):
            </strong>{" "}
            Leads transitioned to these statuses on this date
          </li>
          <li>
            <strong>Overdue Follow-ups:</strong> Number of scheduled follow-ups
            past the due date and not yet completed (shown in red when present)
          </li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">
          Data is automatically refreshed every 60 seconds. Manually click
          &quot;Refresh&quot; for immediate updates.
        </p>
      </div>

      {imagePreviewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Preview Daily Report Image
                </h3>
                <p className="text-sm text-gray-500">
                  Date: {reportData?.date || selectedDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImagePreviewUrl(null)}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto bg-slate-100 p-4">
              <Image
                src={imagePreviewUrl as string}
                alt="Daily report preview"
                width={1200}
                height={800}
                className="mx-auto h-auto w-full rounded-lg bg-white shadow"
                unoptimized
              />
            </div>
            <div className="flex items-center justify-end gap-3 border-t bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => setImagePreviewUrl(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCopyPreviewImage}
                disabled={isCopyingImage}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                {isCopyingImage ? "Copying..." : "Copy Image"}
              </button>
              <button
                type="button"
                onClick={handleDownloadPreviewImage}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
