"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  MessageSquare,
  Edit2,
  AlertCircle,
  Shield,
  Search,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import StaffTasks from "@/components/staff/Tasks";
import StaffKPIScorecard from "@/components/staff/KPIScorecard";
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
  followup1Date?: string;
  followup1Completed?: boolean;
  followup2Date?: string;
  followup2Completed?: boolean;
  followup3Date?: string;
  followup3Completed?: boolean;
  nextFollowupDate?: string;
  nextFollowupCompleted?: boolean;
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
  followup1Date?: string;
  followup1Completed?: boolean;
  followup2Date?: string;
  followup2Completed?: boolean;
  followup3Date?: string;
  followup3Completed?: boolean;
  nextFollowupDate?: string;
  nextFollowupCompleted?: boolean;
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
  const pb = createPocketBaseClient();
  const [authChecked, setAuthChecked] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isCounselor, setIsCounselor] = useState(false);
  const [authUser, setAuthUser] = useState<{
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  } | null>(null);

  const [accessPolicies, setAccessPolicies] = useState<any[]>([]);
  const [isAccessLoading, setIsAccessLoading] = useState(true);

  useEffect(() => {
    const syncAuth = async () => {
      const nextAuthUser = pb.authStore.model as {
        id?: string;
        name?: string;
        email?: string;
        role?: string;
      } | null;

      const isValidCounsellor =
        pb.authStore.isValid &&
        (nextAuthUser?.role === "student-counsellor" ||
         nextAuthUser?.role === "admin" ||
         nextAuthUser?.role === "super-admin" ||
         nextAuthUser?.role === "marketing-manager" ||
         nextAuthUser?.role === "admissions-head");

      setAuthUser(nextAuthUser);
      setIsCounselor(isValidCounsellor);
      setAuthChecked(true);
      setAuthReady(true);

      // Fetch Access Control rules
      try {
        const list = await pb.collection("accessControl").getFullList();
        setAccessPolicies(list);
      } catch (err) {
        console.error("Failed to fetch access rules:", err);
      } finally {
        setIsAccessLoading(false);
      }
    };

    const timer = window.setTimeout(syncAuth, 0);
    const unsubscribe = pb.authStore.onChange(() => {
      syncAuth();
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [pb]);
  const counselorId = authUser?.id || "";
  const counselorName = authUser?.name || "Student Counsellor";

  const getPolicyAccess = (sectionKey: string, defaultVal: boolean) => {
    if (isAccessLoading) return false;
    const policy = accessPolicies.find((p) => p.sectionKey === sectionKey);
    if (!policy) return defaultVal;

    if (policy.enabled === false) return false;

    const userId = authUser?.id || "";
    const userRole = authUser?.role || "";
    const denied = policy.deniedUsers || [];
    const allowed = policy.allowedUsers || [];
    const roles = policy.allowedRoles || [];

    return !denied.includes(userId) && (allowed.includes(userId) || roles.includes(userRole));
  };

  const leadsEnabled = getPolicyAccess("user_leads", true);
  const tasksEnabled = getPolicyAccess("user_tasks", true);
  const canAddLead = getPolicyAccess("user_add_lead", true);
  const [activeTab, setActiveTab] = useState<"leads" | "tasks" | "kpi">("leads");
  const tabRestoredRef = useRef(false);

  useEffect(() => {
    if (authChecked && authUser && !isAccessLoading && !tabRestoredRef.current) {
      const savedTab = localStorage.getItem("staff_portal_tab") as "leads" | "tasks" | "kpi" | null;
      if (savedTab === "tasks" && tasksEnabled) {
        setActiveTab("tasks");
      } else if (savedTab === "kpi") {
        setActiveTab("kpi");
      } else if (savedTab === "leads" && leadsEnabled) {
        setActiveTab("leads");
      } else {
        if (!leadsEnabled && tasksEnabled) {
          setActiveTab("tasks");
        } else if (leadsEnabled) {
          setActiveTab("leads");
        } else {
          setActiveTab("kpi");
        }
      }
      tabRestoredRef.current = true;
    }
  }, [authChecked, authUser, isAccessLoading, leadsEnabled, tasksEnabled]);

  useEffect(() => {
    if (tabRestoredRef.current) {
      localStorage.setItem("staff_portal_tab", activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (authChecked && !isCounselor) {
      router.replace("/");
    }
  }, [authChecked, isCounselor, router]);

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
  const [isEditingLeadDetails, setIsEditingLeadDetails] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedCourse, setEditedCourse] = useState("");
  const [editedEmail, setEditedEmail] = useState("");
  const [followup1Date, setFollowup1Date] = useState("");
  const [followup1Completed, setFollowup1Completed] = useState(false);
  const [followup2Date, setFollowup2Date] = useState("");
  const [followup2Completed, setFollowup2Completed] = useState(false);
  const [followup3Date, setFollowup3Date] = useState("");
  const [followup3Completed, setFollowup3Completed] = useState(false);
  const [savingFollowup, setSavingFollowup] = useState<1 | 2 | 3 | null>(null);

  const selectedLeadIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    selectedLeadIdRef.current = selectedLead?.id;
  }, [selectedLead]);

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

  // Status flow: New -> Contacted -> Follow-up -> Registered
  const statusFlow = [
    "New",
    "Ringing-No-Answer",
    "Contacted",
    "Follow-up",
    "Registered",
    "Lost",
  ];

  const normalizeLeadStatus = (status: string | undefined) => {
    const normalized = (status || "").trim().toLowerCase();
    if (
      normalized === "ringing-no-answer" ||
      normalized === "ringing no answer"
    ) {
      return "Ringing-No-Answer";
    }
    if (normalized === "followup" || normalized === "follow-up") {
      return "Follow-up";
    }
    if (normalized === "new") return "New";
    if (normalized === "contacted") return "Contacted";
    if (normalized === "registered") return "Registered";
    if (normalized === "lost") return "Lost";
    return (status || "").trim();
  };

  // Status badge color map
  const getStatusColor = (status: string) => {
    switch (status) {
      case "New":
        return "bg-blue-100 text-blue-700";
      case "Ringing-No-Answer":
        return "bg-indigo-100 text-indigo-700";
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
    const baseFlow = [...statusFlow];
    const canUpdateTerminal = getPolicyAccess("user_update_registered_lost", false);
    
    // Filter terminal status choices if not permitted
    let allowedFlow = baseFlow;
    if (!canUpdateTerminal) {
      allowedFlow = baseFlow.filter(s => s !== "Registered" && s !== "Lost");
    }

    if (!currentStatus || currentStatus.trim() === "") return allowedFlow;
    const normalizedCurrentStatus = normalizeLeadStatus(currentStatus);
    const currentIndex = allowedFlow.indexOf(normalizedCurrentStatus);
    if (currentIndex === -1) {
      // If current status is terminal but we can't update terminal states,
      // allow remaining in it to post comments
      if (normalizedCurrentStatus === "Registered" || normalizedCurrentStatus === "Lost") {
        return [normalizedCurrentStatus];
      }
      return allowedFlow;
    }
    
    // If already in a terminal state, can only stay in same status (for comments)
    if (
      normalizedCurrentStatus === "Registered" ||
      normalizedCurrentStatus === "Lost"
    )
      return [normalizedCurrentStatus];
      
    // If current status is New, it cannot be updated to New again.
    if (normalizedCurrentStatus === "New") {
      return allowedFlow.slice(currentIndex + 1);
    }
    // Include the current status so comment-only submissions are allowed,
    // then allow forward statuses (no going back).
    return [normalizedCurrentStatus, ...allowedFlow.slice(currentIndex + 1)];
  };

  const getDefaultModalStatus = useCallback((currentStatus: string) => {
    const normalizedCurrentStatus = normalizeLeadStatus(currentStatus);
    if (normalizedCurrentStatus === "New") {
      return "Ringing-No-Answer";
    }
    return normalizedCurrentStatus;
  }, []);

  const getFollowupStatus = (dateStr: string, isCompleted: boolean) => {
    if (!dateStr) return null;
    if (isCompleted) return "completed";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const followupDate = new Date(dateStr);
    followupDate.setHours(0, 0, 0, 0);

    if (followupDate < today) return "overdue";
    if (followupDate.getTime() === today.getTime()) return "today";
    if ((followupDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24) <= 7)
      return "upcoming";
    return "scheduled";
  };

  const getFollowupStatusColor = (status: string | null) => {
    if (!status) return "";
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
    ].filter((candidate) => candidate.date && candidate.date.trim());

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      return dateA - dateB;
    });

    return candidates.find((candidate) => !candidate.completed) || null;
  };

  const getLeadNextFollowupDate = (lead: Lead) => {
    return (
      lead.nextFollowupDate?.trim() || getNextFollowup(lead)?.date?.trim() || ""
    );
  };

  const formatDateForInput = (dateStr: string | undefined): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toISOString().split("T")[0];
    } catch {
      return "";
    }
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

  const resolveUserLabel = (value?: string) => {
    const trimmedValue = value?.trim() || "";
    if (!trimmedValue) return "";
    return userLookup[trimmedValue] || trimmedValue;
  };

  const showToast = (msg: string, type: "success" | "error") => {
    if (type === "success") toast.success(msg);
    else toast.error(msg);
  };

  const fetchLeads = useCallback(
    async (userId: string, selectedLeadId?: string) => {
      try {
        const pb = createPocketBaseClient();
        const token = pb.authStore.token;

        const fetchOptions: RequestInit = {};
        if (token) {
          fetchOptions.headers = { Authorization: `Bearer ${token}` };
        }

        const response = await fetch("/api/staff_portal/leads", fetchOptions);

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
          status: normalizeLeadStatus(lead.status || ""),
          comments: lead.latestComment || "",
          created: lead.created || "",
          updated: lead.lastModified || lead.updated || lead.created || "",
          assignedTo: lead.assignedTo || "",
          followup1Date: lead.followup1Date,
          followup1Completed: lead.followup1Completed,
          followup2Date: lead.followup2Date,
          followup2Completed: lead.followup2Completed,
          followup3Date: lead.followup3Date,
          followup3Completed: lead.followup3Completed,
          nextFollowupDate: lead.nextFollowupDate,
          nextFollowupCompleted: lead.nextFollowupCompleted,
        }));

        setLeads(nextLeads);

        if (nextLeads.length > 0) {
          const targetId = selectedLeadId || selectedLeadIdRef.current;
          const nextIndex = targetId
            ? nextLeads.findIndex((lead) => lead.id === targetId)
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
    [getDefaultModalStatus],
  );

  useEffect(() => {
    if (
      !authReady ||
      !authChecked ||
      !counselorId ||
      counselorId.trim() === "" ||
      !isCounselor
    ) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLeads(counselorId);
  }, [authChecked, authReady, counselorId, fetchLeads, isCounselor]);

  useEffect(() => {
    if (
      !authReady ||
      !authChecked ||
      !counselorId ||
      counselorId.trim() === "" ||
      !isCounselor
    ) {
      return;
    }

    const pb = createPocketBaseClient();
    pb.collection("leads").subscribe("*", () => {
      void fetchLeads(counselorId);
    });

    return () => {
      pb.collection("leads").unsubscribe("*");
    };
  }, [authChecked, authReady, counselorId, fetchLeads, isCounselor]);

  const openLeadDetails = async (
    lead: Lead,
    preserveStatusSelect: boolean = false,
  ) => {
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
        status: normalizeLeadStatus(latestLead.status || ""),
        comments: latestLead.latestComment || "",
        created: latestLead.created || "",
        updated: latestLead.updated || latestLead.created || "",
        assignedTo: latestLead.assignedTo || "",
        followup1Date: latestLead.followup1Date,
        followup1Completed: latestLead.followup1Completed,
        followup2Date: latestLead.followup2Date,
        followup2Completed: latestLead.followup2Completed,
        followup3Date: latestLead.followup3Date,
        followup3Completed: latestLead.followup3Completed,
      };

      setSelectedLead(nextLead);
      if (!preserveStatusSelect) {
        setStatusSelect(getDefaultModalStatus(nextLead.status));
      }
      setEditedName(latestLead.studentName || "");
      setEditedCourse(latestLead.course || latestLead.courseName || "");
      setEditedEmail(latestLead.email || "");
      setFollowup1Date(formatDateForInput(latestLead.followup1Date));
      setFollowup1Completed(latestLead.followup1Completed || false);
      setFollowup2Date(formatDateForInput(latestLead.followup2Date));
      setFollowup2Completed(latestLead.followup2Completed || false);
      setFollowup3Date(formatDateForInput(latestLead.followup3Date));
      setFollowup3Completed(latestLead.followup3Completed || false);
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
        oldValue: resolveUserLabel(entry.oldValue),
        newValue: resolveUserLabel(entry.newValue),
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

    if (statusSelect === selectedLead.status && !trimmedComment) {
      showToast("Change the status or add a comment", "error");
      return;
    }

    if (statusSelect === "New") {
      showToast(
        "A lead in New status must be transitioned to a different status",
        "error",
      );
      return;
    }

    if (statusSelect !== selectedLead.status && !trimmedComment) {
      showToast("A comment is required for every status change", "error");
      return;
    }

    // Validate that the selected status is allowed (can't go backward)
    if (!validNextStatuses.includes(statusSelect)) {
      showToast("You cannot change to a previous status", "error");
      return;
    }

    if (statusSelect === "Follow-up" && !selectedLead.followup1Date) {
      showToast(
        "Set the first follow-up date before moving the lead to Follow-up",
        "error",
      );
      return;
    }

    try {
      setIsUpdating(true);
      const response = await fetch("/api/staff_portal/update-lead", {
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
    const canAddLead = getPolicyAccess("user_add_lead", true);
    if (!canAddLead) {
      showToast("You do not have permission to add leads.", "error");
      return;
    }
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
      const response = await fetch("/api/staff_portal/add-lead", {
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

  const handleSaveLeadDetails = async () => {
    if (!selectedLead) return;

    // Prevent editing details for Registered or Lost leads
    if (
      selectedLead.status === "Registered" ||
      selectedLead.status === "Lost"
    ) {
      showToast("Cannot edit details of Registered or Lost leads", "error");
      return;
    }

    try {
      setIsUpdating(true);
      const pb = createPocketBaseClient();

      const trimmedName = editedName.trim();
      const trimmedCourse = editedCourse.trim();
      const trimmedEmail = editedEmail.trim();

      await pb.collection("leads").update(selectedLead.id, {
        studentName: trimmedName,
        course: trimmedCourse,
        email: trimmedEmail,
      });

      // Create history entries for each changed field
      const now = new Date().toISOString();
      const changedFields = [];

      if (trimmedName !== selectedLead.name) {
        changedFields.push({
          leadId: selectedLead.id,
          eventType: "Details Changed",
          changedBy: counselorId,
          oldValue: selectedLead.name,
          newValue: trimmedName,
          field: "studentName",
          created: now,
        });
      }

      if (trimmedCourse !== selectedLead.course) {
        changedFields.push({
          leadId: selectedLead.id,
          eventType: "Details Changed",
          changedBy: counselorId,
          oldValue: selectedLead.course,
          newValue: trimmedCourse,
          field: "course",
          created: now,
        });
      }

      if (trimmedEmail !== selectedLead.email) {
        changedFields.push({
          leadId: selectedLead.id,
          eventType: "Details Changed",
          changedBy: counselorId,
          oldValue: selectedLead.email || "",
          newValue: trimmedEmail,
          field: "email",
          created: now,
        });
      }

      // Record all changes in history
      for (const entry of changedFields) {
        await pb.collection("leadHistory").create(entry);
      }

      toast.success("Lead details updated");
      setIsEditingLeadDetails(false);
      await openLeadDetails(selectedLead, true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update lead",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveIndividualFollowup = async (followupNum: 1 | 2 | 3) => {
    if (!selectedLead) return;

    if (statusSelect === "New") {
      showToast("Cannot set follow-up date for leads in New status.", "error");
      return;
    }

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

      // Check if user has policy to modify existing follow-up dates
      const canEditFollowup = getPolicyAccess("user_edit_followup", false);

      if (!canEditFollowup && existingDate && existingDate !== newDate) {
        showToast(
          "Cannot modify existing follow-up dates. Contact admin.",
          "error",
        );
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
            changedBy: counselorId,
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
      await openLeadDetails(selectedLead, true);
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

  const handleSaveFollowupCompletion = async (followupNum: 1 | 2 | 3) => {
    if (!selectedLead) return;

    if (statusSelect === "New") {
      showToast(
        "Cannot toggle follow-up completion for leads in New status.",
        "error",
      );
      return;
    }

    try {
      setSavingFollowup(followupNum);
      const pb = createPocketBaseClient();

      // Get current completion state
      const completedMap = {
        1: followup1Completed,
        2: followup2Completed,
        3: followup3Completed,
      };
      const fieldName = `followup${followupNum}Completed`;
      const newCompleted = !completedMap[followupNum];

      // Update the completion status in database
      const updateData = { [fieldName]: newCompleted };
      await pb.collection("leads").update(selectedLead.id, updateData);

      // Update local state
      if (followupNum === 1) {
        setFollowup1Completed(newCompleted);
      } else if (followupNum === 2) {
        setFollowup2Completed(newCompleted);
      } else if (followupNum === 3) {
        setFollowup3Completed(newCompleted);
      }

      // Create history entry
      const now = new Date().toISOString();
      try {
        await pb.collection("leadHistory").create({
          leadId: selectedLead.id,
          eventType: "Follow-up Completed",
          changedBy: counselorId,
          oldValue: completedMap[followupNum] ? "Completed" : "Pending",
          newValue: newCompleted ? "Completed" : "Pending",
          field: fieldName,
          created: now,
        });
      } catch (err) {
        console.error("History logging failed:", err);
      }

      toast.success(
        `Follow-up ${followupNum} ${newCompleted ? "marked done" : "marked pending"}`,
      );

      // Refresh lead details
      await openLeadDetails(selectedLead, true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to save follow-up ${followupNum} status`,
      );
    } finally {
      setSavingFollowup(null);
    }
  };

  // Filter leads by status if a status filter is selected
  const [searchTerm, setSearchTerm] = useState("");
  const [taskSearchTerm, setTaskSearchTerm] = useState("");

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

  const displayedLeads =
    statusFilter === "Follow-up"
      ? [...filteredLeads].sort((a, b) => {
          const dateA = getLeadNextFollowupDate(a);
          const dateB = getLeadNextFollowupDate(b);

          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;

          return new Date(dateA).getTime() - new Date(dateB).getTime();
        })
      : filteredLeads;

  const totalPages = Math.max(1, Math.ceil(displayedLeads.length / PAGE_SIZE));
  const currentPage = Math.min(tablePage, totalPages);
  const paginatedLeads = displayedLeads.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const showAnimatedEmptyState = authReady && displayedLeads.length === 0;

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

  if (!authReady || isAccessLoading) {
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
    <AppShell
      title="Amazon College"
      subtitle={counselorName}
      headerRight={
        <div className="flex items-center gap-1.5 sm:gap-3">
          {(authUser?.role === "admin" ||
            authUser?.role === "super-admin" ||
            authUser?.role === "marketing-manager" ||
            authUser?.role === "admissions-head") && (
            <button
              onClick={() => router.push("/admin")}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-2 sm:px-3 sm:py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-all shadow-sm"
              title="Admin Panel"
            >
              <Shield className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="hidden sm:inline">Admin Panel</span>
            </button>
          )}
          <button
            onClick={() => {
              const pb = createPocketBaseClient();
              pb.authStore.clear();
              router.replace("/");
            }}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 p-2 sm:px-3 sm:py-2 text-sm font-medium hover:bg-slate-50 shadow-sm"
            title="Logout"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      }
    >
      {(leadsEnabled || tasksEnabled) && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex bg-slate-100/80 p-1 rounded-xl w-fit border border-slate-200/40 shrink-0">
            {leadsEnabled && (
              <button
                onClick={() => setActiveTab("leads")}
                className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "leads"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Leads Management
              </button>
            )}
            {tasksEnabled && (
              <button
                onClick={() => setActiveTab("tasks")}
                className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "tasks"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                My Tasks
              </button>
            )}
            <button
              onClick={() => setActiveTab("kpi")}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "kpi"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              My Scorecard
            </button>
          </div>

          {activeTab === "tasks" && tasksEnabled && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={taskSearchTerm}
                onChange={(e) => setTaskSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
                placeholder="Search tasks..."
              />
            </div>
          )}
        </div>
      )}

      {activeTab === "leads" && leadsEnabled ? (
        <>
          {canAddLead && (
            <button
              onClick={() => setAddLeadModalOpen(true)}
              className="fixed bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/25 transition hover:bg-teal-700 md:hidden"
            >
              + Add Lead
            </button>
          )}

          <div className="space-y-4">
        {/* Status Filter Tabs */}
        <div className="flex overflow-x-auto max-w-full pb-3 border-b border-slate-200 gap-2 scrollbar-none whitespace-nowrap [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0">
          <button
            onClick={() => setStatusFilter(null)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition shrink-0 ${
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
                className={`rounded-md px-3 py-2 text-sm font-medium transition shrink-0 ${
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
          {canAddLead && (
            <button
              onClick={() => setAddLeadModalOpen(true)}
              className="hidden rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 md:inline-flex"
            >
              + Add Lead
            </button>
          )}
        </div>

        {!authReady ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
            <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.2s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400 [animation-delay:-0.1s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-400" />
              </div>
            </div>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col">
            <div className="max-h-[calc(100vh-460px)] sm:max-h-[calc(100vh-320px)] overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="border-b border-slate-200 bg-white text-left text-slate-700 shadow-sm">
                    <tr>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Lead
                      </th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Mobile
                      </th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Course
                      </th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Next Follow-up
                      </th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Status
                      </th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Updated
                      </th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Action
                      </th>
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
                          {(() => {
                            const nextFollowup =
                              lead.nextFollowupDate &&
                              lead.nextFollowupDate.trim()
                                ? {
                                    date: lead.nextFollowupDate,
                                    completed:
                                      lead.nextFollowupCompleted || false,
                                  }
                                : getNextFollowup(lead);
                            if (!nextFollowup || !nextFollowup.date) {
                              return (
                                <span className="text-sm text-slate-400">
                                  -
                                </span>
                              );
                            }

                            const followupStatus = getFollowupStatus(
                              nextFollowup.date,
                              nextFollowup.completed || false,
                            );

                            return (
                              <span
                                className={`inline-flex rounded px-2 py-1 text-xs font-medium ${getFollowupStatusColor(followupStatus)}`}
                              >
                                {formatFollowupDateOnly(nextFollowup.date)}
                              </span>
                            );
                          })()}
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
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <div>
                Showing {(currentPage - 1) * PAGE_SIZE + 1} -{" "}
                {Math.min(currentPage * PAGE_SIZE, filteredLeads.length)} of{" "}
                {filteredLeads.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTablePage((page) => Math.max(1, page - 1))}
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

      {addLeadModalVisible && (
        <div
          className={`fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm px-0 transition-opacity duration-200 ease-out sm:items-center sm:px-4 ${
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
          className={`fixed inset-0 z-20 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm px-0 transition-opacity duration-200 ease-out sm:items-center sm:px-4 ${
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
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Lead Information
                  </h3>
                  <button
                    onClick={() => {
                      if (isEditingLeadDetails) {
                        setIsEditingLeadDetails(false);
                      } else {
                        setIsEditingLeadDetails(true);
                      }
                    }}
                    disabled={
                      selectedLead.status === "Registered" ||
                      selectedLead.status === "Lost"
                    }
                    className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Edit lead details"
                  >
                    {isEditingLeadDetails ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <Edit2 className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Name
                  </div>
                  {isEditingLeadDetails ? (
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      disabled={isUpdating}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  ) : (
                    <div className="mt-1 font-medium text-slate-900">
                      {selectedLead.name}
                    </div>
                  )}
                </div>

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
                  {isEditingLeadDetails ? (
                    <input
                      type="text"
                      value={editedCourse}
                      onChange={(e) => setEditedCourse(e.target.value)}
                      disabled={isUpdating}
                      placeholder="Enter course name"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  ) : (
                    <div className="mt-1 font-medium text-slate-900">
                      {selectedLead.course}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Email
                  </div>
                  {isEditingLeadDetails ? (
                    <input
                      type="email"
                      value={editedEmail}
                      onChange={(e) => setEditedEmail(e.target.value)}
                      disabled={isUpdating}
                      placeholder="Enter email address"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  ) : (
                    <div className="mt-1 break-all font-medium text-slate-900">
                      {selectedLead.email || "-"}
                    </div>
                  )}
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

                {isEditingLeadDetails && (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveLeadDetails}
                      disabled={isUpdating}
                      className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {isUpdating ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingLeadDetails(false);
                        setEditedName(selectedLead.name);
                        setEditedCourse(selectedLead.course);
                        setEditedEmail(selectedLead.email);
                      }}
                      disabled={isUpdating}
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Cancel
                    </button>
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
                        onClick={() => openLeadDetails(selectedLead, true)}
                        disabled={historyLoading}
                        className="inline-flex flex-1 items-center justify-center rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Refresh timeline
                      </button>
                    </div>
                  </div>
                </div>

                {selectedLead &&
                  (statusSelect === "Follow-up" ||
                    Boolean(
                      selectedLead.followup1Date ||
                      selectedLead.followup2Date ||
                      selectedLead.followup3Date,
                    )) && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">
                          Follow-ups
                        </h3>
                        <span className="text-xs text-slate-500">
                          {
                            [
                              followup1Date,
                              followup2Date,
                              followup3Date,
                            ].filter(Boolean).length
                          }
                          /3 set
                        </span>
                      </div>

                      <p className="mb-3 text-xs text-slate-500">
                        The first follow-up date is required before moving a
                        lead to Follow-up.
                      </p>

                      <div className="space-y-3">
                        {[
                          {
                            num: 1,
                            date: followup1Date,
                            setDate: setFollowup1Date,
                            completed: followup1Completed,
                            setCompleted: setFollowup1Completed,
                            savedDate: selectedLead?.followup1Date,
                            savedCompleted: selectedLead?.followup1Completed,
                          },
                          {
                            num: 2,
                            date: followup2Date,
                            setDate: setFollowup2Date,
                            completed: followup2Completed,
                            setCompleted: setFollowup2Completed,
                            savedDate: selectedLead?.followup2Date,
                            savedCompleted: selectedLead?.followup2Completed,
                            requiresPrevious: !followup1Completed,
                          },
                          {
                            num: 3,
                            date: followup3Date,
                            setDate: setFollowup3Date,
                            completed: followup3Completed,
                            setCompleted: setFollowup3Completed,
                            savedDate: selectedLead?.followup3Date,
                            savedCompleted: selectedLead?.followup3Completed,
                            requiresPrevious: !followup2Completed,
                          },
                        ].map((followup) => {
                          const status = getFollowupStatus(
                            followup.savedDate || "",
                            followup.savedCompleted || false,
                          );
                          const statusLabel =
                            status === "completed"
                              ? "Completed"
                              : status === "overdue"
                                ? "Overdue"
                                : status === "today"
                                  ? "Today"
                                  : status === "upcoming"
                                    ? "Soon"
                                    : "Scheduled";
                          const isAdmin =
                            authUser?.role === "admin" ||
                            authUser?.role === "super-admin" ||
                            authUser?.role === "marketing-manager" ||
                            authUser?.role === "admissions-head";
                          const isCounselorModifyingExisting =
                            !isAdmin && Boolean(followup.savedDate);
                          const isDisabled =
                            Boolean(followup.requiresPrevious) ||
                            isCounselorModifyingExisting;

                          // Check if date has been saved to the database
                          const isDateSaved =
                            followup.date ===
                            formatDateForInput(followup.savedDate);
                          // Check if there's an unsaved date change
                          const hasUnsavedDate = followup.date && !isDateSaved;

                          return (
                            <div
                              key={followup.num}
                              className="flex flex-col gap-2"
                            >
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-slate-600">
                                  Follow-up {followup.num}
                                  {isDisabled && followup.num > 1 && (
                                    <span className="ml-1 text-red-600">
                                      (requires follow-up {followup.num - 1}{" "}
                                      completion)
                                    </span>
                                  )}
                                </label>
                                {followup.savedDate && (
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${getFollowupStatusColor(status)}`}
                                  >
                                    {statusLabel}
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <input
                                  type="date"
                                  value={followup.date}
                                  onChange={(e) =>
                                    followup.setDate(e.target.value)
                                  }
                                  disabled={isUpdating || isDisabled}
                                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                                />
                                {hasUnsavedDate ? (
                                  <button
                                    onClick={() =>
                                      handleSaveIndividualFollowup(
                                        followup.num as 1 | 2 | 3,
                                      )
                                    }
                                    disabled={
                                      savingFollowup ===
                                      (followup.num as 1 | 2 | 3)
                                    }
                                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                  >
                                    {savingFollowup ===
                                    (followup.num as 1 | 2 | 3)
                                      ? "Setting..."
                                      : "Set"}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() =>
                                      handleSaveFollowupCompletion(
                                        followup.num as 1 | 2 | 3,
                                      )
                                    }
                                    disabled={
                                      !followup.savedDate ||
                                      savingFollowup ===
                                        (followup.num as 1 | 2 | 3) ||
                                      followup.completed
                                    }
                                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                                      followup.completed
                                        ? "bg-green-600 text-white cursor-not-allowed"
                                        : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                                    }`}
                                  >
                                    {savingFollowup ===
                                    (followup.num as 1 | 2 | 3)
                                      ? "Saving..."
                                      : followup.completed
                                        ? "✓ Done"
                                        : "Mark done"}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
                              {group.entries[0].eventType !== "Comment" &&
                                (group.entries[0].oldValue ||
                                  group.entries[0].newValue) && (
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
          className={`fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm px-0 transition-opacity duration-200 ease-out sm:items-center sm:px-4 ${
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
        </>
      ) : activeTab === "tasks" && tasksEnabled ? (
        <StaffTasks searchTerm={taskSearchTerm} />
      ) : activeTab === "kpi" ? (
        <StaffKPIScorecard />
      ) : (
        <div className="mx-auto max-w-md my-16 text-center bg-white border border-slate-100 rounded-3xl p-8 shadow-lg space-y-6">
          <div className="mx-auto w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 border border-rose-100">
            <AlertCircle className="h-8 w-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-slate-800 text-sm">Access Denied - No Allocated Sections</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Your account has not been assigned to any portal sections. Please contact your system administrator to configure your access overrides.
            </p>
          </div>
          <button
            onClick={() => {
              const pb = createPocketBaseClient();
              pb.authStore.clear();
              router.replace("/");
            }}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}
    </AppShell>
  );
}
