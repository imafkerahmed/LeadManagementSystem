"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  X,
  Trash2,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { createPocketBaseClient } from "@/lib/pocketbase";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Lead {
  id: string;
  leadId: string;
  studentName: string;
  mobile: string;
  email: string;
  course: string;
  leadSource: string;
  status: string;
  assignedTo: string;
  assignedToId: string;
  comments: string;
}

interface TimelineEntry {
  id: string;
  eventType: string;
  changedBy: string;
  comment?: string;
  oldValue?: string;
  newValue?: string;
  created: string;
}

type LeadRecord = {
  id: string;
  leadId?: string;
  studentName?: string;
  mobile?: string;
  mobileNo?: string;
  email?: string;
  course?: string;
  courseName?: string;
  leadSource?: string;
  status?: string;
  leadStatus?: string;
  assignedTo?: string;
  latestComment?: string;
  expand?: {
    assignedTo?: {
      id?: string;
      name?: string;
      email?: string;
    };
  };
};

type HistoryRecord = {
  id: string;
  eventType?: string;
  changedBy?: string;
  comment?: string;
  oldValue?: string;
  newValue?: string;
  created?: string;
  expand?: {
    changedBy?: {
      name?: string;
      email?: string;
    };
  };
};

type CreateLeadPayload = {
  studentName: string;
  mobile: string;
  email?: string;
  course: string;
  leadSource?: string;
  assignee?: string;
};

type UserLookupRecord = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  accountStatus?: string;
  active?: boolean;
};

const PAGE_SIZE = 10;

function parseLeadSequence(leadId?: string): number {
  if (!leadId) return 0;
  const match = leadId.match(/AMZ\/LEAD\/(\d+)/i);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}

function formatLeadId(sequence: number): string {
  return `AMZ/LEAD/${String(sequence).padStart(4, "0")}`;
}

export default function AdminLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [counselorFilter, setCounselorFilter] = useState("");
  const [counselors, setCounselors] = useState<string[]>([]);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<"view" | "new">("view");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftAssignedToId, setDraftAssignedToId] = useState("");
  const [draftComment, setDraftComment] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftMobile, setDraftMobile] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftCourse, setDraftCourse] = useState("");
  const [draftLeadSource, setDraftLeadSource] = useState("");
  const [usersLookup, setUsersLookup] = useState<
    Array<{ id: string; name: string; role?: string }>
  >([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false);
  const [deleteConfirmLeadId, setDeleteConfirmLeadId] = useState<string | null>(
    null,
  );

  const mapLead = (record: LeadRecord): Lead => {
    const rawAssignedTo = (record.assignedTo || "").trim();
    const lookupById = usersLookup.find((user) => user.id === rawAssignedTo);
    const lookupByName = usersLookup.find(
      (user) => (user.name || "").toLowerCase() === rawAssignedTo.toLowerCase(),
    );
    const assignedName =
      record.expand?.assignedTo?.name ||
      record.expand?.assignedTo?.email ||
      lookupById?.name ||
      lookupByName?.name ||
      rawAssignedTo ||
      "Unassigned";

    const assignedRole =
      (record.expand?.assignedTo as any)?.role ||
      lookupById?.role ||
      lookupByName?.role ||
      "";

    return {
      id: record.id,
      leadId: record.leadId || "",
      studentName: record.studentName || "",
      mobile: record.mobileNo || record.mobile || "",
      email: record.email || "",
      course: record.courseName || record.course || "",
      leadSource: record.leadSource || "",
      status: record.leadStatus || record.status || "",
      assignedTo: assignedName + (assignedRole ? ` — ${assignedRole}` : ""),
      assignedToId:
        record.expand?.assignedTo?.id ||
        lookupById?.id ||
        lookupByName?.id ||
        rawAssignedTo ||
        "",
      comments: record.latestComment || "",
    };
  };

  const syncDraftFromLead = (lead: Lead | null) => {
    if (!lead) {
      setDraftStatus("");
      setDraftAssignedToId("");
      setDraftComment("");
      setDraftName("");
      setDraftMobile("");
      setDraftEmail("");
      setDraftCourse("");
      setDraftLeadSource("");
      return;
    }

    setDraftStatus(lead.status);
    setDraftAssignedToId(lead.assignedToId);
    setDraftComment(lead.comments);
    setDraftName(lead.studentName);
    setDraftMobile(lead.mobile);
    setDraftEmail(lead.email);
    setDraftCourse(lead.course);
    setDraftLeadSource(lead.leadSource);
  };

  useEffect(() => {
    const loadUsers = async () => {
      const normalizeRole = (role?: string) =>
        (role || "")
          .toLowerCase()
          .replace(/[_\s]+/g, "-")
          .trim();

      const isAssignableCounselor = (user: UserLookupRecord) => {
        const accountStatus = (user.accountStatus || "").toLowerCase();
        return accountStatus === "enabled" || accountStatus === "active";
      };

      try {
        const [resUsers, resAdmins, resAuthUsers] = await Promise.all([
          fetch("/api/users/lookup"),
          fetch("/api/admins/lookup"),
          fetch("/api/auth-users/lookup"),
        ]);

        let combined: any[] = [];
        if (resUsers.ok) {
          const u = await resUsers.json();
          if (Array.isArray(u)) combined = combined.concat(u);
        }
        if (resAdmins && resAdmins.ok) {
          const a = await resAdmins.json();
          if (Array.isArray(a))
            combined = combined.concat(
              a.map((ad: any) => ({
                id: ad.id,
                name: ad.name,
                email: ad.email,
                role: "admin",
              })),
            );
        }

        if (resAuthUsers && resAuthUsers.ok) {
          const au = await resAuthUsers.json();
          if (Array.isArray(au)) combined = combined.concat(au);
        }

        if (combined.length > 0) {
          setUsersLookup(combined);
          return;
        }
      } catch (e) {
        if (
          !(e instanceof Error && e.message.toLowerCase().includes("aborted"))
        ) {
          console.error("Failed to load users lookup", e);
        }
      }

      // Fallback: query PocketBase directly using the current logged-in auth.
      try {
        const pb = createPocketBaseClient();
        const users = (await pb.collection("users").getFullList({
          sort: "name",
          requestKey: null,
        })) as UserLookupRecord[];

        const counselors = users.filter(isAssignableCounselor).map((user) => ({
          id: user.id,
          name: user.name || user.email || user.id,
          role: user.role,
        }));

        setUsersLookup(counselors);
      } catch (fallbackError) {
        if (
          !(
            fallbackError instanceof Error &&
            fallbackError.message.toLowerCase().includes("aborted")
          )
        ) {
          console.error("Fallback users lookup failed", fallbackError);
        }
        setUsersLookup([]);
      }
    };

    loadUsers();
  }, []);

  const fetchLeads = useCallback(
    async (pageToLoad = 1) => {
      setIsLoading(true);
      try {
        const pb = createPocketBaseClient();
        const list = await pb
          .collection("leads")
          .getList(pageToLoad, PAGE_SIZE, {
            sort: "-created",
            expand: "assignedTo",
          });

        const rawItems = (list.items || []) as LeadRecord[];
        const items: Lead[] = rawItems.map((record) => mapLead(record));

        let next = items;
        if (statusFilter) next = next.filter((l) => l.status === statusFilter);
        if (counselorFilter)
          next = next.filter((l) => l.assignedTo === counselorFilter);
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          next = next.filter(
            (l) =>
              l.studentName.toLowerCase().includes(q) ||
              (l.mobile || "").toLowerCase().includes(q) ||
              (l.email || "").toLowerCase().includes(q),
          );
        }

        setLeads(items);
        setFilteredLeads(next);
        setTotalPages(
          Math.max(1, Math.ceil((list.totalItems || 0) / PAGE_SIZE)),
        );
        setPage(pageToLoad);

        const uniqueCounselors = [
          ...new Set(items.map((l) => l.assignedTo)),
        ].filter(Boolean);
        setCounselors(uniqueCounselors);
      } catch (error) {
        if (error instanceof Error && error.message.includes("aborted")) {
          // Request was cancelled, don't show error
          console.debug("Request cancelled");
        } else {
          console.error("Error fetching leads:", error);
          setLeads([]);
          setFilteredLeads([]);
          setTotalPages(1);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [statusFilter, counselorFilter, searchTerm],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLeads(page);
  }, [page, fetchLeads]);

  const openSidebarFor = async (
    lead: Lead | null,
    mode: "view" | "new" = "view",
  ) => {
    setSidebarMode(mode);
    setSelectedLead(lead);
    syncDraftFromLead(lead);
    setIsEditing(false);
    setTimelineOpen(false);
    setSidebarOpen(true);

    if (lead && mode === "view") {
      try {
        const pb = createPocketBaseClient();
        const latestLead = await pb.collection("leads").getOne(lead.id, {
          expand: "assignedTo",
        });
        const hydratedLead = mapLead(latestLead);
        setSelectedLead(hydratedLead);
        syncDraftFromLead(hydratedLead);

        // Use server endpoint to get lead history with resolved names
        const histRes = await fetch(`/api/lead-history?leadId=${lead.id}`);
        let history = [];
        if (histRes.ok) {
          history = await histRes.json();
        }

        setTimeline(
          (history as any[]).map((h) => ({
            id: h.id,
            eventType: h.eventType || "",
            changedBy: h.changedBy || "Unknown",
            comment: h.comment,
            oldValue: h.oldValue,
            newValue: h.newValue,
            created: h.created || "",
          })),
        );
      } catch (e) {
        console.error("Failed to load timeline", e);
        setTimeline([]);
      }
    } else {
      setTimeline([]);
    }
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
    setSelectedLead(null);
    setTimeline([]);
  };

  const handleDelete = (leadId: string) => {
    setDeleteConfirmLeadId(leadId);
    setDeleteConfirmDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmLeadId) return;
    try {
      const pb = createPocketBaseClient();
      await pb.collection("leads").delete(deleteConfirmLeadId);
      await fetchLeads(page);
      closeSidebar();
      toast.success("Lead deleted");
    } catch (e) {
      console.error("Delete failed", e);
      toast.error("Failed to delete lead");
    } finally {
      setDeleteConfirmDialogOpen(false);
      setDeleteConfirmLeadId(null);
    }
  };

  const handleLeadUpdate = async () => {
    if (!selectedLead) {
      return;
    }

    const nextStatus = draftStatus;
    const nextAssignedToId = draftAssignedToId;
    const nextComment = draftComment.trim();
    const nextName = draftName.trim();
    const nextMobile = draftMobile.trim();
    const nextEmail = draftEmail.trim();
    const nextCourse = draftCourse.trim();
    const nextLeadSource = draftLeadSource.trim();

    const statusChanged = nextStatus !== selectedLead.status;
    const assigneeChanged = nextAssignedToId !== selectedLead.assignedToId;
    const commentChanged = nextComment !== selectedLead.comments.trim();
    const nameChanged = nextName !== selectedLead.studentName;
    const mobileChanged = nextMobile !== selectedLead.mobile;
    const emailChanged = nextEmail !== selectedLead.email;
    const courseChanged = nextCourse !== selectedLead.course;
    const leadSourceChanged = nextLeadSource !== selectedLead.leadSource;

    if (
      !statusChanged &&
      !assigneeChanged &&
      !commentChanged &&
      !nameChanged &&
      !mobileChanged &&
      !emailChanged &&
      !courseChanged &&
      !leadSourceChanged
    ) {
      toast.error("No changes to update");
      return;
    }

    if (assigneeChanged && !nextAssignedToId) {
      toast.error("Please assign the lead to a counselor");
      return;
    }

    setIsSaving(true);
    try {
      const pb = createPocketBaseClient();
      const payload: Record<string, unknown> = {
        lastModified: new Date().toISOString(),
      };

      if (statusChanged) payload.leadStatus = nextStatus;
      if (statusChanged) payload.status = nextStatus;
      if (assigneeChanged) {
        payload.assignedTo = nextAssignedToId;
      }
      if (commentChanged) payload.latestComment = nextComment;
      if (commentChanged) payload.comments = nextComment;
      if (nameChanged) payload.studentName = nextName;
      if (mobileChanged) payload.mobileNo = nextMobile;
      if (mobileChanged) payload.mobile = nextMobile;
      if (emailChanged) payload.email = nextEmail;
      if (courseChanged) payload.courseName = nextCourse;
      if (courseChanged) payload.course = nextCourse;
      if (leadSourceChanged) payload.leadSource = nextLeadSource;

      await pb.collection("leads").update(selectedLead.id, payload);

      if (statusChanged) {
        await pb.collection("leadHistory").create({
          timeStamp: new Date().toISOString(),
          leadId: selectedLead.id,
          eventType: "Status Updated",
          changedBy: pb.authStore.model?.id || "",
          oldValue: selectedLead.status,
          newValue: nextStatus,
          comment: nextComment,
        });
      }

      if (assigneeChanged) {
        await pb.collection("leadHistory").create({
          timeStamp: new Date().toISOString(),
          leadId: selectedLead.id,
          eventType: "Assignee Changed",
          changedBy: pb.authStore.model?.id || "",
          oldValue: selectedLead.assignedTo,
          newValue:
            usersLookup.find((user) => user.id === nextAssignedToId)?.name ||
            nextAssignedToId ||
            "Unassigned",
        });
      }

      if (commentChanged && !statusChanged) {
        await pb.collection("leadHistory").create({
          timeStamp: new Date().toISOString(),
          leadId: selectedLead.id,
          eventType: "Comment Updated",
          changedBy: pb.authStore.model?.id || "",
          oldValue: selectedLead.comments,
          newValue: nextComment,
          comment: nextComment,
        });
      }

      if (
        nameChanged ||
        mobileChanged ||
        emailChanged ||
        courseChanged ||
        leadSourceChanged
      ) {
        await pb.collection("leadHistory").create({
          timeStamp: new Date().toISOString(),
          leadId: selectedLead.id,
          eventType: "Lead Details Updated",
          changedBy: pb.authStore.model?.id || "",
          comment:
            `Updated: ${nameChanged ? "Name, " : ""}${mobileChanged ? "Mobile, " : ""}${emailChanged ? "Email, " : ""}${courseChanged ? "Course, " : ""}${leadSourceChanged ? "Lead Source" : ""}`.replace(
              /, $/,
              "",
            ),
        });
      }

      await fetchLeads(page);
      const updated = await pb.collection("leads").getOne(selectedLead.id, {
        expand: "assignedTo",
      });
      const updatedLead = mapLead(updated);
      setSelectedLead(updatedLead);
      syncDraftFromLead(updatedLead);
      setIsEditing(false);
      await openSidebarFor(updatedLead, "view");
    } catch (e) {
      console.error("Lead update failed", e);
      toast.error("Failed to update lead");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateLead = async (payload: CreateLeadPayload) => {
    setIsSaving(true);
    try {
      const pb = createPocketBaseClient();
      const now = new Date().toISOString();

      const latestLead = await pb.collection("leads").getList(1, 1, {
        sort: "-created",
      });
      const latestLeadId = (
        latestLead.items?.[0] as { leadId?: string } | undefined
      )?.leadId;
      const nextLeadId = formatLeadId(parseLeadSequence(latestLeadId) + 1);
      const currentAdminId = (pb.authStore.model as { id?: string } | null)?.id;
      const assigneeValue =
        payload.assignee?.trim() || usersLookup[0]?.id || currentAdminId;
      if (!assigneeValue) {
        toast.error("No assignable user found. Please add a counselor first.");
        return;
      }

      const createPayload: Record<string, unknown> = {
        leadId: nextLeadId,
        studentName: payload.studentName,
        mobile: payload.mobile,
        mobileNo: payload.mobile,
        course: payload.course,
        courseName: payload.course,
        leadSource: payload.leadSource || "Manual",
        status: "New",
        leadStatus: "New",
        assignedTo: assigneeValue,
        comments: "Created manually",
        latestComment: "Created manually",
        addedDate: now,
        lastModified: now,
      };
      if (payload.email) createPayload.email = payload.email;
      const created = await pb.collection("leads").create(createPayload);
      await pb.collection("leadHistory").create({
        timeStamp: now,
        leadId: created.id,
        eventType: "Lead Created",
        changedBy: pb.authStore.model?.id || "",
        newValue: "New",
        comment: "Created manually",
      });
      await fetchLeads(1);
      setPage(1);
      setSidebarOpen(false);
      toast.success("Lead created");
    } catch (e) {
      console.error("Create failed", e);
      toast.error("Failed to create lead");
    } finally {
      setIsSaving(false);
    }
  };

  const statuses = ["New", "Contacted", "Follow-Up", "Registered", "Lost"];
  const statusColors: Record<string, string> = {
    New: "bg-blue-100 text-blue-800",
    Contacted: "bg-yellow-100 text-yellow-800",
    "Follow-Up": "bg-orange-100 text-orange-800",
    Registered: "bg-green-100 text-green-800",
    Lost: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6">
      {/* Top Bar with Search & New Button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Name, mobile, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => openSidebarFor(null, "new")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Lead
          </button>
        </div>

        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={counselorFilter}
            onChange={(e) => setCounselorFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Counselors</option>
            {counselors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading leads...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No leads found</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Mobile
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Course
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Assigned To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition"
                >
                  <td className="px-6 py-3 text-sm font-mono text-gray-600">
                    {lead.leadId}
                  </td>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">
                    {lead.studentName}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">
                    {lead.mobile}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">
                    {lead.course}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[lead.status]}`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">
                    {lead.assignedTo}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <button
                      onClick={() => openSidebarFor(lead, "view")}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Page {page} of {totalPages} ({leads.length} leads)
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sidebar Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeSidebar} />
          <div className="w-full max-w-md bg-white border-l border-gray-200 shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {sidebarMode === "new" ? "New Lead" : selectedLead?.studentName}
              </h2>
              <button
                onClick={closeSidebar}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {sidebarMode === "new" ? (
                <NewLeadForm
                  users={usersLookup}
                  onCreate={handleCreateLead}
                  saving={isSaving}
                  onCancel={closeSidebar}
                />
              ) : selectedLead ? (
                <>
                  {/* Details Section */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase">
                        Lead ID
                      </p>
                      <p className="font-mono text-sm font-medium">
                        {selectedLead.leadId}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase">
                        Name
                      </p>
                      {isEditing ? (
                        <input
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          disabled={isSaving}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                      ) : (
                        <p className="text-sm font-medium">
                          {selectedLead.studentName}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase">
                        Mobile
                      </p>
                      {isEditing ? (
                        <input
                          type="text"
                          value={draftMobile}
                          onChange={(e) => setDraftMobile(e.target.value)}
                          disabled={isSaving}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                      ) : (
                        <p className="text-sm">{selectedLead.mobile}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase">
                        Email
                      </p>
                      {isEditing ? (
                        <input
                          type="email"
                          value={draftEmail}
                          onChange={(e) => setDraftEmail(e.target.value)}
                          disabled={isSaving}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                      ) : (
                        <p className="text-sm">{selectedLead.email || "—"}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase">
                        Course
                      </p>
                      {isEditing ? (
                        <input
                          type="text"
                          value={draftCourse}
                          onChange={(e) => setDraftCourse(e.target.value)}
                          disabled={isSaving}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                      ) : (
                        <p className="text-sm">{selectedLead.course}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase">
                        Lead Source
                      </p>
                      {isEditing ? (
                        <select
                          value={draftLeadSource}
                          onChange={(e) => setDraftLeadSource(e.target.value)}
                          disabled={isSaving}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="">Select Lead Source</option>
                          <option value="Direct">Direct</option>
                          <option value="Referral">Referral</option>
                          <option value="Website">Website</option>
                          <option value="Social Media">Social Media</option>
                          <option value="Email">Email</option>
                          <option value="Phone">Phone</option>
                          <option value="Other">Other</option>
                        </select>
                      ) : (
                        <p className="text-sm">
                          {selectedLead.leadSource || "—"}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => {
                          setIsEditing((current) => !current);
                          syncDraftFromLead(selectedLead);
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                      >
                        {isEditing ? "Cancel Edit" : "Edit"}
                      </button>
                      <button
                        onClick={() => handleDelete(selectedLead.id)}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                          Status
                        </p>
                        <select
                          value={draftStatus}
                          onChange={(e) => setDraftStatus(e.target.value)}
                          disabled={!isEditing || isSaving}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-50"
                        >
                          {statuses.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                          Assigned To
                        </p>
                        <select
                          value={draftAssignedToId}
                          onChange={(e) => setDraftAssignedToId(e.target.value)}
                          disabled={!isEditing || isSaving}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-50"
                        >
                          <option value="" disabled>
                            Select counselor
                          </option>
                          {usersLookup.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                              {u.role ? ` — ${u.role}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                          Latest Comment
                        </p>
                        <textarea
                          value={draftComment}
                          onChange={(e) => setDraftComment(e.target.value)}
                          disabled={!isEditing || isSaving}
                          className="w-full min-h-24 px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-50"
                          placeholder="Add a note"
                        />
                      </div>

                      {isEditing && (
                        <button
                          onClick={handleLeadUpdate}
                          disabled={isSaving}
                          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
                        >
                          {isSaving ? "Updating..." : "Update"}
                        </button>
                      )}

                      <button
                        onClick={() =>
                          window.open(
                            `https://wa.me/${(selectedLead.mobile || "").replace(/\D/g, "")}?text=${encodeURIComponent("Hi " + selectedLead.studentName)}`,
                            "_blank",
                          )
                        }
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        <MessageSquare className="w-4 h-4" />
                        WhatsApp
                      </button>
                    </div>
                  </div>

                  <div className="border-t pt-4">
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
                        <div className="space-y-4 px-4 py-4 max-h-96 overflow-y-auto">
                          {timeline.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No events yet
                            </p>
                          ) : (
                            timeline.map((t) => (
                              <div key={t.id} className="relative pl-5">
                                <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-slate-900" />
                                <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                    <span className="font-medium text-slate-700">
                                      {t.eventType}
                                    </span>
                                    <span>
                                      {new Date(t.created).toLocaleString()}
                                    </span>
                                    <span>By {t.changedBy}</span>
                                  </div>
                                  {t.newValue && (
                                    <p className="text-sm text-slate-700">
                                      Changed to {t.newValue}
                                    </p>
                                  )}
                                  {t.comment && (
                                    <p className="text-sm text-slate-700">
                                      {t.comment}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={deleteConfirmDialogOpen}
        onOpenChange={setDeleteConfirmDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this lead? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NewLeadForm({
  users,
  onCreate,
  saving,
  onCancel,
}: {
  users: Array<{ id: string; name: string; role?: string }>;
  onCreate: (payload: CreateLeadPayload) => Promise<void>;
  saving: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [course, setCourse] = useState("");
  const [assignee, setAssignee] = useState("");

  useEffect(() => {
    if (!assignee && users.length > 0) {
      setAssignee(users[0].id);
    }
  }, [users, assignee]);

  const submit = () => {
    if (!name || !mobile || !course) {
      toast.error("Please fill required fields: Name, Mobile, Course");
      return;
    }
    onCreate({ studentName: name, mobile, email, course, assignee });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase">
          Name *
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Student name"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase">
          Mobile *
        </label>
        <input
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="Phone number"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase">
          Email
        </label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          type="email"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase">
          Course *
        </label>
        <input
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          placeholder="Course name"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase">
          Assign To
        </label>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Select counselor</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {u.role ? ` — ${u.role}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 pt-4">
        <button
          onClick={submit}
          disabled={saving}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          {saving ? "Creating..." : "Create Lead"}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
