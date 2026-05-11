"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { Upload, X } from "lucide-react";
import { createPocketBaseClient } from "@/lib/pocketbase";
import { toast } from "sonner";

interface Lead {
  studentName: string;
  mobileWithCountry: string;
  email: string;
  course: string;
  leadSource: string;
  leadSourceDetail?: string;
}

type CsvField = keyof Lead;

type MappingState = Record<CsvField, string>;

interface CounselorOption {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

interface BulkUploadProps {
  operatorId: string;
  operatorLabel: string;
}

type UploadResult = {
  success: boolean;
  message: string;
  uploaded?: number;
  failed?: number;
  errors?: Array<{ row: number; message: string }>;
  duplicates?: Array<{
    row: number;
    studentName: string;
    mobileWithCountry: string;
    assignedTo?: string;
  }>;
};

export default function BulkUpload({
  operatorId,
  operatorLabel,
}: BulkUploadProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Array<Record<string, string>>>([]);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [pendingFileName, setPendingFileName] = useState("");
  const [fieldMapping, setFieldMapping] = useState<MappingState>({
    studentName: "",
    mobileWithCountry: "",
    email: "",
    course: "",
    leadSource: "",
    leadSourceDetail: "",
  });
  const [assignmentMethod, setAssignmentMethod] = useState<
    "equalSplit" | "roundRobin"
  >("equalSplit");
  const [counselors, setCounselors] = useState<CounselorOption[]>([]);
  const [selectedCounselorIds, setSelectedCounselorIds] = useState<string[]>(
    [],
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isBatchUploaded, setIsBatchUploaded] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const csvFieldLabels: Record<CsvField, string> = {
    studentName: "Student Name",
    mobileWithCountry: "Mobile With Country",
    email: "Email",
    course: "Course",
    leadSource: "Lead Source",
    leadSourceDetail: "Lead Source Detail",
  };

  useEffect(() => {
    const loadCounselors = async () => {
      setLookupError(null);
      try {
        const response = await fetch("/api/users/lookup");
        if (response.ok) {
          const data = (await response.json()) as CounselorOption[];
          const nextCounselors = Array.isArray(data) ? data : [];
          setCounselors(nextCounselors);
          setSelectedCounselorIds(nextCounselors.map((c) => c.id));
          return;
        }

        // try to read error body for debugging
        try {
          const err = await response.json();
          setLookupError(err?.error || JSON.stringify(err));
        } catch {
          setLookupError(`Lookup failed: ${response.status}`);
        }
      } catch {
        console.error("users lookup fetch failed");
        setLookupError("Lookup failed");
      }

      // Fallback: query PocketBase directly using client
      try {
        const pb = createPocketBaseClient();
        type PBUser = {
          id?: string;
          name?: string;
          email?: string;
          role?: string;
          accountStatus?: string;
        };
        const users = (await pb.collection("users").getFullList({
          sort: "name",
          requestKey: null,
        })) as PBUser[];

        const filtered = users
          .filter((u) => {
            const accountStatus = (u.accountStatus || "").toLowerCase();
            return accountStatus === "enabled" || accountStatus === "active";
          })
          .map((user) => ({
            id: user.id || "",
            name: user.name || user.email || user.id || "",
            email: user.email,
            role: user.role,
          }));

        if (filtered.length > 0) {
          setCounselors(filtered);
          setSelectedCounselorIds(filtered.map((c) => c.id));
          setLookupError(null);
          return;
        }

        // no counselors found
        setCounselors([]);
        setSelectedCounselorIds([]);
      } catch (fallbackError) {
        console.error("Fallback users lookup failed", fallbackError);
        setLookupError(
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError),
        );
        setCounselors([]);
        setSelectedCounselorIds([]);
      }
    };

    loadCounselors();
  }, []);

  const normalizeHeader = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");

  const buildDefaultMapping = (headers: string[]): MappingState => {
    const normalizedHeaders = headers.map((header) => ({
      original: header,
      normalized: normalizeHeader(header),
    }));

    const findHeader = (...candidates: string[]) => {
      const match = normalizedHeaders.find((header) =>
        candidates.includes(header.normalized),
      );
      return match?.original || "";
    };

    return {
      studentName: findHeader("studentname", "name", "student"),
      mobileWithCountry: findHeader(
        "mobilewithcountry",
        "mobile",
        "mobilenumber",
        "phone",
        "phonenumber",
      ),
      email: findHeader("email", "mail"),
      course: findHeader("course", "coursename"),
      leadSource: findHeader("leadsource", "source", "leadsource"),
      leadSourceDetail: findHeader(
        "lead sourcedetail",
        "leadsource detail",
        "leadsource detail",
        "referred by",
        "referredby",
        "details",
      ),
    };
  };

  const getCellValue = (row: Record<string, string>, headerName: string) => {
    if (!headerName) return "";
    const targetNorm = normalizeHeader(headerName);
    const key = Object.keys(row).find((k) => normalizeHeader(k) === targetNorm);
    return String(row[key ?? ""] ?? "").trim();
  };

  const selectedCounselors = counselors.filter((counselor) =>
    selectedCounselorIds.includes(counselor.id),
  );

  const getAssignmentBreakdown = () => {
    if (leads.length === 0 || selectedCounselors.length === 0) {
      return [] as Array<{ id: string; name: string; count: number }>;
    }

    const counts = new Map<string, number>();
    selectedCounselors.forEach((counselor) => counts.set(counselor.id, 0));

    if (assignmentMethod === "roundRobin") {
      leads.forEach((_, index) => {
        const counselor = selectedCounselors[index % selectedCounselors.length];
        counts.set(counselor.id, (counts.get(counselor.id) || 0) + 1);
      });
    } else {
      const baseCount = Math.floor(leads.length / selectedCounselors.length);
      const remainder = leads.length % selectedCounselors.length;

      selectedCounselors.forEach((counselor, index) => {
        counts.set(counselor.id, baseCount + (index < remainder ? 1 : 0));
      });
    }

    return selectedCounselors.map((counselor) => ({
      id: counselor.id,
      name: counselor.name,
      count: counts.get(counselor.id) || 0,
    }));
  };

  const handleFileUpload = (file: File) => {
    setUploadResult(null);
    setIsBatchUploaded(false);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = (results.meta.fields || []).map((header) =>
          header.trim(),
        );
        const dataRows = (results.data || []).filter((row) =>
          Object.values(row).some((value) => String(value ?? "").trim()),
        );

        if (headers.length === 0 || dataRows.length === 0) {
          alert("CSV needs a header row and at least one data row");
          return;
        }

        setCsvHeaders(headers);
        setCsvRows(dataRows);
        setFieldMapping(buildDefaultMapping(headers));
        setPendingFileName(file.name);
        setMappingOpen(true);
      },
      error: (error) => {
        alert(`Error reading file: ${error.message}`);
      },
    });
  };

  const applyMapping = () => {
    const mappedLeads = csvRows
      .map((row) => {
        const resolveValue = (field: CsvField) => {
          const header = fieldMapping[field];
          if (!header) return field === "leadSource" ? "Bulk Upload" : "";
          return (
            getCellValue(row, header) ||
            (field === "leadSource" ? "Bulk Upload" : "")
          );
        };

        return {
          studentName: resolveValue("studentName"),
          mobileWithCountry: resolveValue("mobileWithCountry"),
          email: resolveValue("email"),
          course: resolveValue("course"),
          leadSource: resolveValue("leadSource") || "Bulk Upload",
          leadSourceDetail: resolveValue("leadSourceDetail"),
        };
      })
      .filter(
        (lead) => lead.studentName && lead.mobileWithCountry && lead.course,
      );

    if (mappedLeads.length === 0) {
      // Helpful feedback when mapping didn't produce any valid leads
      alert(
        "No valid leads found with the current mapping. Ensure Student Name, Mobile With Country and Course are mapped to the correct CSV columns.",
      );
      return;
    }

    setLeads(mappedLeads);
    setIsBatchUploaded(false);
    setMappingOpen(false);
  };

  const cancelMapping = () => {
    setMappingOpen(false);
    setPendingFileName("");
    setCsvHeaders([]);
    setCsvRows([]);
  };

  const handleUpload = async () => {
    if (leads.length === 0) {
      alert("No leads to upload");
      return;
    }

    if (selectedCounselorIds.length === 0) {
      alert("Please select at least one counselor");
      return;
    }

    if (isBatchUploaded) {
      toast.info(
        "This batch is already uploaded. Choose a new file to upload again.",
      );
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
          selectedCounselorIds,
          performedBy: operatorId,
          performedByLabel: operatorLabel,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        const message = result?.error || result?.message || "Upload failed";
        setUploadResult({ success: false, message });
        toast.error(message);
      } else {
        setUploadResult(result);
        setIsBatchUploaded(true);
        if (result?.success) {
          toast.success(result.message || "Leads uploaded");
        } else {
          toast.error(result.message || "Upload completed with errors");
        }
      }
    } catch {
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
              Columns: Student Name, Mobile With Country, Email, Course, Lead
              Source, Lead Source Detail
            </p>
          </label>
        </div>
      </div>

      {mappingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  Map CSV Columns
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {pendingFileName} - match CSV columns to PocketBase lead
                  fields.
                </p>
              </div>
              <button
                type="button"
                onClick={cancelMapping}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Close mapping dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 p-6">
              {(Object.keys(csvFieldLabels) as CsvField[]).map((field) => (
                <label
                  key={field}
                  className="grid gap-2 sm:grid-cols-3 sm:items-center"
                >
                  <span className="text-sm font-medium text-gray-700">
                    {csvFieldLabels[field]}
                  </span>
                  <select
                    value={fieldMapping[field]}
                    onChange={(e) =>
                      setFieldMapping((current) => ({
                        ...current,
                        [field]: e.target.value,
                      }))
                    }
                    className="sm:col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Select CSV column</option>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">Preview</p>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {csvRows.length} CSV rows
                  </p>
                </div>
                <p className="mt-1">
                  Leads are created only after the fields are mapped. Rows
                  missing student name, mobile with country, or course will be
                  skipped. Lead source detail is optional and is stored when
                  mapped.
                </p>

                <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                  {csvRows.length === 0 ? (
                    <p className="text-sm text-gray-500">No data rows</p>
                  ) : (
                    csvRows.map((row, idx) => {
                      const previewRow = {
                        studentName: getCellValue(
                          row,
                          fieldMapping.studentName,
                        ),
                        mobileWithCountry: getCellValue(
                          row,
                          fieldMapping.mobileWithCountry,
                        ),
                        course: getCellValue(row, fieldMapping.course),
                        leadSourceDetail: getCellValue(
                          row,
                          fieldMapping.leadSourceDetail,
                        ),
                      };

                      return (
                        <div
                          key={idx}
                          className="mt-2 rounded-md border bg-white p-2 text-sm"
                        >
                          <div className="flex gap-4">
                            <div className="min-w-[160px]">
                              <div className="text-xs text-gray-500">
                                Row {idx + 1} Name
                              </div>
                              <div className="font-medium">
                                {previewRow.studentName || "—"}
                              </div>
                            </div>
                            <div className="min-w-[120px]">
                              <div className="text-xs text-gray-500">
                                Mobile
                              </div>
                              <div className="font-medium">
                                {previewRow.mobileWithCountry || "—"}
                              </div>
                            </div>
                            <div className="min-w-[120px]">
                              <div className="text-xs text-gray-500">
                                Course
                              </div>
                              <div className="font-medium">
                                {previewRow.course || "—"}
                              </div>
                            </div>
                            <div className="min-w-[160px]">
                              <div className="text-xs text-gray-500">
                                Lead Source Detail
                              </div>
                              <div className="font-medium">
                                {previewRow.leadSourceDetail || "—"}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 p-6">
              <button
                type="button"
                onClick={cancelMapping}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyMapping}
                disabled={
                  csvRows.length === 0 ||
                  csvRows.every((row) => {
                    // determine if mapping would produce no required fields
                    const v = (field: CsvField) =>
                      getCellValue(row, fieldMapping[field]);

                    return !(
                      v("studentName") &&
                      v("mobileWithCountry") &&
                      v("course")
                    );
                  })
                }
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Use mapping
              </button>
            </div>
          </div>
        </div>
      )}

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
                checked={assignmentMethod === "equalSplit"}
                onChange={() => setAssignmentMethod("equalSplit")}
                className="w-4 h-4"
              />
              <span className="text-gray-700">
                Equal split - divide leads evenly among selected counselors
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                checked={assignmentMethod === "roundRobin"}
                onChange={() => setAssignmentMethod("roundRobin")}
                className="w-4 h-4"
              />
              <span className="text-gray-700">
                Round robin - assign leads one by one to active counselors
              </span>
            </label>
          </div>

          {selectedCounselors.length > 0 && leads.length > 0 && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-blue-900">
                    Assignment breakdown
                  </p>
                  <p className="text-sm text-blue-800">
                    {assignmentMethod === "roundRobin"
                      ? "Round robin assignment based on the current lead count."
                      : "Equal split across the selected counselors."}
                  </p>
                </div>
                <p className="text-sm font-medium text-blue-900">
                  {leads.length} total leads
                </p>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {getAssignmentBreakdown().map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-blue-100 bg-white px-3 py-2"
                  >
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-600">
                      {item.count} lead{item.count === 1 ? "" : "s"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-medium text-gray-900">Active counselors</h4>
              <button
                type="button"
                onClick={() =>
                  setSelectedCounselorIds(
                    counselors.map((counselor) => counselor.id),
                  )
                }
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Select all
              </button>
            </div>

            {counselors.length === 0 ? (
              <div className="mt-3 text-sm">
                {lookupError ? (
                  <p className="text-red-600">{lookupError}</p>
                ) : (
                  <p className="text-gray-500">
                    No active counselors were found.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {counselors.map((counselor) => {
                  const isSelected = selectedCounselorIds.includes(
                    counselor.id,
                  );

                  return (
                    <label
                      key={counselor.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 transition ${
                        isSelected
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          setSelectedCounselorIds((current) =>
                            e.target.checked
                              ? [...current, counselor.id]
                              : current.filter((id) => id !== counselor.id),
                          );
                        }}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-gray-900">
                          {counselor.name}
                        </span>
                        {counselor.role && (
                          <span className="block truncate text-sm text-gray-500">
                            {counselor.role}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
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
                  <th className="px-4 py-2 text-left">Lead Source Detail</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">{lead.studentName}</td>
                    <td className="px-4 py-2">{lead.mobileWithCountry}</td>
                    <td className="px-4 py-2">{lead.course}</td>
                    <td className="px-4 py-2">
                      {lead.leadSourceDetail || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleUpload}
            disabled={isUploading || isBatchUploaded}
            className="mt-4 w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition font-medium"
          >
            {isUploading
              ? "Uploading..."
              : isBatchUploaded
                ? "Bulk Upload Completed"
                : "Upload Leads"}
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
          {uploadResult.errors && uploadResult.errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {uploadResult.errors.map((error, index) => (
                <li key={`${error.row}-${index}`}>
                  Row {error.row}: {error.message}
                </li>
              ))}
            </ul>
          )}
          {uploadResult.duplicates && uploadResult.duplicates.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <p className="font-semibold">Already existing leads</p>
              <ul className="mt-2 space-y-1 text-sm">
                {uploadResult.duplicates.map((duplicate, index) => (
                  <li
                    key={`${duplicate.row}-${duplicate.mobileWithCountry}-${index}`}
                  >
                    Row {duplicate.row}: {duplicate.mobileWithCountry}
                    {duplicate.assignedTo
                      ? ` (Assigned to ${duplicate.assignedTo})`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
