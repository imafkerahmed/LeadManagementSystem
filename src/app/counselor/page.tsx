"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { createPocketBaseClient } from "@/lib/pocketbase";
import {
  LEAD_SOURCE_OPTIONS,
  getLeadSourceDetailLabel,
  shouldShowLeadSourceDetail,
} from "@/lib/lead-sources";
import { toast } from "sonner";

interface Lead {
  id: string;
  leadId: string;
  name: string;
  countryCode?: string;
  mobile: string;
  mobileWithCountry?: string;
  email: string;
  course: string;
  leadSource?: string;
  leadSourceDetail?: string;
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
  commentText?: string;
  created: string;
}
type LeadRecord = {
  id: string;
  leadId?: string;
  studentName?: string;
  countryCode?: string;
  mobile?: string;
  mobileWithCountry?: string;
  email?: string;
  course?: string;
  courseName?: string;
  leadSource?: string;
  leadSourceDetail?: string;
  status?: string;
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
      latestComment?: string;
    };
  };
};

interface UserLookupItem {
  id: string;
  name: string;
  email?: string;
}

const PAGE_SIZE = 10;

export default function CounselorPage() {
  const router = useRouter();
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const pb = createPocketBaseClient();
  const authUser = pb.authStore.model as {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  } | null;
  const isCounselor =
    pb.authStore.isValid && authUser?.role === "student-counsellor";
  const counselorId = authUser?.id || "";
  const counselorName = authUser?.name || "Student Counsellor";

  useEffect(() => {
    if (!isCounselor) {
      router.replace("/");
    }
  }, [isCounselor, router]);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadHistory, setLeadHistory] = useState<HistoryEntry[]>([]);
  const [userLookup, setUserLookup] = useState<Record<string, string>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const [isUpdating, setIsUpdating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [addLeadModalOpen, setAddLeadModalOpen] = useState(false);
  const [addLeadModalVisible, setAddLeadModalVisible] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Form states
  const [statusSelect, setStatusSelect] = useState("");
  const [commentBox, setCommentBox] = useState("");
  const [newName, setNewName] = useState("");
  const [newCountryCode, setNewCountryCode] = useState("+94");
  const [newMobile, setNewMobile] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCourse, setNewCourse] = useState("");
  const [newLeadSource, setNewLeadSource] = useState("Direct");
  const [newLeadSourceDetail, setNewLeadSourceDetail] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showNoLeadsText, setShowNoLeadsText] = useState(false);

  // Duplicate detection state
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [duplicateWarningVisible, setDuplicateWarningVisible] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    leadId: string;
    studentName: string;
    mobile: string;
    status: string;
    assigneeName: string;
  } | null>(null);

  // Status flow: New -> Contacted -> Follow-Up -> Registered
  const statusFlow = ["New", "Contacted", "Follow-up", "Registered", "Lost"];

  // Status badge color map
  const getStatusColor = (status: string) => {
    switch (status) {
      case "New":
        return "bg-blue-100 text-blue-700";
      case "Contacted":
        return "bg-purple-100 text-purple-700";
      case "Follow-up":
        return "bg-amber-100 text-amber-700";
      case "Registered":
        return "bg-emerald-100 text-emerald-700";
      case "Lost":
        return "bg-rose-100 text-rose-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const formatPhoneNumber = (value: string) => value.replace(/-/g, "");

  const getValidNextStatuses = (
    currentStatus: string | undefined,
  ): string[] => {
    if (!currentStatus || currentStatus.trim() === "") return statusFlow;
    const currentIndex = statusFlow.indexOf(currentStatus);
    if (currentIndex === -1) return statusFlow;
    // If already in a terminal state, no updates allowed
    if (currentStatus === "Registered" || currentStatus === "Lost") return [];
    // Include the current status so comment-only submissions are allowed,
    // then allow forward statuses (no going back).
    return [currentStatus, ...statusFlow.slice(currentIndex + 1)];
  };

  const getDefaultModalStatus = (currentStatus: string) => {
    if (currentStatus === "New") {
      return "Contacted";
    }

    return currentStatus;
  };

  useEffect(() => {
    if (modalOpen) {
      const timer = window.setTimeout(() => setModalVisible(true), 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => setModalVisible(false), 180);
    return () => window.clearTimeout(timer);
  }, [modalOpen]);

  useEffect(() => {
    if (addLeadModalOpen) {
      const timer = window.setTimeout(() => setAddLeadModalVisible(true), 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => setAddLeadModalVisible(false), 180);
    return () => window.clearTimeout(timer);
  }, [addLeadModalOpen]);

  useEffect(() => {
    if (duplicateWarningOpen) {
      const timer = window.setTimeout(
        () => setDuplicateWarningVisible(true),
        0,
      );
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(
      () => setDuplicateWarningVisible(false),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [duplicateWarningOpen]);

  const groupHistoryEntries = (entries: HistoryEntry[]) => {
    const grouped: Array<{
      entries: HistoryEntry[];
      timestamp: string;
      changedBy: string;
    }> = [];
    const processed = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      if (processed.has(entries[i].id)) continue;

      const current = entries[i];
      const next = entries[i + 1];

      // Helper to check if two timestamps are within 2 seconds of each other
      const isWithinTimeWindow = (ts1: string, ts2: string) => {
        try {
          const date1 = new Date(ts1).getTime();
          const date2 = new Date(ts2).getTime();
          return Math.abs(date1 - date2) <= 2000; // 2 seconds
        } catch {
          return false;
        }
      };

      // Check if current is Status Change and next is Comment (within time window, same user)
      if (
        current.eventType === "Status Change" &&
        next &&
        next.eventType === "Comment" &&
        isWithinTimeWindow(current.created, next.created) &&
        current.changedBy === next.changedBy
      ) {
        grouped.push({
          entries: [current, next],
          timestamp: current.created,
          changedBy: current.changedBy,
        });
        processed.add(current.id);
        processed.add(next.id);
        i++; // Skip the comment entry as it's grouped
      }
      // Check if current is Comment and next is Status Change (within time window, same user)
      else if (
        current.eventType === "Comment" &&
        next &&
        next.eventType === "Status Change" &&
        isWithinTimeWindow(current.created, next.created) &&
        current.changedBy === next.changedBy
      ) {
        grouped.push({
          entries: [next, current], // Put Status Change first
          timestamp: current.created,
          changedBy: current.changedBy,
        });
        processed.add(current.id);
        processed.add(next.id);
        i++; // Skip the status change entry as it's grouped
      } else {
        grouped.push({
          entries: [current],
          timestamp: current.created,
          changedBy: current.changedBy,
        });
        processed.add(current.id);
      }
    }
    return grouped;
  };

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
        console.error(
          "Error loading user lookup:",
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    loadUserLookup();
  }, []);

  const showToast = (msg: string, type: "success" | "error") => {
    if (type === "success") toast.success(msg);
    else toast.error(msg);
  };

  const fetchLeads = useCallback(
    async (userId: string, selectedLeadId?: string) => {
      try {
        const pb = createPocketBaseClient();
        const token = pb.authStore.token;

        const response = await fetch("/api/counselor/leads", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(
            errorBody?.error ||
              `Failed to fetch leads: HTTP ${response.status}`,
          );
        }

        const records = (await response.json()) as LeadRecord[];

        const nextLeads = records.map((lead) => ({
          id: lead.id,
          leadId: lead.leadId || "",
          name: lead.studentName || "",
          countryCode: lead.countryCode || "+92",
          mobile: lead.mobile || "",
          mobileWithCountry: lead.mobileWithCountry || "",
          email: lead.email || "",
          course: lead.course || lead.courseName || "",
          leadSource: lead.leadSource || "",
          leadSourceDetail: lead.leadSourceDetail || "",
          status: lead.status || "",
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
          const nextLead = nextLeads[safeIndex];
          setSelectedLead(nextLead);
          setStatusSelect(getDefaultModalStatus(nextLead.status));
        } else {
          setSelectedLead(null);
          setStatusSelect("");
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("aborted")) {
          // Request was cancelled, don't show error
        } else {
          console.error(
            "Error fetching leads:",
            error instanceof Error ? error.message : String(error),
          );
          showToast(
            error instanceof Error ? error.message : "Failed to load leads",
            "error",
          );
        }
      } finally {
        // No loading state needed here yet.
      }
    },
    [],
  );

  useEffect(() => {
    if (!counselorId || counselorId.trim() === "" || !isCounselor) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLeads(counselorId);
  }, [counselorId, fetchLeads, isCounselor]);

  const openLeadDetails = async (lead: Lead) => {
    setModalOpen(true);
    setTimelineOpen(false);
    setHistoryLoading(true);

    try {
      const pb = createPocketBaseClient();
      const latestLead = await pb.collection("leads").getOne(lead.id);
      const nextLead: Lead = {
        id: latestLead.id,
        leadId: latestLead.leadId || "",
        name: latestLead.studentName || "",
        countryCode: latestLead.countryCode || "+94",
        mobile: latestLead.mobile || "",
        mobileWithCountry: latestLead.mobileWithCountry || "",
        email: latestLead.email || "",
        course: latestLead.course || latestLead.courseName || "",
        leadSource: latestLead.leadSource || "",
        leadSourceDetail: latestLead.leadSourceDetail || "",
        status: latestLead.status || "",
        comments: latestLead.latestComment || "",
        created: latestLead.created || "",
        updated: latestLead.updated || latestLead.created || "",
        assignedTo: latestLead.assignedTo || "",
      };

      setSelectedLead(nextLead);
      setStatusSelect(getDefaultModalStatus(nextLead.status));
      const history = (await pb.collection("leadHistory").getFullList({
        filter: `leadId = "${lead.id}"`,
        sort: "-created",
        expand: "leadId,studentName,changedBy",
      })) as HistoryRecord[];

      const mappedHistory = history.map((entry) => ({
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
        commentText:
          entry.oldValue ||
          entry.newValue ||
          entry.expand?.leadId?.latestComment ||
          "",
        created: entry.created || "",
      }));

      setLeadHistory(mappedHistory);
    } catch (error) {
      console.error(
        "Error loading history:",
        error instanceof Error ? error.message : String(error),
      );
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

    // If in a terminal state, disallow any updates (server also enforces)
    if (
      selectedLead.status === "Registered" ||
      selectedLead.status === "Lost"
    ) {
      showToast("Cannot update a Registered or Lost lead", "error");
      return;
    }

    if (statusSelect === selectedLead.status && !trimmedComment) {
      showToast("Change the status or add a comment", "error");
      return;
    }

    // Client-side enforcement: first change from New must be to Contacted
    if (
      selectedLead.status === "New" &&
      statusSelect !== selectedLead.status &&
      statusSelect !== "Contacted"
    ) {
      showToast("First status change from New must be to Contacted", "error");
      return;
    }

    // Validate that the selected status is allowed (can't go backward)
    if (!validNextStatuses.includes(statusSelect)) {
      showToast("You cannot change to a previous status", "error");
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
        setTablePage(1);
        setStatusFilter(null);
        if (result.updatedStatus) {
          setStatusSelect(result.updatedStatus);
        }
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
    const trimmedMobile = newMobile.trim().replace(/^0+/, "");
    const trimmedCourse = newCourse.trim();
    const trimmedEmail = newEmail.trim();
    const trimmedLeadSourceDetail = newLeadSourceDetail.trim();

    if (!counselorId) {
      showToast("Missing counselor identity", "error");
      return;
    }

    if (!trimmedName || !trimmedMobile || !trimmedCourse || !newCountryCode) {
      showToast("Name, country code, mobile, and course are required", "error");
      return;
    }

    if (shouldShowLeadSourceDetail(newLeadSource) && !trimmedLeadSourceDetail) {
      showToast(
        "Please enter who referred the lead or the source details",
        "error",
      );
      return;
    }

    try {
      setIsUpdating(true);
      const response = await fetch("/api/counselor/add-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: trimmedName,
          countryCode: newCountryCode,
          mobile: trimmedMobile,
          email: trimmedEmail || undefined,
          course: trimmedCourse,
          leadSource: newLeadSource,
          leadSourceDetail: shouldShowLeadSourceDetail(newLeadSource)
            ? trimmedLeadSourceDetail
            : undefined,
          counselorName,
          counselorId,
        }),
      });

      const result = await response.json();

      // If a duplicate is detected, do not create a new lead for counsellors.
      if (result?.duplicateDetected) {
        const existing = result.existingLead || {};
        setDuplicateInfo({
          leadId: existing.leadId || "",
          studentName: existing.studentName || "",
          mobile: existing.mobile || existing.mobileWithCountry || "",
          status: existing.status || "",
          assigneeName: existing.assigneeName || existing.assignedTo || "",
        });
        setDuplicateWarningOpen(true);
      } else if (response.ok && result.success) {
        showToast("Lead created successfully!", "success");
        setNewName("");
        setNewCountryCode("+94");
        setNewMobile("");
        setNewEmail("");
        setNewCourse("");
        setNewLeadSource("Direct");
        setNewLeadSourceDetail("");
        setAddLeadModalOpen(false);
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

  // Filter leads by status if a status filter is selected
  const [searchTerm, setSearchTerm] = useState("");

  const filteredLeads = (
    statusFilter ? leads.filter((lead) => lead.status === statusFilter) : leads
  ).filter((lead) => {
    if (!searchTerm || searchTerm.trim() === "") return true;
    const q = searchTerm.toLowerCase();
    return (
      (lead.name || "").toLowerCase().includes(q) ||
      (lead.mobile || "").toLowerCase().includes(q) ||
      (lead.email || "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const currentPage = Math.min(tablePage, totalPages);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const showAnimatedEmptyState = filteredLeads.length === 0;

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        setShowNoLeadsText(showAnimatedEmptyState);
      },
      showAnimatedEmptyState ? 2500 : 0,
    );

    return () => window.clearTimeout(timer);
  }, [showAnimatedEmptyState]);

  const validNextStatuses = selectedLead
    ? getValidNextStatuses(selectedLead.status)
    : statusFlow;

  // Deduplicate statuses to ensure unique keys when rendering options
  const dedupedValidNextStatuses = Array.from(new Set(validNextStatuses));

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-white px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="h-14 rounded-lg bg-slate-100 animate-pulse" />
          <div className="grid grid-cols-1 gap-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-lg bg-slate-100 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isCounselor) {
    return (
      <div className="min-h-screen bg-white px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="h-14 rounded-lg bg-slate-100 animate-pulse" />
          <div className="grid grid-cols-1 gap-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-lg bg-slate-100 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isCounselor) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              Amazon College
            </h1>
            <p className="text-sm text-slate-500" suppressHydrationWarning>
              {counselorName}
            </p>
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
      </header>

      <button
        onClick={() => setAddLeadModalOpen(true)}
        className="fixed bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/25 transition hover:bg-teal-700 md:hidden"
      >
        + Add Lead
      </button>

      <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="space-y-4">
          {/* Status Filter Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
            <button
              onClick={() => setStatusFilter(null)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                statusFilter === null
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              All ({leads.length})
            </button>
            {statusFlow.map((status) => {
              const count = leads.filter((l) => l.status === status).length;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    statusFilter === status
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {status} ({count})
                </button>
              );
            })}
          </div>

          {/* Search box + desktop add button */}
          <div className="mt-3 flex items-center gap-3">
            <input
              type="text"
              placeholder="Search name, mobile, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
            <button
              onClick={() => setAddLeadModalOpen(true)}
              className="hidden rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 md:inline-flex"
            >
              + Add Lead
            </button>
          </div>

          {filteredLeads.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-10 shadow-sm">
              <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-3 text-slate-500">
                {showNoLeadsText ? (
                  <p className="text-sm font-medium text-slate-500">
                    No leads found
                  </p>
                ) : (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.2s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.1s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400" />
                    </div>
                  </>
                )}
              </div>
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
                          {formatPhoneNumber(
                            lead.mobileWithCountry ||
                              `${lead.countryCode}-${lead.mobile}`,
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {lead.course}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(lead.status)}`}
                          >
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
                  {Math.min(currentPage * PAGE_SIZE, filteredLeads.length)} of{" "}
                  {filteredLeads.length}
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
      </main>

      {addLeadModalVisible && (
        <div
          className={`fixed inset-0 z-30 flex items-end justify-center bg-black/50 px-0 transition-opacity duration-200 ease-out sm:items-center sm:px-4 ${
            addLeadModalOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setAddLeadModalOpen(false)}
        >
          <div
            className={`w-full max-w-2xl rounded-t-2xl bg-white shadow-2xl transition-all duration-200 ease-out sm:rounded-2xl ${
              addLeadModalOpen
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-3 scale-95 opacity-0"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Create lead
                </p>
                <h2 className="text-lg font-semibold text-slate-900">
                  Add New Lead
                </h2>
              </div>
              <button
                onClick={() => setAddLeadModalOpen(false)}
                className="rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Close add lead modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto px-4 py-4 sm:px-6">
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
                    Country Code*
                  </label>
                  <select
                    value={newCountryCode}
                    onChange={(e) => setNewCountryCode(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="+94">+94 (Sri Lanka)</option>
                    <option value="+1">+1 (US/Canada)</option>
                    <option value="+7">+7 (Russia)</option>
                    <option value="+20">+20 (Egypt)</option>
                    <option value="+27">+27 (South Africa)</option>
                    <option value="+30">+30 (Greece)</option>
                    <option value="+31">+31 (Netherlands)</option>
                    <option value="+32">+32 (Belgium)</option>
                    <option value="+33">+33 (France)</option>
                    <option value="+34">+34 (Spain)</option>
                    <option value="+36">+36 (Hungary)</option>
                    <option value="+39">+39 (Italy)</option>
                    <option value="+40">+40 (Romania)</option>
                    <option value="+41">+41 (Switzerland)</option>
                    <option value="+43">+43 (Austria)</option>
                    <option value="+44">+44 (UK/Ireland)</option>
                    <option value="+45">+45 (Denmark)</option>
                    <option value="+46">+46 (Sweden)</option>
                    <option value="+47">+47 (Norway)</option>
                    <option value="+48">+48 (Poland)</option>
                    <option value="+49">+49 (Germany)</option>
                    <option value="+51">+51 (Peru)</option>
                    <option value="+52">+52 (Mexico)</option>
                    <option value="+53">+53 (Cuba)</option>
                    <option value="+54">+54 (Argentina)</option>
                    <option value="+55">+55 (Brazil)</option>
                    <option value="+56">+56 (Chile)</option>
                    <option value="+57">+57 (Colombia)</option>
                    <option value="+58">+58 (Venezuela)</option>
                    <option value="+60">+60 (Malaysia)</option>
                    <option value="+61">+61 (Australia)</option>
                    <option value="+62">+62 (Indonesia)</option>
                    <option value="+63">+63 (Philippines)</option>
                    <option value="+64">+64 (New Zealand)</option>
                    <option value="+65">+65 (Singapore)</option>
                    <option value="+66">+66 (Thailand)</option>
                    <option value="+81">+81 (Japan)</option>
                    <option value="+82">+82 (South Korea)</option>
                    <option value="+84">+84 (Vietnam)</option>
                    <option value="+86">+86 (China)</option>
                    <option value="+90">+90 (Turkey)</option>
                    <option value="+91">+91 (India)</option>
                    <option value="+92">+92 (Pakistan)</option>
                    <option value="+93">+93 (Afghanistan)</option>
                    <option value="+95">+95 (Myanmar)</option>
                    <option value="+98">+98 (Iran)</option>
                    <option value="+212">+212 (Morocco)</option>
                    <option value="+213">+213 (Algeria)</option>
                    <option value="+216">+216 (Tunisia)</option>
                    <option value="+218">+218 (Libya)</option>
                    <option value="+220">+220 (Gambia)</option>
                    <option value="+221">+221 (Senegal)</option>
                    <option value="+222">+222 (Mauritania)</option>
                    <option value="+223">+223 (Mali)</option>
                    <option value="+224">+224 (Guinea)</option>
                    <option value="+225">+225 (Ivory Coast)</option>
                    <option value="+226">+226 (Burkina Faso)</option>
                    <option value="+227">+227 (Niger)</option>
                    <option value="+228">+228 (Togo)</option>
                    <option value="+229">+229 (Benin)</option>
                    <option value="+230">+230 (Mauritius)</option>
                    <option value="+231">+231 (Liberia)</option>
                    <option value="+232">+232 (Sierra Leone)</option>
                    <option value="+233">+233 (Ghana)</option>
                    <option value="+234">+234 (Nigeria)</option>
                    <option value="+235">+235 (Chad)</option>
                    <option value="+236">
                      +236 (Central African Republic)
                    </option>
                    <option value="+237">+237 (Cameroon)</option>
                    <option value="+238">+238 (Cape Verde)</option>
                    <option value="+239">+239 (Sao Tome)</option>
                    <option value="+240">+240 (Equatorial Guinea)</option>
                    <option value="+241">+241 (Gabon)</option>
                    <option value="+242">+242 (Republic of Congo)</option>
                    <option value="+243">
                      +243 (Democratic Republic of Congo)
                    </option>
                    <option value="+244">+244 (Angola)</option>
                    <option value="+245">+245 (Guinea-Bissau)</option>
                    <option value="+246">+246 (Diego Garcia)</option>
                    <option value="+248">+248 (Seychelles)</option>
                    <option value="+249">+249 (Sudan)</option>
                    <option value="+250">+250 (Rwanda)</option>
                    <option value="+251">+251 (Ethiopia)</option>
                    <option value="+252">+252 (Somalia)</option>
                    <option value="+253">+253 (Djibouti)</option>
                    <option value="+254">+254 (Kenya)</option>
                    <option value="+255">+255 (Tanzania)</option>
                    <option value="+256">+256 (Uganda)</option>
                    <option value="+257">+257 (Burundi)</option>
                    <option value="+258">+258 (Mozambique)</option>
                    <option value="+260">+260 (Zambia)</option>
                    <option value="+261">+261 (Madagascar)</option>
                    <option value="+262">+262 (Reunion)</option>
                    <option value="+263">+263 (Zimbabwe)</option>
                    <option value="+264">+264 (Namibia)</option>
                    <option value="+265">+265 (Malawi)</option>
                    <option value="+266">+266 (Lesotho)</option>
                    <option value="+267">+267 (Botswana)</option>
                    <option value="+268">+268 (Eswatini)</option>
                    <option value="+269">+269 (Comoros)</option>
                    <option value="+290">+290 (Saint Helena)</option>
                    <option value="+291">+291 (Eritrea)</option>
                    <option value="+297">+297 (Aruba)</option>
                    <option value="+298">+298 (Faroe Islands)</option>
                    <option value="+299">+299 (Greenland)</option>
                    <option value="+350">+350 (Gibraltar)</option>
                    <option value="+351">+351 (Portugal)</option>
                    <option value="+352">+352 (Luxembourg)</option>
                    <option value="+353">+353 (Ireland)</option>
                    <option value="+354">+354 (Iceland)</option>
                    <option value="+355">+355 (Albania)</option>
                    <option value="+356">+356 (Malta)</option>
                    <option value="+357">+357 (Cyprus)</option>
                    <option value="+358">+358 (Finland)</option>
                    <option value="+359">+359 (Bulgaria)</option>
                    <option value="+370">+370 (Lithuania)</option>
                    <option value="+371">+371 (Latvia)</option>
                    <option value="+372">+372 (Estonia)</option>
                    <option value="+373">+373 (Moldova)</option>
                    <option value="+374">+374 (Armenia)</option>
                    <option value="+375">+375 (Belarus)</option>
                    <option value="+376">+376 (Andorra)</option>
                    <option value="+377">+377 (Monaco)</option>
                    <option value="+378">+378 (San Marino)</option>
                    <option value="+380">+380 (Ukraine)</option>
                    <option value="+381">+381 (Serbia)</option>
                    <option value="+382">+382 (Montenegro)</option>
                    <option value="+383">+383 (Kosovo)</option>
                    <option value="+385">+385 (Croatia)</option>
                    <option value="+386">+386 (Slovenia)</option>
                    <option value="+387">+387 (Bosnia)</option>
                    <option value="+389">+389 (North Macedonia)</option>
                    <option value="+420">+420 (Czech Republic)</option>
                    <option value="+421">+421 (Slovakia)</option>
                    <option value="+423">+423 (Liechtenstein)</option>
                    <option value="+500">+500 (Falkland Islands)</option>
                    <option value="+501">+501 (Belize)</option>
                    <option value="+502">+502 (Guatemala)</option>
                    <option value="+503">+503 (El Salvador)</option>
                    <option value="+504">+504 (Honduras)</option>
                    <option value="+505">+505 (Nicaragua)</option>
                    <option value="+506">+506 (Costa Rica)</option>
                    <option value="+507">+507 (Panama)</option>
                    <option value="+508">+508 (Saint Pierre)</option>
                    <option value="+509">+509 (Haiti)</option>
                    <option value="+590">+590 (Guadeloupe)</option>
                    <option value="+591">+591 (Bolivia)</option>
                    <option value="+592">+592 (Guyana)</option>
                    <option value="+593">+593 (Ecuador)</option>
                    <option value="+594">+594 (French Guiana)</option>
                    <option value="+595">+595 (Paraguay)</option>
                    <option value="+596">+596 (Martinique)</option>
                    <option value="+597">+597 (Suriname)</option>
                    <option value="+598">+598 (Uruguay)</option>
                    <option value="+599">+599 (Netherlands Antilles)</option>
                    <option value="+670">+670 (East Timor)</option>
                    <option value="+672">+672 (Norfolk Island)</option>
                    <option value="+673">+673 (Brunei)</option>
                    <option value="+674">+674 (Nauru)</option>
                    <option value="+675">+675 (Papua New Guinea)</option>
                    <option value="+676">+676 (Tonga)</option>
                    <option value="+677">+677 (Solomon Islands)</option>
                    <option value="+678">+678 (Vanuatu)</option>
                    <option value="+679">+679 (Fiji)</option>
                    <option value="+680">+680 (Palau)</option>
                    <option value="+681">+681 (Wallis Futuna)</option>
                    <option value="+682">+682 (Cook Islands)</option>
                    <option value="+683">+683 (Niue)</option>
                    <option value="+684">+684 (American Samoa)</option>
                    <option value="+685">+685 (Samoa)</option>
                    <option value="+686">+686 (Kiribati)</option>
                    <option value="+687">+687 (New Caledonia)</option>
                    <option value="+688">+688 (Tuvalu)</option>
                    <option value="+689">+689 (French Polynesia)</option>
                    <option value="+690">+690 (Tokelau)</option>
                    <option value="+691">+691 (Micronesia)</option>
                    <option value="+692">+692 (Marshall Islands)</option>
                    <option value="+850">+850 (North Korea)</option>
                    <option value="+852">+852 (Hong Kong)</option>
                    <option value="+853">+853 (Macau)</option>
                    <option value="+855">+855 (Cambodia)</option>
                    <option value="+856">+856 (Laos)</option>
                    <option value="+880">+880 (Bangladesh)</option>
                    <option value="+886">+886 (Taiwan)</option>
                    <option value="+960">+960 (Maldives)</option>
                    <option value="+961">+961 (Lebanon)</option>
                    <option value="+962">+962 (Jordan)</option>
                    <option value="+963">+963 (Syria)</option>
                    <option value="+964">+964 (Iraq)</option>
                    <option value="+965">+965 (Kuwait)</option>
                    <option value="+966">+966 (Saudi Arabia)</option>
                    <option value="+967">+967 (Yemen)</option>
                    <option value="+968">+968 (Oman)</option>
                    <option value="+970">+970 (Palestine)</option>
                    <option value="+971">+971 (UAE)</option>
                    <option value="+972">+972 (Israel)</option>
                    <option value="+973">+973 (Bahrain)</option>
                    <option value="+974">+974 (Qatar)</option>
                    <option value="+975">+975 (Bhutan)</option>
                    <option value="+976">+976 (Mongolia)</option>
                    <option value="+977">+977 (Nepal)</option>
                    <option value="+992">+992 (Tajikistan)</option>
                    <option value="+993">+993 (Turkmenistan)</option>
                    <option value="+994">+994 (Azerbaijan)</option>
                    <option value="+995">+995 (Georgia)</option>
                    <option value="+996">+996 (Kyrgyzstan)</option>
                    <option value="+998">+998 (Uzbekistan)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Mobile No*
                  </label>
                  <input
                    type="tel"
                    placeholder="3001234567"
                    value={newMobile}
                    onChange={(e) => {
                      const value = e.target.value.replace(/^0+/, "") || "";
                      setNewMobile(value);
                    }}
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
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setNewLeadSource(nextValue);
                      if (!shouldShowLeadSourceDetail(nextValue)) {
                        setNewLeadSourceDetail("");
                      }
                    }}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="">Select lead source</option>
                    {LEAD_SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {shouldShowLeadSourceDetail(newLeadSource) && (
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-slate-700">
                      {getLeadSourceDetailLabel(newLeadSource)}
                    </label>
                    <input
                      type="text"
                      placeholder="Enter who referred the lead or where it came from"
                      value={newLeadSourceDetail}
                      onChange={(e) => setNewLeadSourceDetail(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <button
                    onClick={handleAddLead}
                    disabled={isUpdating}
                    className="w-full rounded-md bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUpdating ? "Creating..." : "Create New Lead"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalVisible && selectedLead && (
        <div
          className={`fixed inset-0 z-20 flex items-end justify-center bg-black/50 px-0 transition-opacity duration-200 ease-out sm:items-center sm:px-4 ${
            modalOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setModalOpen(false)}
        >
          <div
            className={`flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl transition-all duration-200 ease-out sm:rounded-2xl ${
              modalOpen
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-3 scale-95 opacity-0"
            }`}
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
                    {formatPhoneNumber(
                      selectedLead.mobileWithCountry ||
                        `${selectedLead.countryCode}-${selectedLead.mobile}`,
                    )}
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
                  <div
                    className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(selectedLead.status)}`}
                  >
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
                {selectedLead.leadSource && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Lead Source
                    </div>
                    <div className="mt-1 font-medium text-slate-900">
                      {selectedLead.leadSource}
                    </div>
                    {selectedLead.leadSourceDetail && (
                      <p className="text-xs text-slate-500 mt-1">
                        {selectedLead.leadSourceDetail}
                      </p>
                    )}
                  </div>
                )}
                {(selectedLead.mobileWithCountry ||
                  selectedLead.countryCode ||
                  selectedLead.mobile) && (
                  <button
                    onClick={() =>
                      window.open(
                        `https://wa.me/${formatPhoneNumber(
                          selectedLead.mobileWithCountry ||
                            `${selectedLead.countryCode}-${selectedLead.mobile}`,
                        ).replace(/\D/g, "")}?text=${encodeURIComponent(
                          `Hello, I'm ${counselorName} from Amazon College. I'm reaching out regarding your inquiry about ${selectedLead.course}. How may I assist you today?`,
                        )}`,
                        "_blank",
                      )
                    }
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    <MessageSquare className="w-4 h-4" />
                    WhatsApp
                  </button>
                )}
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
                        disabled={
                          !validNextStatuses || validNextStatuses.length === 0
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                      >
                        {dedupedValidNextStatuses.length > 0 ? (
                          dedupedValidNextStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>
                            No updates available
                          </option>
                        )}
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
                        disabled={
                          isUpdating ||
                          (selectedLead &&
                            (selectedLead.status === "Registered" ||
                              selectedLead.status === "Lost"))
                        }
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
                        groupHistoryEntries(leadHistory).map((group) => (
                          <div
                            key={group.entries[0].id}
                            className="relative pl-5"
                          >
                            <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-slate-900" />
                            <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-700">
                                  {group.entries.length > 1
                                    ? "Status Change + Comment"
                                    : group.entries[0].eventType}
                                </span>
                                <span>
                                  {new Date(group.timestamp).toLocaleString()}
                                </span>
                                <span>
                                  By{" "}
                                  {userLookup[group.changedBy] ||
                                    group.changedBy}
                                </span>
                              </div>

                              {/* Status Change part */}
                              {group.entries[0].eventType ===
                                "Status Change" && (
                                <div className="text-sm font-medium text-slate-700">
                                  {group.entries[0].oldValue
                                    ? `${group.entries[0].oldValue} `
                                    : ""}
                                  {group.entries[0].oldValue &&
                                  group.entries[0].newValue
                                    ? "→ "
                                    : ""}
                                  {group.entries[0].newValue || ""}
                                </div>
                              )}

                              {/* Comment part - from either Status Change or standalone Comment entry */}
                              {group.entries.length > 1 &&
                              group.entries[1].eventType === "Comment" &&
                              group.entries[1].commentText ? (
                                <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                    Comment entered
                                  </div>
                                  <p className="mt-1 whitespace-pre-wrap">
                                    {group.entries[1].commentText}
                                  </p>
                                </div>
                              ) : group.entries[0].eventType === "Comment" &&
                                group.entries[0].commentText ? (
                                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                    Comment entered
                                  </div>
                                  <p className="mt-1 whitespace-pre-wrap">
                                    {group.entries[0].commentText}
                                  </p>
                                </div>
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

      {duplicateWarningVisible && duplicateInfo && (
        <div
          className={`fixed inset-0 z-40 flex items-end justify-center bg-black/50 px-0 transition-opacity duration-200 ease-out sm:items-center sm:px-4 ${
            duplicateWarningOpen
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={() => setDuplicateWarningOpen(false)}
        >
          <div
            className={`w-full max-w-md rounded-t-2xl bg-white shadow-2xl transition-all duration-200 ease-out sm:rounded-2xl ${
              duplicateWarningOpen
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-3 scale-95 opacity-0"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Lead already exists
                </p>
                <h2 className="text-lg font-semibold text-slate-900">
                  Duplicate Lead Found
                </h2>
              </div>
              <button
                onClick={() => setDuplicateWarningOpen(false)}
                className="rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Close duplicate warning"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4 py-6 sm:px-6">
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-900">
                    ⚠️ A lead with this mobile number ({newCountryCode}-
                    {newMobile}) already exists.
                  </p>
                </div>

                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Lead ID
                    </div>
                    <div className="mt-1 font-mono font-medium text-slate-900">
                      {duplicateInfo.leadId}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Student Name
                    </div>
                    <div className="mt-1 font-medium text-slate-900">
                      {duplicateInfo.studentName}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Current Status
                    </div>
                    <div
                      className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(duplicateInfo.status)}`}
                    >
                      {duplicateInfo.status}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Assigned To
                    </div>
                    <div className="mt-1 font-medium text-slate-900">
                      {duplicateInfo.assigneeName}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-slate-600">
                    Would you like to continue anyway?
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => setDuplicateWarningOpen(false)}
                      className="flex-1 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        // Clear duplicate info and allow user to edit form
                        setDuplicateWarningOpen(false);
                        setDuplicateInfo(null);
                      }}
                      className="flex-1 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Back to Form
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
