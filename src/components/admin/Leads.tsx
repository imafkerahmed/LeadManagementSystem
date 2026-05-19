"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { type DateRange } from "react-day-picker";
import {
  Search,
  Plus,
  X,
  Trash2,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { createPocketBaseClient } from "@/lib/pocketbase";
import {
  LEAD_SOURCE_OPTIONS,
  getLeadSourceDetailLabel,
  shouldShowLeadSourceDetail,
} from "@/lib/lead-sources";
import { DatePickerWithRange } from "@/components/ui/date-picker-range";
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
  mobileWithCountry: string;
  countryCode: string;
  email: string;
  course: string;
  courseName?: string;
  leadSource: string;
  leadSourceDetail?: string;
  status: string;
  assignedTo: string;
  assignedToId: string;
  assignedToName?: string;
  comments: string;
  followup1Date?: string;
  followup1Completed?: boolean;
  followup2Date?: string;
  followup2Completed?: boolean;
  followup3Date?: string;
  followup3Completed?: boolean;
  created?: string;
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

interface TimelineGroup {
  id: string;
  entries: TimelineEntry[];
  timestamp: string;
  changedBy: string;
}

type LeadRecord = {
  id: string;
  leadId?: string;
  studentName?: string;
  mobile?: string;
  mobileNo?: string;
  mobileWithCountry?: string;
  countryCode?: string;
  email?: string;
  course?: string;
  courseName?: string;
  leadSource?: string;
  leadSourceDetail?: string;
  status?: string;
  leadStatus?: string;
  assignedTo?: string;
  assignedToName?: string;
  assignedToId?: string;
  latestComment?: string;
  followup1Date?: string;
  followup1Completed?: boolean;
  followup2Date?: string;
  followup2Completed?: boolean;
  followup3Date?: string;
  followup3Completed?: boolean;
  created?: string;
  expand?: {
    assignedTo?: {
      id?: string;
      name?: string;
      email?: string;
      role?: string;
    };
  };
};

// HistoryRecord type removed — use TimelineEntry for timeline items

type CreateLeadPayload = {
  studentName: string;
  mobile: string;
  email?: string;
  course: string;
  leadSource?: string;
  leadSourceDetail?: string;
  assignee?: string;
  countryCode?: string;
  mobileWithCountry?: string;
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

function uniqueUsersById(
  users: Array<{ id: string; name: string; role?: string }>,
) {
  const unique = new Map<string, { id: string; name: string; role?: string }>();

  for (const user of users) {
    if (!user.id || unique.has(user.id)) {
      continue;
    }
    unique.set(user.id, user);
  }

  return Array.from(unique.values());
}

function normalizePhone(value: string) {
  return value.replace(/[\s()-]/g, "").replace(/^0+/, "");
}

function splitPhoneParts(
  mobileWithCountry?: string,
  fallbackCountryCode = "+94",
) {
  const cleaned = (mobileWithCountry || "").trim();

  if (!cleaned) {
    return {
      countryCode: fallbackCountryCode,
      mobile: "",
      mobileWithCountry: "",
    };
  }

  const compact = cleaned.replace(/\s+/g, "");
  const match = compact.match(/^(\+\d{1,4})[- ]?(.*)$/);

  if (match) {
    const countryCode = match[1];
    const mobile = normalizePhone(match[2] || "");
    return {
      countryCode,
      mobile,
      mobileWithCountry: `${countryCode}${mobile}`,
    };
  }

  const mobile = normalizePhone(compact);
  return {
    countryCode: fallbackCountryCode,
    mobile,
    mobileWithCountry: `${fallbackCountryCode}${mobile}`,
  };
}

function normalizeLeadStatus(value: string | undefined): string {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "followup" || normalized === "follow-up") {
    return "Follow-up";
  }
  if (normalized === "new") return "New";
  if (normalized === "contacted") return "Contacted";
  if (normalized === "registered") return "Registered";
  if (normalized === "lost") return "Lost";
  return (value || "").trim();
}

function parseLeadSequence(leadId?: string): number {
  if (!leadId) return 0;
  const match = leadId.match(/AMZ\/LEAD\/(\d+)/i);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}

function formatLeadId(sequence: number): string {
  return `AMZ/LEAD/${String(sequence).padStart(4, "0")}`;
}

function toDateInputValue(value?: string): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
}

function dateStringToDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  return null;
}

function isDateInRange(
  dateStr: string | undefined,
  range: DateRange | undefined,
): boolean {
  if (!dateStr || !range) return false;

  const date = dateStringToDate(dateStr);
  if (!date || !range.from) return false;

  if (date < range.from) return false;
  if (range.to) {
    const endOfTo = new Date(range.to);
    endOfTo.setDate(endOfTo.getDate() + 1);
    if (date >= endOfTo) return false;
  }
  return true;
}

export default function AdminLeads() {
  const authModel = createPocketBaseClient().authStore.model as {
    name?: string;
    email?: string;
    role?: string;
  } | null;
  const currentUserName =
    authModel?.name || authModel?.email || "Amazon College Team";
  const isAdmin = authModel?.role === "admin";

  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNoLeadsText, setShowNoLeadsText] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [counselorFilter, setCounselorFilter] = useState("");
  const [dateFilterField, setDateFilterField] = useState("created"); // "nextFollowup" or "created"
  const [dateFilterRange, setDateFilterRange] = useState<
    DateRange | undefined
  >();
  const [counselors, setCounselors] = useState<
    Array<{ id: string; name: string; role?: string }>
  >([]);

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
  const [draftLeadSourceDetail, setDraftLeadSourceDetail] = useState("");
  const [followup1Date, setFollowup1Date] = useState("");
  const [followup1Completed, setFollowup1Completed] = useState(false);
  const [followup2Date, setFollowup2Date] = useState("");
  const [followup2Completed, setFollowup2Completed] = useState(false);
  const [followup3Date, setFollowup3Date] = useState("");
  const [followup3Completed, setFollowup3Completed] = useState(false);
  const [savingFollowup, setSavingFollowup] = useState<1 | 2 | 3 | null>(null);
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

  // AbortController for managing concurrent fetch requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const mapLead = useCallback(
    (record: LeadRecord): Lead => {
      const rawAssignedTo = (record.assignedTo || "").trim();
      const lookupById = usersLookup.find((user) => user.id === rawAssignedTo);
      const lookupByName = usersLookup.find(
        (user) =>
          (user.name || "").toLowerCase() === rawAssignedTo.toLowerCase(),
      );
      const assignedName =
        record.assignedToName ||
        record.expand?.assignedTo?.name ||
        record.expand?.assignedTo?.email ||
        lookupById?.name ||
        lookupByName?.name ||
        rawAssignedTo ||
        "Unassigned";

      const assignedRole =
        record.expand?.assignedTo?.role ||
        lookupById?.role ||
        lookupByName?.role ||
        "";

      return {
        id: record.id,
        leadId: record.leadId || "",
        studentName: record.studentName || "",
        mobile: splitPhoneParts(
          record.mobileWithCountry || record.mobile || record.mobileNo,
          record.countryCode || "+94",
        ).mobile,
        mobileWithCountry:
          record.mobileWithCountry ||
          splitPhoneParts(
            record.mobileWithCountry || record.mobile || record.mobileNo,
            record.countryCode || "+94",
          ).mobileWithCountry,
        countryCode:
          record.countryCode ||
          splitPhoneParts(
            record.mobileWithCountry || record.mobile || record.mobileNo,
            "+94",
          ).countryCode,
        email: record.email || "",
        course: record.course || record.courseName || "",
        courseName: record.courseName || record.course || "",
        leadSource: record.leadSource || "",
        leadSourceDetail: record.leadSourceDetail || "",
        status: normalizeLeadStatus(record.leadStatus || record.status || ""),
        assignedTo: assignedName + (assignedRole ? ` — ${assignedRole}` : ""),
        assignedToId:
          record.assignedToId ||
          record.expand?.assignedTo?.id ||
          lookupById?.id ||
          lookupByName?.id ||
          rawAssignedTo ||
          "",
        assignedToName: assignedName,
        comments: record.latestComment || "",
        followup1Date: record.followup1Date
          ? toDateInputValue(record.followup1Date)
          : "",
        followup1Completed: record.followup1Completed || false,
        followup2Date: record.followup2Date
          ? toDateInputValue(record.followup2Date)
          : "",
        followup2Completed: record.followup2Completed || false,
        followup3Date: record.followup3Date
          ? toDateInputValue(record.followup3Date)
          : "",
        followup3Completed: record.followup3Completed || false,
        created: record.created ? toDateInputValue(record.created) : "",
      };
    },
    [usersLookup],
  );

  const formatTimelineDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  };

  const normalizeTimelineEventType = (eventType: string) => {
    const value = (eventType || "").trim().toLowerCase();

    if (value.includes("status")) return "status change";
    if (value.includes("comment")) return "comment";
    if (value.includes("assignee")) return "assignee changed";
    if (value.includes("lead details")) return "lead details updated";
    if (value.includes("lead created")) return "lead created";

    return value;
  };

  const getTimelineComment = (entry: TimelineEntry) => {
    const comment = entry.comment?.trim();
    if (comment) {
      return comment;
    }

    const oldValue = entry.oldValue?.trim() || "";
    const newValue = entry.newValue?.trim() || "";

    if (normalizeTimelineEventType(entry.eventType) === "comment") {
      if (newValue && oldValue === newValue) return newValue;
      if (newValue && !oldValue) return newValue;
    }

    if (
      normalizeTimelineEventType(entry.eventType) === "lead details updated"
    ) {
      return newValue || oldValue;
    }

    return "";
  };

  const groupTimelineEntries = (entries: TimelineEntry[]): TimelineGroup[] => {
    const grouped: TimelineGroup[] = [];
    const processed = new Set<string>();

    const isWithinTimeWindow = (ts1: string, ts2: string) => {
      try {
        const date1 = new Date(ts1).getTime();
        const date2 = new Date(ts2).getTime();
        return Math.abs(date1 - date2) <= 2000;
      } catch {
        return false;
      }
    };

    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];
      if (processed.has(current.id)) continue;

      const next = entries[i + 1];
      const currentType = normalizeTimelineEventType(current.eventType);
      const nextType = next ? normalizeTimelineEventType(next.eventType) : "";

      if (
        next &&
        !processed.has(next.id) &&
        ((currentType === "status change" && nextType === "comment") ||
          (currentType === "comment" && nextType === "status change")) &&
        isWithinTimeWindow(current.created, next.created) &&
        current.changedBy === next.changedBy
      ) {
        const orderedEntries =
          currentType === "status change" ? [current, next] : [next, current];

        grouped.push({
          id: orderedEntries[0].id,
          entries: orderedEntries,
          timestamp: orderedEntries[0].created,
          changedBy: current.changedBy,
        });

        processed.add(current.id);
        processed.add(next.id);
        i++;
        continue;
      }

      grouped.push({
        id: current.id,
        entries: [current],
        timestamp: current.created,
        changedBy: current.changedBy,
      });
      processed.add(current.id);
    }

    return grouped;
  };

  const groupedTimeline = groupTimelineEntries(timeline);

  const getGroupTitle = (group: TimelineGroup) => {
    const primaryType = normalizeTimelineEventType(group.entries[0].eventType);
    const secondaryType =
      group.entries.length > 1
        ? normalizeTimelineEventType(group.entries[1].eventType)
        : "";

    if (primaryType === "status change" && secondaryType === "comment") {
      return "Status Change + Comment";
    }
    if (primaryType === "status change") return "Status Change";
    if (primaryType === "comment") return "Comment";
    if (primaryType === "assignee changed") return "Assignee Changed";
    if (primaryType === "lead details updated") return "Lead Details Updated";
    if (primaryType === "lead created") return "Lead Created";

    return group.entries[0].eventType || "Timeline Event";
  };

  const getEntryTransition = (entry: TimelineEntry) => {
    const resolveValue = (value?: string) => {
      const trimmedValue = value?.trim() || "";
      if (!trimmedValue) return "";

      const matchedUser = usersLookup.find(
        (user) =>
          user.id === trimmedValue ||
          (user.name || "").toLowerCase() === trimmedValue.toLowerCase(),
      );

      return matchedUser?.name || trimmedValue;
    };

    const oldValue = resolveValue(entry.oldValue);
    const newValue = resolveValue(entry.newValue);

    if (!oldValue && !newValue) {
      return "";
    }

    return `${oldValue || "Unknown"} → ${newValue || "Unknown"}`;
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
      setDraftLeadSourceDetail("");
      setFollowup1Date("");
      setFollowup1Completed(false);
      setFollowup2Date("");
      setFollowup2Completed(false);
      setFollowup3Date("");
      setFollowup3Completed(false);
      return;
    }

    setDraftStatus(lead.status);
    setDraftAssignedToId(lead.assignedToId);
    setDraftComment(lead.comments);
    setDraftName(lead.studentName);
    setDraftMobile(lead.mobile || "");
    setDraftEmail(lead.email);
    setDraftCourse(lead.course);
    setDraftLeadSource(lead.leadSource);
    setDraftLeadSourceDetail(lead.leadSourceDetail || "");
    setFollowup1Date(lead.followup1Date || "");
    setFollowup1Completed(lead.followup1Completed || false);
    setFollowup2Date(lead.followup2Date || "");
    setFollowup2Completed(lead.followup2Completed || false);
    setFollowup3Date(lead.followup3Date || "");
    setFollowup3Completed(lead.followup3Completed || false);
  };

  useEffect(() => {
    const loadUsers = async () => {
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

        let combined: UserLookupRecord[] = [];
        if (resUsers.ok) {
          const u = await resUsers.json();
          if (Array.isArray(u))
            combined = combined.concat(u as UserLookupRecord[]);
        }
        if (resAdmins && resAdmins.ok) {
          const a = await resAdmins.json();
          if (Array.isArray(a))
            combined = combined.concat(
              (a as Array<{ id?: string; name?: string; email?: string }>).map(
                (ad) => ({
                  id: ad.id || "",
                  name: ad.name || ad.email || "",
                  email: ad.email,
                  role: "admin",
                }),
              ),
            );
        }

        if (resAuthUsers && resAuthUsers.ok) {
          const au = await resAuthUsers.json();
          if (Array.isArray(au))
            combined = combined.concat(au as UserLookupRecord[]);
        }

        if (combined.length > 0) {
          const nextCounselors = uniqueUsersById(
            combined.map((u) => ({
              id: u.id,
              name: u.name || u.email || u.id || "",
              role: u.role,
            })),
          );
          setUsersLookup(nextCounselors);
          setCounselors(nextCounselors);
          return;
        }
      } catch (e) {
        if (
          !(e instanceof Error && e.message.toLowerCase().includes("aborted"))
        ) {
          console.error(
            "Failed to load users lookup",
            e instanceof Error ? e.message : String(e),
          );
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

        const nextCounselors = uniqueUsersById(counselors);
        setUsersLookup(nextCounselors);
        setCounselors(nextCounselors);
      } catch (fallbackError) {
        if (
          !(
            fallbackError instanceof Error &&
            fallbackError.message.toLowerCase().includes("aborted")
          )
        ) {
          console.error(
            "Fallback users lookup failed",
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError),
          );
        }
        setUsersLookup([]);
      }
    };

    loadUsers();
  }, []);

  const fetchLeads = useCallback(
    async (pageToLoad = 1) => {
      setIsLoading(true);

      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const params = new URLSearchParams({
          page: String(pageToLoad),
          limit: String(PAGE_SIZE),
        });

        if (statusFilter) params.set("status", statusFilter);
        if (counselorFilter) params.set("counselor", counselorFilter);
        if (searchTerm) params.set("search", searchTerm);

        const response = await fetch(`/api/admin/leads?${params.toString()}`, {
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(
            errorBody?.error ||
              `Failed to fetch leads: HTTP ${response.status}`,
          );
        }

        const list = (await response.json()) as {
          items?: LeadRecord[];
          page?: number;
          totalPages?: number;
          totalItems?: number;
        };

        const rawItems = (list.items || []) as LeadRecord[];
        const items: Lead[] = rawItems.map((record) => mapLead(record));

        // Deduplicate leads by ID to avoid React key warnings
        const seen = new Set<string>();
        const dedupItems = items.filter((lead) => {
          if (seen.has(lead.id)) return false;
          seen.add(lead.id);
          return true;
        });

        setLeads(dedupItems);
        setFilteredLeads(dedupItems);
        setTotalPages(Math.max(1, list.totalPages || 1));
        setPage(list.page || pageToLoad);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          // Request was cancelled, don't show error
        } else if (
          error instanceof Error &&
          error.message.includes("aborted")
        ) {
          // Request was cancelled, don't show error
        } else {
          console.error(
            "Error fetching leads:",
            error instanceof Error ? error.message : String(error),
          );
          setLeads([]);
          setFilteredLeads([]);
          setTotalPages(1);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [statusFilter, counselorFilter, searchTerm, mapLead],
  );

  const fetchAllLeads = useCallback(async () => {
    setIsLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const params = new URLSearchParams({
        all: "1",
      });

      if (statusFilter) params.set("status", statusFilter);
      if (counselorFilter) params.set("counselor", counselorFilter);
      if (searchTerm) params.set("search", searchTerm);

      const response = await fetch(`/api/admin/leads?${params.toString()}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody?.error || `Failed to fetch leads: HTTP ${response.status}`,
        );
      }

      const list = (await response.json()) as {
        items?: LeadRecord[];
        page?: number;
        totalPages?: number;
        totalItems?: number;
      };

      const rawItems = (list.items || []) as LeadRecord[];
      const items: Lead[] = rawItems.map((record) => mapLead(record));

      const seen = new Set<string>();
      const dedupItems = items.filter((lead) => {
        if (seen.has(lead.id)) return false;
        seen.add(lead.id);
        return true;
      });

      setLeads(dedupItems);
      setFilteredLeads(dedupItems);
      setTotalPages(Math.max(1, Math.ceil(dedupItems.length / PAGE_SIZE)));
      setPage(1);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Request was cancelled, don't show error
      } else if (error instanceof Error && error.message.includes("aborted")) {
        // Request was cancelled, don't show error
      } else {
        console.error(
          "Error fetching leads:",
          error instanceof Error ? error.message : String(error),
        );
        setLeads([]);
        setFilteredLeads([]);
        setTotalPages(1);
      }
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, counselorFilter, searchTerm, mapLead]);

  // When any filter/search changes, reload the appropriate dataset.
  useEffect(() => {
    if (dateFilterRange) {
      setTimeout(() => {
        void fetchAllLeads();
      }, 0);
      return;
    }

    if (page !== 1) {
      setPage(1);
      return;
    }

    setTimeout(() => {
      void fetchLeads(1);
    }, 0);
  }, [
    statusFilter,
    counselorFilter,
    searchTerm,
    dateFilterRange,
    fetchLeads,
    fetchAllLeads,
  ]);

  useEffect(() => {
    if (dateFilterRange) {
      return;
    }

    setTimeout(() => {
      void fetchLeads(page);
    }, 0);
  }, [page, dateFilterRange, fetchLeads]);

  // Apply date filtering and sorting
  useEffect(() => {
    if (!leads.length) {
      setFilteredLeads([]);
      if (dateFilterRange) {
        setTotalPages(1);
      }
      return;
    }

    const sourceLeads = [...leads];
    let filtered = sourceLeads;

    // Apply date filter
    if (dateFilterRange) {
      filtered = filtered.filter((lead) => {
        const dateField =
          dateFilterField === "created"
            ? lead.created
            : getNextFollowup(lead)?.date;
        return isDateInRange(dateField, dateFilterRange);
      });
    }

    if (dateFilterRange) {
      const nextFiltered =
        dateFilterField === "nextFollowup"
          ? sortLeadsByNextFollowup(filtered)
          : filtered;

      setFilteredLeads(nextFiltered);
      setTotalPages(Math.max(1, Math.ceil(nextFiltered.length / PAGE_SIZE)));
      return;
    }

    // Keep the default view sorted by next follow-up.
    setFilteredLeads(sortLeadsByNextFollowup(filtered));
  }, [leads, dateFilterField, dateFilterRange]);

  // Cleanup: cancel pending requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const visibleLeads = dateFilterRange
    ? filteredLeads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : filteredLeads;
  const showAnimatedEmptyState = !isLoading && visibleLeads.length === 0;

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        setShowNoLeadsText(showAnimatedEmptyState);
      },
      showAnimatedEmptyState ? 2500 : 0,
    );

    return () => window.clearTimeout(timer);
  }, [showAnimatedEmptyState]);

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

        // Deduplicate timeline entries by ID
        const seenTimelineIds = new Set<string>();
        const uniqueTimeline = (
          history as Array<Record<string, unknown>>
        ).filter((h) => {
          const id = String(h["id"] ?? "");
          if (seenTimelineIds.has(id)) return false;
          seenTimelineIds.add(id);
          return true;
        });

        setTimeline(
          uniqueTimeline.map((h) => {
            const hh = h as Record<string, unknown>;
            return {
              id: String(hh["id"] ?? ""),
              eventType: String(hh["eventType"] ?? ""),
              changedBy: String(hh["changedBy"] ?? "Unknown"),
              comment: (hh["comment"] as string | undefined) ?? undefined,
              oldValue: (hh["oldValue"] as string | undefined) ?? undefined,
              newValue: (hh["newValue"] as string | undefined) ?? undefined,
              created: String(hh["created"] ?? ""),
            } as TimelineEntry;
          }),
        );
      } catch (e) {
        console.error(
          "Failed to load timeline",
          e instanceof Error ? e.message : String(e),
        );
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
      console.error(
        "Delete failed",
        e instanceof Error ? e.message : String(e),
      );
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
    const nextMobile = normalizePhone(draftMobile.trim());
    const nextCountryCode = selectedLead.countryCode || "+94";
    const normalizedMobileWithCountry = `${nextCountryCode}${nextMobile}`;
    const nextEmail = draftEmail.trim();
    const nextCourse = draftCourse.trim();
    const nextLeadSource = draftLeadSource.trim();
    const nextLeadSourceDetail = draftLeadSourceDetail.trim();
    const statusChanged = nextStatus !== selectedLead.status;
    const assigneeChanged = nextAssignedToId !== selectedLead.assignedToId;
    const commentChanged = nextComment !== selectedLead.comments.trim();
    const nameChanged = nextName !== selectedLead.studentName;
    const mobileChanged =
      nextMobile !== selectedLead.mobile ||
      normalizedMobileWithCountry !== selectedLead.mobileWithCountry;
    const emailChanged = nextEmail !== selectedLead.email;
    const courseChanged = nextCourse !== selectedLead.course;
    const leadSourceChanged = nextLeadSource !== selectedLead.leadSource;
    const leadSourceDetailChanged =
      nextLeadSourceDetail !== (selectedLead.leadSourceDetail || "");

    if (
      !statusChanged &&
      !assigneeChanged &&
      !commentChanged &&
      !nameChanged &&
      !mobileChanged &&
      !emailChanged &&
      !courseChanged &&
      !leadSourceChanged &&
      !leadSourceDetailChanged
    ) {
      toast.error("No changes to update");
      return;
    }

    if (assigneeChanged && !nextAssignedToId) {
      toast.error("Please assign the lead to a counselor");
      return;
    }

    if (nextStatus === "Follow-up" && !selectedLead.followup1Date) {
      toast.error(
        "Set the first follow-up date before moving the lead to Follow-up",
      );
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
      if (nameChanged) payload.studentName = nextName;
      if (mobileChanged) {
        payload.mobileWithCountry = normalizedMobileWithCountry;
        payload.countryCode = nextCountryCode;
      }
      if (emailChanged) payload.email = nextEmail;
      if (courseChanged) payload.course = nextCourse;
      if (leadSourceChanged) payload.leadSource = nextLeadSource;
      if (leadSourceChanged || leadSourceDetailChanged) {
        payload.leadSourceDetail = shouldShowLeadSourceDetail(nextLeadSource)
          ? nextLeadSourceDetail
          : "";
      }

      // Follow-up fields: enforce same non-admin restrictions as individual save
      const userRole = pb.authStore.model?.role;
      const isAdminUser = userRole === "admin";

      if (!isAdminUser) {
        if (
          selectedLead.followup1Date &&
          selectedLead.followup1Date !== followup1Date
        ) {
          toast.error("Cannot modify existing follow-up dates. Contact admin.");
          return;
        }
        if (
          selectedLead.followup2Date &&
          selectedLead.followup2Date !== followup2Date
        ) {
          toast.error("Cannot modify existing follow-up dates. Contact admin.");
          return;
        }
        if (
          selectedLead.followup3Date &&
          selectedLead.followup3Date !== followup3Date
        ) {
          toast.error("Cannot modify existing follow-up dates. Contact admin.");
          return;
        }
      }

      if ((selectedLead.followup1Date || "") !== (followup1Date || "")) {
        payload.followup1Date = followup1Date || null;
      }
      payload.followup1Completed = followup1Completed;

      if ((selectedLead.followup2Date || "") !== (followup2Date || "")) {
        payload.followup2Date = followup2Date || null;
      }
      payload.followup2Completed = followup2Completed;

      if ((selectedLead.followup3Date || "") !== (followup3Date || "")) {
        payload.followup3Date = followup3Date || null;
      }
      payload.followup3Completed = followup3Completed;

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
        leadSourceChanged ||
        leadSourceDetailChanged
      ) {
        await pb.collection("leadHistory").create({
          timeStamp: new Date().toISOString(),
          leadId: selectedLead.id,
          eventType: "Lead Details Updated",
          changedBy: pb.authStore.model?.id || "",
          comment:
            `Updated: ${nameChanged ? "Name, " : ""}${mobileChanged ? "Mobile, " : ""}${emailChanged ? "Email, " : ""}${courseChanged ? "Course, " : ""}${leadSourceChanged ? "Lead Source, " : ""}${leadSourceDetailChanged ? "Lead Source Details" : ""}`.replace(
              /, $/,
              "",
            ),
        });
      }

      // Create history entries for any follow-up date changes
      const now = new Date().toISOString();

      if ((selectedLead.followup1Date || "") !== (followup1Date || "")) {
        await pb.collection("leadHistory").create({
          timeStamp: now,
          leadId: selectedLead.id,
          eventType: "Follow-up Scheduled",
          changedBy: pb.authStore.model?.id || "",
          oldValue: selectedLead.followup1Date || "Not set",
          newValue: followup1Date || "Cleared",
          field: "followup1Date",
        });
      }

      if ((selectedLead.followup2Date || "") !== (followup2Date || "")) {
        await pb.collection("leadHistory").create({
          timeStamp: now,
          leadId: selectedLead.id,
          eventType: "Follow-up Scheduled",
          changedBy: pb.authStore.model?.id || "",
          oldValue: selectedLead.followup2Date || "Not set",
          newValue: followup2Date || "Cleared",
          field: "followup2Date",
        });
      }

      if ((selectedLead.followup3Date || "") !== (followup3Date || "")) {
        await pb.collection("leadHistory").create({
          timeStamp: now,
          leadId: selectedLead.id,
          eventType: "Follow-up Scheduled",
          changedBy: pb.authStore.model?.id || "",
          oldValue: selectedLead.followup3Date || "Not set",
          newValue: followup3Date || "Cleared",
          field: "followup3Date",
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
      console.error(
        "Lead update failed",
        e instanceof Error ? e.message : String(e),
      );
      toast.error("Failed to update lead");
    } finally {
      setIsSaving(false);
    }
  };

  const getFollowupStatus = (
    dateStr: string | undefined,
    isCompleted: boolean | undefined,
  ): string | null => {
    if (!dateStr) return null;
    if (isCompleted) return "completed";
    let date: Date;
    // Prefer parsing YYYY-MM-DD as local date to avoid timezone shifts
    const isoDateMatch = (dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateMatch) {
      const y = Number(isoDateMatch[1]);
      const m = Number(isoDateMatch[2]);
      const d = Number(isoDateMatch[3]);
      date = new Date(y, m - 1, d);
    } else {
      date = new Date(dateStr);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "overdue";
    if (diffDays === 0) return "today";
    if (diffDays <= 3) return "upcoming";
    return "scheduled";
  };

  const getFollowupStatusColor = (status: string | null): string => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border border-green-300";
      case "overdue":
        return "bg-red-100 text-red-800 border border-red-300";
      case "today":
        return "bg-yellow-100 text-yellow-800 border border-yellow-300";
      case "upcoming":
        return "bg-orange-100 text-orange-800 border border-orange-300";
      case "scheduled":
        return "bg-blue-100 text-blue-800 border border-blue-300";
      default:
        return "bg-gray-100 text-gray-800 border border-gray-300";
    }
  };

  const formatFollowupDateOnly = (value?: string) => {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(value));
    } catch {
      return value;
    }
  };

  const getNextFollowup = (lead: Lead) => {
    const candidates: Array<{ date?: string; completed?: boolean }> = [
      { date: lead.followup1Date, completed: lead.followup1Completed },
      { date: lead.followup2Date, completed: lead.followup2Completed },
      { date: lead.followup3Date, completed: lead.followup3Completed },
    ].filter((c) => c.date && c.date.trim());

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const da = new Date(a.date || 0).getTime();
      const db = new Date(b.date || 0).getTime();
      return da - db;
    });

    const notCompleted = candidates.find((c) => !c.completed && c.date);
    const chosen = notCompleted || candidates[0];
    return chosen;
  };

  const sortLeadsByNextFollowup = (leadsToSort: Lead[]): Lead[] => {
    return leadsToSort.sort((a, b) => {
      const nfA = getNextFollowup(a);
      const nfB = getNextFollowup(b);

      // No follow-up dates go to the end
      if (!nfA && !nfB) return 0;
      if (!nfA) return 1;
      if (!nfB) return -1;

      // Compare dates
      const dateA = dateStringToDate(nfA.date || "");
      const dateB = dateStringToDate(nfB.date || "");
      if (!dateA || !dateB) return 0;
      return dateA.getTime() - dateB.getTime();
    });
  };

  const handleSaveFollowups = async () => {
    if (!selectedLead) return;

    try {
      setIsSaving(true);
      const pb = createPocketBaseClient();

      // Check if user is admin
      const userRole = pb.authStore.model?.role;
      const isAdmin = userRole === "admin";

      // Non-admins can only set dates that are currently empty
      if (!isAdmin) {
        if (
          selectedLead.followup1Date &&
          selectedLead.followup1Date !== followup1Date
        ) {
          toast.error("Cannot modify existing follow-up dates. Contact admin.");
          return;
        }
        if (
          selectedLead.followup2Date &&
          selectedLead.followup2Date !== followup2Date
        ) {
          toast.error("Cannot modify existing follow-up dates. Contact admin.");
          return;
        }
        if (
          selectedLead.followup3Date &&
          selectedLead.followup3Date !== followup3Date
        ) {
          toast.error("Cannot modify existing follow-up dates. Contact admin.");
          return;
        }
      }

      const updateData: Record<string, unknown> = {
        followup1Date: followup1Date || null,
        followup1Completed: followup1Completed,
        followup2Date: followup2Date || null,
        followup2Completed: followup2Completed,
        followup3Date: followup3Date || null,
        followup3Completed: followup3Completed,
      };

      await pb.collection("leads").update(selectedLead.id, updateData);

      // Create history entries for follow-up changes
      const now = new Date().toISOString();
      const changes = [];

      // Check follow-up 1
      if ((selectedLead.followup1Date || "") !== followup1Date) {
        changes.push({
          leadId: selectedLead.id,
          eventType: "Follow-up Scheduled",
          changedBy: pb.authStore.model?.id || "",
          oldValue: selectedLead.followup1Date || "Not set",
          newValue: followup1Date || "Cleared",
          field: "followup1Date",
          created: now,
        });
      }

      // Check follow-up 2
      if ((selectedLead.followup2Date || "") !== followup2Date) {
        changes.push({
          leadId: selectedLead.id,
          eventType: "Follow-up Scheduled",
          changedBy: pb.authStore.model?.id || "",
          oldValue: selectedLead.followup2Date || "Not set",
          newValue: followup2Date || "Cleared",
          field: "followup2Date",
          created: now,
        });
      }

      // Check follow-up 3
      if ((selectedLead.followup3Date || "") !== followup3Date) {
        changes.push({
          leadId: selectedLead.id,
          eventType: "Follow-up Scheduled",
          changedBy: pb.authStore.model?.id || "",
          oldValue: selectedLead.followup3Date || "Not set",
          newValue: followup3Date || "Cleared",
          field: "followup3Date",
          created: now,
        });
      }

      // Record changes in history
      for (const entry of changes) {
        await pb.collection("leadHistory").create(entry);
      }

      toast.success("Follow-ups updated");
      await openSidebarFor(selectedLead);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update follow-ups",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveIndividualFollowup = async (followupNum: 1 | 2 | 3) => {
    if (!selectedLead) return;

    try {
      setSavingFollowup(followupNum);
      const pb = createPocketBaseClient();

      // Get the date and existing value for this followup
      const dateMap = { 1: followup1Date, 2: followup2Date, 3: followup3Date };
      const existingMap = {
        1: selectedLead.followup1Date,
        2: selectedLead.followup2Date,
        3: selectedLead.followup3Date,
      };
      const fieldName = `followup${followupNum}Date`;

      const newDate = dateMap[followupNum];
      const existingDate = existingMap[followupNum];

      // Check if user is admin
      const userRole = pb.authStore.model?.role;
      const isAdmin = userRole === "admin";

      // Non-admins can't modify existing dates
      if (!isAdmin && existingDate && existingDate !== newDate) {
        toast.error("Cannot modify existing follow-up dates. Contact admin.");
        return;
      }

      // Only update if date changed
      if ((existingDate || "") !== newDate) {
        const updateData = { [fieldName]: newDate || null };
        await pb.collection("leads").update(selectedLead.id, updateData);

        // Create history entry
        const now = new Date().toISOString();
        try {
          await pb.collection("leadHistory").create({
            leadId: selectedLead.id,
            eventType: "Follow-up Scheduled",
            changedBy: pb.authStore.model?.id || "",
            oldValue: existingDate || "Not set",
            newValue: newDate || "Cleared",
            field: fieldName,
            created: now,
          });
        } catch (err) {
          // Non-blocking: log but don't fail the update
          console.error("History logging failed:", err);
        }

        toast.success(`Follow-up ${followupNum} date saved`);
      }

      // Refresh lead details
      await openSidebarFor(selectedLead);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to save follow-up ${followupNum}`,
      );
    } finally {
      setSavingFollowup(null);
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
        countryCode: payload.countryCode || "+94",
        mobileWithCountry:
          payload.mobileWithCountry ||
          `${payload.countryCode || "+94"}${normalizePhone(payload.mobile)}`,
        course: payload.course,
        leadSource: payload.leadSource || "Manual",
        leadSourceDetail: payload.leadSourceDetail || "",
        status: "New",
        leadStatus: "New",
        assignedTo: assigneeValue,
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
      console.error(
        "Create failed",
        e instanceof Error ? e.message : String(e),
      );
      toast.error("Failed to create lead");
    } finally {
      setIsSaving(false);
    }
  };

  const statuses = ["New", "Contacted", "Follow-up", "Registered", "Lost"];
  const statusColors: Record<string, string> = {
    New: "bg-blue-100 text-blue-800",
    Contacted: "bg-yellow-100 text-yellow-800",
    "Follow-up": "bg-orange-100 text-orange-800",
    Registered: "bg-green-100 text-green-800",
    Lost: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-4">
      {/* Top Bar with Search & New Button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
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
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          New Lead
        </button>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap gap-2">
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
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Date Filter */}
        <select
          value={dateFilterField}
          onChange={(e) => setDateFilterField(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="nextFollowup">Filter by Next Follow-up</option>
          <option value="created">Filter by Created Date</option>
        </select>

        <DatePickerWithRange
          value={dateFilterRange}
          onValueChange={setDateFilterRange}
        />

        {dateFilterRange && (
          <button
            onClick={() => {
              setDateFilterRange(undefined);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
          >
            Clear Filter
          </button>
        )}
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        {isLoading ? (
          <div className="p-6">
            <div className="mb-4 flex items-center justify-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading leads...
            </div>
            <div className="space-y-3">
              {[...Array(6)].map((_, index) => (
                <div
                  key={`lead-loader-${index}`}
                  className="grid grid-cols-8 gap-4 rounded-md border border-gray-100 px-4 py-3"
                >
                  <div className="h-4 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 animate-pulse rounded bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
        ) : visibleLeads.length === 0 ? (
          <div className="p-10">
            <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-3 text-gray-500">
              {showNoLeadsText ? (
                <p className="text-sm font-medium text-gray-500">
                  No leads found
                </p>
              ) : (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.2s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.1s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400" />
                  </div>
                </>
              )}
            </div>
          </div>
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
                  Next Follow-up
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
              {visibleLeads.map((lead) => (
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
                    {lead.mobileWithCountry ||
                      `${lead.countryCode || "+94"}${lead.mobile}`}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">
                    {lead.course}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    {(() => {
                      const nf = getNextFollowup(lead);
                      if (!nf || !nf.date)
                        return <span className="text-sm text-gray-400">-</span>;
                      const status = getFollowupStatus(nf.date, nf.completed);
                      return (
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${getFollowupStatusColor(status)}`}
                        >
                          {formatFollowupDateOnly(nf.date)}
                        </span>
                      );
                    })()}
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
          Page {page} of {totalPages} (
          {dateFilterRange ? filteredLeads.length : leads.length} leads)
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

          {/* Page numbers - show window of pages when there are many */}
          <div className="inline-flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, idx) => {
              const p = idx + 1;
              // show first, last, current ±2
              if (
                p === 1 ||
                p === totalPages ||
                (p >= page - 2 && p <= page + 2)
              ) {
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1 rounded-lg border ${
                      p === page ? "bg-blue-600 text-white" : "bg-white"
                    }`}
                  >
                    {p}
                  </button>
                );
              }

              // render ellipsis once for omitted ranges
              const isBefore = p < page - 2 && p > 1;
              const isAfter = p > page + 2 && p < totalPages;
              if (isBefore && idx === 1) return <span key={`e-${p}`}>...</span>;
              if (isAfter && idx === totalPages - 2)
                return <span key={`e2-${p}`}>...</span>;
              return null;
            })}
          </div>

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
                        <p className="text-sm">
                          {selectedLead.mobileWithCountry ||
                            `${selectedLead.countryCode}${selectedLead.mobile}`}
                        </p>
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
                        <div className="space-y-2">
                          <select
                            value={draftLeadSource}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              setDraftLeadSource(nextValue);
                              if (!shouldShowLeadSourceDetail(nextValue)) {
                                setDraftLeadSourceDetail("");
                              }
                            }}
                            disabled={isSaving}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                          >
                            <option value="">Select Lead Source</option>
                            {LEAD_SOURCE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {shouldShowLeadSourceDetail(draftLeadSource) && (
                            <input
                              type="text"
                              value={draftLeadSourceDetail}
                              onChange={(e) =>
                                setDraftLeadSourceDetail(e.target.value)
                              }
                              disabled={isSaving}
                              placeholder={getLeadSourceDetailLabel(
                                draftLeadSource,
                              )}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-sm">
                            {selectedLead.leadSource || "—"}
                          </p>
                          {selectedLead.leadSourceDetail && (
                            <p className="text-xs text-gray-500">
                              {selectedLead.leadSourceDetail}
                            </p>
                          )}
                        </div>
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

                      {selectedLead && draftStatus === "Follow-up" && (
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <h3 className="text-sm font-semibold text-slate-900 mb-4">
                            Follow-ups
                          </h3>

                          <div className="space-y-4">
                            {/* Follow-up 1 */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-700">
                                  Follow-up 1
                                </label>
                                {selectedLead?.followup1Date && (
                                  <span
                                    className={`px-2 py-1 rounded text-xs font-semibold ${getFollowupStatusColor(getFollowupStatus(selectedLead.followup1Date, selectedLead.followup1Completed))}`}
                                  >
                                    {selectedLead.followup1Completed
                                      ? "Completed"
                                      : getFollowupStatus(
                                            selectedLead.followup1Date,
                                            selectedLead.followup1Completed,
                                          ) === "overdue"
                                        ? "Overdue"
                                        : getFollowupStatus(
                                              selectedLead.followup1Date,
                                              selectedLead.followup1Completed,
                                            ) === "today"
                                          ? "Today"
                                          : getFollowupStatus(
                                                selectedLead.followup1Date,
                                                selectedLead.followup1Completed,
                                              ) === "upcoming"
                                            ? "Soon"
                                            : "Scheduled"}
                                  </span>
                                )}
                              </div>
                              <input
                                type="date"
                                value={followup1Date}
                                onChange={(e) =>
                                  setFollowup1Date(e.target.value)
                                }
                                disabled={
                                  isSaving ||
                                  (!isAdmin && !!selectedLead?.followup1Date)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              {followup1Date &&
                              followup1Date !== selectedLead?.followup1Date ? (
                                <button
                                  onClick={() =>
                                    handleSaveIndividualFollowup(1)
                                  }
                                  disabled={savingFollowup === 1}
                                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                                >
                                  {savingFollowup === 1 ? "Setting..." : "Set"}
                                </button>
                              ) : (
                                selectedLead?.followup1Date && (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      id="followup1Completed"
                                      checked={followup1Completed}
                                      onChange={(e) =>
                                        setFollowup1Completed(e.target.checked)
                                      }
                                      disabled={
                                        !followup1Date ||
                                        isSaving ||
                                        followup1Completed
                                      }
                                      className="rounded"
                                    />
                                    <label
                                      htmlFor="followup1Completed"
                                      className="text-sm text-gray-600 cursor-pointer"
                                    >
                                      Mark as completed
                                    </label>
                                  </div>
                                )
                              )}
                            </div>

                            {/* Follow-up 2 */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-700">
                                  Follow-up 2
                                  {!followup1Completed && (
                                    <span className="ml-1 text-red-600">
                                      (requires follow-up 1 completion)
                                    </span>
                                  )}
                                </label>
                                {selectedLead?.followup2Date && (
                                  <span
                                    className={`px-2 py-1 rounded text-xs font-semibold ${getFollowupStatusColor(getFollowupStatus(selectedLead.followup2Date, selectedLead.followup2Completed))}`}
                                  >
                                    {selectedLead.followup2Completed
                                      ? "Completed"
                                      : getFollowupStatus(
                                            selectedLead.followup2Date,
                                            selectedLead.followup2Completed,
                                          ) === "overdue"
                                        ? "Overdue"
                                        : getFollowupStatus(
                                              selectedLead.followup2Date,
                                              selectedLead.followup2Completed,
                                            ) === "today"
                                          ? "Today"
                                          : getFollowupStatus(
                                                selectedLead.followup2Date,
                                                selectedLead.followup2Completed,
                                              ) === "upcoming"
                                            ? "Soon"
                                            : "Scheduled"}
                                  </span>
                                )}
                              </div>
                              <input
                                type="date"
                                value={followup2Date}
                                onChange={(e) =>
                                  setFollowup2Date(e.target.value)
                                }
                                disabled={
                                  !followup1Completed ||
                                  isSaving ||
                                  (!isAdmin && !!selectedLead?.followup2Date)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              {followup2Date &&
                              followup2Date !== selectedLead?.followup2Date ? (
                                <button
                                  onClick={() =>
                                    handleSaveIndividualFollowup(2)
                                  }
                                  disabled={savingFollowup === 2}
                                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                                >
                                  {savingFollowup === 2 ? "Setting..." : "Set"}
                                </button>
                              ) : (
                                selectedLead?.followup2Date && (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      id="followup2Completed"
                                      checked={followup2Completed}
                                      onChange={(e) =>
                                        setFollowup2Completed(e.target.checked)
                                      }
                                      disabled={
                                        !followup2Date ||
                                        isSaving ||
                                        followup2Completed
                                      }
                                      className="rounded"
                                    />
                                    <label
                                      htmlFor="followup2Completed"
                                      className="text-sm text-gray-600 cursor-pointer"
                                    >
                                      Mark as completed
                                    </label>
                                  </div>
                                )
                              )}
                            </div>

                            {/* Follow-up 3 */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-700">
                                  Follow-up 3
                                  {!followup2Completed && (
                                    <span className="ml-1 text-red-600">
                                      (requires follow-up 2 completion)
                                    </span>
                                  )}
                                </label>
                                {selectedLead?.followup3Date && (
                                  <span
                                    className={`px-2 py-1 rounded text-xs font-semibold ${getFollowupStatusColor(getFollowupStatus(selectedLead.followup3Date, selectedLead.followup3Completed))}`}
                                  >
                                    {selectedLead.followup3Completed
                                      ? "Completed"
                                      : getFollowupStatus(
                                            selectedLead.followup3Date,
                                            selectedLead.followup3Completed,
                                          ) === "overdue"
                                        ? "Overdue"
                                        : getFollowupStatus(
                                              selectedLead.followup3Date,
                                              selectedLead.followup3Completed,
                                            ) === "today"
                                          ? "Today"
                                          : getFollowupStatus(
                                                selectedLead.followup3Date,
                                                selectedLead.followup3Completed,
                                              ) === "upcoming"
                                            ? "Soon"
                                            : "Scheduled"}
                                  </span>
                                )}
                              </div>
                              <input
                                type="date"
                                value={followup3Date}
                                onChange={(e) =>
                                  setFollowup3Date(e.target.value)
                                }
                                disabled={
                                  !followup2Completed ||
                                  isSaving ||
                                  (!isAdmin && !!selectedLead?.followup3Date)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              {followup3Date &&
                              followup3Date !== selectedLead?.followup3Date ? (
                                <button
                                  onClick={() =>
                                    handleSaveIndividualFollowup(3)
                                  }
                                  disabled={savingFollowup === 3}
                                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                                >
                                  {savingFollowup === 3 ? "Setting..." : "Set"}
                                </button>
                              ) : (
                                selectedLead?.followup3Date && (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      id="followup3Completed"
                                      checked={followup3Completed}
                                      onChange={(e) =>
                                        setFollowup3Completed(e.target.checked)
                                      }
                                      disabled={
                                        !followup3Date ||
                                        isSaving ||
                                        followup3Completed
                                      }
                                      className="rounded"
                                    />
                                    <label
                                      htmlFor="followup3Completed"
                                      className="text-sm text-gray-600 cursor-pointer"
                                    >
                                      Mark as completed
                                    </label>
                                  </div>
                                )
                              )}
                            </div>

                            {/* Follow-ups are saved as part of the main Update action */}
                          </div>
                        </div>
                      )}

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
                            `https://wa.me/${(
                              selectedLead.mobileWithCountry ||
                              `${selectedLead.countryCode}-${selectedLead.mobile}`
                            ).replace(
                              /\D/g,
                              "",
                            )}?text=${encodeURIComponent(`Hello, I'm ${currentUserName} from Amazon College. I'm reaching out regarding your inquiry about ${selectedLead.course}. How may I assist you today?`)}`,
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
                            groupedTimeline.map((group) => (
                              <div key={group.id} className="relative pl-5">
                                <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-slate-900" />
                                <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <div className="flex flex-col gap-1">
                                    <span className="text-sm font-semibold text-slate-900">
                                      {getGroupTitle(group)}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                      <span>
                                        {formatTimelineDate(group.timestamp)}
                                      </span>
                                      <span>By {group.changedBy}</span>
                                    </div>
                                  </div>
                                  {normalizeTimelineEventType(
                                    group.entries[0].eventType,
                                  ) !== "comment" &&
                                    getEntryTransition(group.entries[0]) && (
                                      <p className="text-sm font-medium text-slate-700">
                                        {getEntryTransition(group.entries[0])}
                                      </p>
                                    )}
                                  {(() => {
                                    const commentSource =
                                      group.entries.find(
                                        (entry) =>
                                          normalizeTimelineEventType(
                                            entry.eventType,
                                          ) === "comment",
                                      ) ||
                                      group.entries.find(
                                        (entry) =>
                                          normalizeTimelineEventType(
                                            entry.eventType,
                                          ) === "lead details updated",
                                      );
                                    if (!commentSource) return null;

                                    const note = commentSource
                                      ? getTimelineComment(commentSource)
                                      : "";

                                    if (!note) return null;

                                    const isDetailsChanged =
                                      normalizeTimelineEventType(
                                        commentSource.eventType,
                                      ) === "lead details updated";

                                    return (
                                      <div className="rounded-md bg-white px-3 py-2 text-sm text-slate-700">
                                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                          {isDetailsChanged
                                            ? "Details changed"
                                            : "Comment entered"}
                                        </p>
                                        <p className="mt-1 whitespace-pre-wrap">
                                          {note}
                                        </p>
                                      </div>
                                    );
                                  })()}
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
  const [countryCode, setCountryCode] = useState("+94");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [course, setCourse] = useState("");
  const [leadSource, setLeadSource] = useState("Direct");
  const [leadSourceDetail, setLeadSourceDetail] = useState("");
  const [assignee, setAssignee] = useState("");

  useEffect(() => {
    if (!assignee && users.length > 0) {
      // setting state from effect to initialize default assignee is intended
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAssignee(users[0].id);
    }
  }, [users, assignee]);

  const submit = () => {
    if (!name || !mobile || !course) {
      toast.error("Please fill required fields: Name, Mobile, Course");
      return;
    }

    if (shouldShowLeadSourceDetail(leadSource) && !leadSourceDetail.trim()) {
      toast.error("Please enter who referred the lead or the source details");
      return;
    }

    const cleanedMobile = normalizePhone(mobile);
    onCreate({
      studentName: name,
      mobile: cleanedMobile,
      email,
      course,
      assignee,
      countryCode,
      mobileWithCountry: `${countryCode}${cleanedMobile}`,
      leadSource,
      leadSourceDetail: shouldShowLeadSourceDetail(leadSource)
        ? leadSourceDetail.trim()
        : undefined,
    });
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
          Country Code *
        </label>
        <select
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="+94">+94 (Sri Lanka)</option>
          <option value="+1">+1 (US/Canada)</option>
          <option value="+44">+44 (UK)</option>
          <option value="+91">+91 (India)</option>
          <option value="+92">+92 (Pakistan)</option>
          <option value="+971">+971 (UAE)</option>
        </select>
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
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase">
          Lead Source
        </label>
        <select
          value={leadSource}
          onChange={(e) => {
            const nextValue = e.target.value;
            setLeadSource(nextValue);
            if (!shouldShowLeadSourceDetail(nextValue)) {
              setLeadSourceDetail("");
            }
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Select lead source</option>
          {LEAD_SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {shouldShowLeadSourceDetail(leadSource) && (
        <div>
          <label className="text-xs font-semibold text-gray-600 uppercase">
            {getLeadSourceDetailLabel(leadSource)}
          </label>
          <input
            value={leadSourceDetail}
            onChange={(e) => setLeadSourceDetail(e.target.value)}
            placeholder="Enter the person or source details"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      )}
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
