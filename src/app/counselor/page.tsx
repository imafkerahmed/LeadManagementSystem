"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut, X } from "lucide-react";
import { createPocketBaseClient } from "@/lib/pocketbase";

interface Lead {
  id: string;
  leadId: string;
  name: string;
  mobile: string;
  email: string;
  course: string;
  status: string;
  comments: string;
  created: string;
  updated: string;
  assignedTo: string;
}

interface HistoryEntry {
  id: string;
  eventType: string;
  changedBy: string;
  studentName?: string;
  oldValue?: string;
  newValue?: string;
  comment?: string;
  created: string;
}

type LeadRecord = {
  id: string;
  leadId?: string;
  studentName?: string;
  mobileNo?: string;
  email?: string;
  courseName?: string;
  leadStatus?: string;
  latestComment?: string;
  created?: string;
  updated?: string;
  lastModified?: string;
  assignedTo?: string;
};

type HistoryRecord = {
  id: string;
  eventType?: string;
  changedBy?: string;
  oldValue?: string;
  newValue?: string;
  comment?: string;
  created?: string;
  expand?: {
    changedBy?: {
      name?: string;
      email?: string;
    };
    studentName?: {
      studentName?: string;
    };
    leadId?: {
      studentName?: string;
    };
  };
};

interface UserLookupItem {
  id: string;
  name: string;
  email?: string;
}

const PAGE_SIZE = 8;

export default function CounselorPage() {
  const router = useRouter();
  const pb = createPocketBaseClient();
  const authUser = pb.authStore.model as {
    id?: string;
    name?: string;
    role?: string;
  } | null;
  const counselorId = authUser?.id || "";
  const counselorName = authUser?.name || "Student Counsellor";
  const isCounselorValid =
    pb.authStore.isValid && authUser?.role === "student-counsellor";

  const [tab, setTab] = useState<"followup" | "addlead">("followup");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadHistory, setLeadHistory] = useState<HistoryEntry[]>([]);
  const [userLookup, setUserLookup] = useState<Record<string, string>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const [isUpdating, setIsUpdating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Form states
  const [statusSelect, setStatusSelect] = useState("");
  const [commentBox, setCommentBox] = useState("");
  const [newName, setNewName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCourse, setNewCourse] = useState("");
  const [newLeadSource, setNewLeadSource] = useState("Direct");
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<"success" | "error">("success");

  useEffect(() => {
    if (!isCounselorValid) {
      router.replace("/");
    }
  }, [isCounselorValid, router]);

  useEffect(() => {
    const loadUserLookup = async () => {
      try {
        const response = await fetch("/api/users/lookup");
        if (!response.ok) {
          return;
        }

        const users = (await response.json()) as UserLookupItem[];
        if (Array.isArray(users)) {
          const nextLookup = users.reduce<Record<string, string>>(
            (accumulator, user) => {
              accumulator[user.id] = user.name || user.email || user.id;
              return accumulator;
            },
            {},
          );
          setUserLookup(nextLookup);
        }
      } catch (error) {
        console.error("Error loading user lookup:", error);
      }
    };

    loadUserLookup();
  }, []);

  const showToast = (msg: string, type: "success" | "error") => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const fetchLeads = useCallback(
    async (userId: string, selectedLeadId?: string) => {
      try {
        const pb = createPocketBaseClient();
        const safeUserId = userId.replaceAll('"', '\\"');
        const safeCounselorName = counselorName.replaceAll('"', '\\"');
        const assignedFilter = safeCounselorName
          ? `(assignedTo = "${safeUserId}" || assignedTo = "${safeCounselorName}")`
          : `assignedTo = "${safeUserId}"`;
        const records = (await pb.collection("leads").getFullList({
          filter: `${assignedFilter} && (leadStatus = "New" || leadStatus = "Contacted" || leadStatus = "Follow-Up")`,
          sort: "-created",
        })) as LeadRecord[];

        const nextLeads = records.map((lead) => ({
          id: lead.id,
          leadId: lead.leadId || "",
          name: lead.studentName || "",
          mobile: lead.mobileNo || "",
          email: lead.email || "",
          course: lead.courseName || "",
          status: lead.leadStatus || "",
          comments: lead.latestComment || "",
          created: lead.created || "",
          updated: lead.lastModified || lead.updated || lead.created || "",
          assignedTo: lead.assignedTo || "",
        }));

        setLeads(nextLeads);

        if (nextLeads.length > 0) {
          const nextIndex = selectedLeadId
            ? nextLeads.findIndex((lead) => lead.id === selectedLeadId)
            : 0;
          const safeIndex = nextIndex >= 0 ? nextIndex : 0;
          setSelectedLead(nextLeads[safeIndex]);
          setStatusSelect(nextLeads[safeIndex].status);
        } else {
          setSelectedLead(null);
          setStatusSelect("");
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("aborted")) {
          // Request was cancelled, don't show error
          console.debug("Leads request cancelled");
        } else {
          console.error("Error fetching leads:", error);
          showToast(
            error instanceof Error ? error.message : "Failed to load leads",
            "error",
          );
        }
      } finally {
        // No loading state needed here yet.
      }
    },
    [counselorName],
  );

  useEffect(() => {
    if (!counselorId) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLeads(counselorId);
  }, [counselorId, fetchLeads]);

  const openLeadDetails = async (lead: Lead) => {
    setModalOpen(true);
    setTimelineOpen(false);
    setHistoryLoading(true);

    try {
      const pb = createPocketBaseClient();
      const latestLead = await pb.collection("leads").getOne(lead.id);
      const nextLead: Lead = {
        id: latestLead.id,
        leadId: latestLead.leadId,
        name: latestLead.studentName,
        mobile: latestLead.mobileNo,
        email: latestLead.email || "",
        course: latestLead.courseName,
        status: latestLead.leadStatus,
        comments: latestLead.latestComment || "",
        created: latestLead.created,
        updated:
          latestLead.lastModified || latestLead.updated || latestLead.created,
        assignedTo: latestLead.assignedTo,
      };

      setSelectedLead(nextLead);
      setStatusSelect(nextLead.status);
      const history = (await pb.collection("leadHistory").getFullList({
        filter: `leadId = "${lead.id}"`,
        sort: "-created",
        expand: "leadId,studentName,changedBy",
      })) as HistoryRecord[];

      setLeadHistory(
        history.map((entry) => ({
          id: entry.id,
          eventType: entry.eventType || "",
          changedBy:
            entry.expand?.changedBy?.name ||
            entry.expand?.changedBy?.email ||
            entry.changedBy ||
            "Unknown",
          studentName:
            entry.expand?.studentName?.studentName ||
            entry.expand?.leadId?.studentName ||
            nextLead.name,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          comment: entry.comment,
          created: entry.created || "",
        })),
      );
    } catch (error) {
      console.error("Error loading history:", error);
      setLeadHistory([]);
      showToast("Failed to load lead history", "error");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmitForm = async () => {
    const trimmedComment = commentBox.trim();

    if (!selectedLead) {
      showToast("Please select a lead", "error");
      return;
    }

    if (statusSelect === selectedLead.status && !trimmedComment) {
      showToast("Change the status or add a comment", "error");
      return;
    }

    try {
      setIsUpdating(true);
      const response = await fetch("/api/counselor/update-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLead.leadId,
          newStatus: statusSelect,
          comment: trimmedComment,
          counselorName,
          counselorId,
        }),
      });

      const result = await response.json();
      if (result.success) {
        showToast("Updated successfully!", "success");
        setCommentBox("");
        await fetchLeads(counselorId, selectedLead.id);
        await openLeadDetails(selectedLead);
      } else {
        showToast(result.error, "error");
      }
    } catch {
      showToast("Error updating lead", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddLead = async () => {
    const trimmedName = newName.trim();
    const trimmedMobile = newMobile.trim();
    const trimmedCourse = newCourse.trim();
    const trimmedEmail = newEmail.trim();

    if (!counselorId) {
      showToast("Missing counselor identity", "error");
      return;
    }

    if (!trimmedName || !trimmedMobile || !trimmedCourse) {
      showToast("Name, mobile, and course are required", "error");
      return;
    }

    try {
      setIsUpdating(true);
      const response = await fetch("/api/counselor/add-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: trimmedName,
          mobile: trimmedMobile,
          email: trimmedEmail || undefined,
          course: trimmedCourse,
          leadSource: newLeadSource,
          counselorName,
          counselorId,
        }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        showToast("Lead created", "success");
        setNewName("");
        setNewMobile("");
        setNewEmail("");
        setNewCourse("");
        setNewLeadSource("Direct");
        setTab("followup");
        await fetchLeads(counselorId);
      } else {
        showToast(result.error || "Failed to create lead", "error");
      }
    } catch {
      showToast("Failed to create lead", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const currentPage = Math.min(tablePage, totalPages);
  const paginatedLeads = leads.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              Amazon College
            </h1>
            <p className="text-sm text-slate-500">{counselorName}</p>
          </div>
          <button
            onClick={() => {
              const pb = createPocketBaseClient();
              pb.authStore.clear();
              router.replace("/");
            }}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-5xl gap-2 px-4 pb-4 sm:px-6">
          <button
            onClick={() => setTab("followup")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === "followup"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Follow-up
          </button>
          <button
            onClick={() => setTab("addlead")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === "addlead"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Add Lead
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        {toastMsg && (
          <div
            className={`mb-4 rounded-md border px-3 py-2 text-sm ${
              toastType === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {toastMsg}
          </div>
        )}

        {tab === "followup" ? (
          <div className="space-y-4">
            {leads.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                No active leads assigned
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-medium">Lead</th>
                        <th className="px-4 py-3 font-medium">Mobile</th>
                        <th className="px-4 py-3 font-medium">Course</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Updated</th>
                        <th className="px-4 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedLeads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">
                              {lead.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {lead.leadId}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {lead.mobile}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {lead.course}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                              {lead.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {new Date(lead.updated).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => openLeadDetails(lead)}
                              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              View details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    Showing {(currentPage - 1) * PAGE_SIZE + 1} -{" "}
                    {Math.min(currentPage * PAGE_SIZE, leads.length)} of{" "}
                    {leads.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setTablePage((page) => Math.max(1, page - 1))
                      }
                      disabled={currentPage === 1}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </button>
                    <span className="text-xs font-medium text-slate-500">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setTablePage((page) => Math.min(totalPages, page + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-slate-700">
                  Student Name*
                </label>
                <input
                  type="text"
                  placeholder="Student Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Mobile No*
                </label>
                <input
                  type="tel"
                  placeholder="07XXXXXXXX"
                  value={newMobile}
                  onChange={(e) => setNewMobile(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="optional@email.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-slate-700">
                  Course*
                </label>
                <input
                  type="text"
                  placeholder="e.g., HND in Business"
                  value={newCourse}
                  onChange={(e) => setNewCourse(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-slate-700">
                  Lead Source
                </label>
                <select
                  value={newLeadSource}
                  onChange={(e) => setNewLeadSource(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                >
                  <option>Direct</option>
                  <option>Referral</option>
                  <option>Social Media</option>
                  <option>Website</option>
                  <option>Other</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <button
                  onClick={handleAddLead}
                  disabled={isUpdating}
                  className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUpdating ? "Creating..." : "Create New Lead"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {modalOpen && selectedLead && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/50 px-0 sm:items-center sm:px-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Lead details
                </p>
                <h2 className="text-lg font-semibold text-slate-900">
                  {selectedLead.name}
                </h2>
                <p className="text-sm text-slate-500">{selectedLead.leadId}</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Close lead details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid flex-1 gap-4 overflow-y-auto px-4 py-4 sm:px-6 lg:grid-cols-[280px_1fr] lg:gap-6">
              <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Mobile
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {selectedLead.mobile}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Course
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {selectedLead.course}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Email
                  </div>
                  <div className="mt-1 break-all font-medium text-slate-900">
                    {selectedLead.email || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Current status
                  </div>
                  <div className="mt-1 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {selectedLead.status}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Assigned to
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {userLookup[selectedLead.assignedTo] ||
                      selectedLead.assignedTo ||
                      "-"}
                  </div>
                </div>
                <a
                  href={`https://wa.me/${selectedLead.mobile.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Send WhatsApp Message
                </a>
              </section>

              <section className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Update Status
                      </label>
                      <select
                        value={statusSelect}
                        onChange={(e) => setStatusSelect(e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                      >
                        {[
                          "New",
                          "Contacted",
                          "Follow-Up",
                          "Registered",
                          "Lost",
                        ].map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Add Comment
                      </label>
                      <textarea
                        value={commentBox}
                        onChange={(e) => setCommentBox(e.target.value)}
                        placeholder="Enter your comment..."
                        className="min-h-28 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                      />
                    </div>

                    <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row">
                      <button
                        onClick={handleSubmitForm}
                        disabled={isUpdating}
                        className="inline-flex flex-1 items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isUpdating ? "Updating..." : "Update Lead"}
                      </button>
                      <button
                        onClick={() => openLeadDetails(selectedLead)}
                        disabled={historyLoading}
                        className="inline-flex flex-1 items-center justify-center rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Refresh timeline
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <button
                    onClick={() => setTimelineOpen((current) => !current)}
                    className="flex w-full items-center justify-between border-b border-slate-200 px-4 py-3 text-left"
                  >
                    <h3 className="text-sm font-semibold text-slate-900">
                      Timeline
                    </h3>
                    <span className="text-xs font-medium text-slate-500">
                      {timelineOpen ? "Hide" : "Show"}
                    </span>
                  </button>
                  {timelineOpen && (
                    <div className="space-y-4 px-4 py-4">
                      {historyLoading ? (
                        <p className="text-sm text-slate-500">
                          Loading history...
                        </p>
                      ) : leadHistory.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          No history found for this lead.
                        </p>
                      ) : (
                        leadHistory.map((entry) => (
                          <div key={entry.id} className="relative pl-5">
                            <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-slate-900" />
                            <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-700">
                                  {entry.eventType}
                                </span>
                                <span>
                                  {new Date(entry.created).toLocaleString()}
                                </span>
                                <span>
                                  By{" "}
                                  {userLookup[entry.changedBy] ||
                                    entry.changedBy}
                                </span>
                              </div>
                              <div className="text-sm text-slate-700">
                                {entry.oldValue || entry.newValue ? (
                                  <span>
                                    {entry.oldValue ? `${entry.oldValue} ` : ""}
                                    {entry.oldValue && entry.newValue
                                      ? "→ "
                                      : ""}
                                    {entry.newValue || ""}
                                  </span>
                                ) : null}
                              </div>
                              {entry.comment ? (
                                <p className="text-sm text-slate-600">
                                  {entry.comment}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
