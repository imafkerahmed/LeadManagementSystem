"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

interface Lead {
  studentName: string;
  mobile: string;
  email: string;
  course: string;
  leadSource: string;
}

interface BulkUploadProps {
  operatorId: string;
  operatorLabel: string;
}

export default function BulkUpload({
  operatorId,
  operatorLabel,
}: BulkUploadProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [assignmentMethod, setAssignmentMethod] = useState<
    "roundRobin" | "singleCounselor"
  >("roundRobin");
  const [singleCounselor, setSingleCounselor] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      const rows = text.split("\n").filter((row) => row.trim());

      const headers = rows[0].split(",").map((h) => h.trim().toLowerCase());
      const uploadedLeads: Lead[] = [];

      for (let i = 1; i < rows.length; i++) {
        const values = rows[i].split(",").map((v) => v.trim());
        const lead: Lead = {
          studentName: values[headers.indexOf("studentname")] || "",
          mobile: values[headers.indexOf("mobile")] || "",
          email: values[headers.indexOf("email")] || "",
          course: values[headers.indexOf("course")] || "",
          leadSource: values[headers.indexOf("leadsource")] || "Bulk Upload",
        };
        if (lead.studentName && lead.mobile && lead.course) {
          uploadedLeads.push(lead);
        }
      }

      setLeads(uploadedLeads);
    } catch (error) {
      alert("Error reading file");
    }
  };

  const handleUpload = async () => {
    if (leads.length === 0) {
      alert("No leads to upload");
      return;
    }

    if (assignmentMethod === "singleCounselor" && !singleCounselor) {
      alert("Please select a counselor");
      return;
    }

    setIsUploading(true);
    try {
      const response = await fetch("/api/admin/bulk-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads,
          assignmentMethod,
          singleCounselor:
            assignmentMethod === "singleCounselor" ? singleCounselor : null,
          performedBy: operatorId,
          performedByLabel: operatorLabel,
        }),
      });

      const result = await response.json();
      setUploadResult(result);
    } catch (error) {
      setUploadResult({ success: false, message: "Upload failed" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Upload CSV/Excel
        </h3>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
            className="hidden"
            id="fileInput"
          />
          <label htmlFor="fileInput" className="cursor-pointer">
            <p className="text-gray-700 font-medium">
              Click to upload CSV or Excel file
            </p>
            <p className="text-sm text-gray-500">
              Columns: Student Name, Mobile, Email, Course, Lead Source
            </p>
          </label>
        </div>
      </div>

      {/* Assignment Settings */}
      {leads.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Assignment Method
          </h3>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                checked={assignmentMethod === "roundRobin"}
                onChange={() => setAssignmentMethod("roundRobin")}
                className="w-4 h-4"
              />
              <span className="text-gray-700">
                Round Robin - Distribute evenly among counselors
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                checked={assignmentMethod === "singleCounselor"}
                onChange={() => setAssignmentMethod("singleCounselor")}
                className="w-4 h-4"
              />
              <span className="text-gray-700">Assign to single counselor:</span>
            </label>
            {assignmentMethod === "singleCounselor" && (
              <input
                type="text"
                placeholder="Counselor name"
                value={singleCounselor}
                onChange={(e) => setSingleCounselor(e.target.value)}
                className="ml-6 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        </div>
      )}

      {/* Preview */}
      {leads.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {leads.length} Leads Ready to Upload
          </h3>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Mobile</th>
                  <th className="px-4 py-2 text-left">Course</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">{lead.studentName}</td>
                    <td className="px-4 py-2">{lead.mobile}</td>
                    <td className="px-4 py-2">{lead.course}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="mt-4 w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium"
          >
            {isUploading ? "Uploading..." : "Upload Leads"}
          </button>
        </div>
      )}

      {/* Result */}
      {uploadResult && (
        <div
          className={`rounded-lg p-4 ${
            uploadResult.success
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          <p className="font-semibold">{uploadResult.message}</p>
          <p className="text-sm mt-1">
            Uploaded: {uploadResult.uploaded} | Failed: {uploadResult.failed}
          </p>
        </div>
      )}
    </div>
  );
}
