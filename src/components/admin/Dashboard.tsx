"use client";

import { useState, useEffect, useCallback } from "react";
import { createPocketBaseClient } from "@/lib/pocketbase";
import {
  Users,
  UserPlus,
  PhoneOff,
  PhoneCall,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  BarChart3,
  UserCheck,
  Activity,
} from "lucide-react";

type LeadRecord = {
  id?: string;
  studentName?: string;
  created?: string;
  leadStatus?: string;
  status?: string;
  assignedTo?:
    | string
    | {
        id?: string;
        name?: string;
        email?: string;
      };
};

type UserLookupRecord = {
  id: string;
  name?: string;
  email?: string;
};

type HistoryRecord = {
  eventType?: string;
  changedBy?: string;
  leadId?: string;
  studentName?: string;
  created?: string;
  expand?: {
    studentName?: {
      studentName?: string;
    };
    leadId?: {
      id?: string;
      studentName?: string;
    };
    changedBy?: {
      name?: string;
      email?: string;
    };
  };
  changedByResolved?: string;
};

type RecentActivityItem = {
  studentName: string;
  eventType: string;
  changedBy: string;
  created: string;
};

type CounselorStat = {
  name: string;
  leadCount: number;
  newCount: number;
  ringingNoAnswerCount: number;
  contactedCount: number;
  followUpCount: number;
  registeredCount: number;
  lostCount: number;
};

type MonthlyStatusStat = {
  month: string;
  label: string;
  total: number;
  newCount: number;
  ringingNoAnswerCount: number;
  contactedCount: number;
  followUpCount: number;
  registeredCount: number;
  lostCount: number;
};

type MonthlyCounselorStats = Record<string, CounselorStat[]>;

interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  ringingNoAnswerLeads: number;
  contactedLeads: number;
  followUpLeads: number;
  registeredLeads: number;
  lostLeads: number;
  counselorStats: CounselorStat[];
  monthlyStatusStats: MonthlyStatusStat[];
  monthlyCounselorStats: MonthlyCounselorStats;
  recentActivity: RecentActivityItem[];
}

const ACTIVITY_PAGE_SIZE = 5;

const MONTH_LABEL_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  year: "numeric",
};

const normalizeStatus = (status?: string) => {
  const normalized = (status || "").trim().toLowerCase();
  if (normalized === "ringing-no-answer" || normalized === "ringing no answer" || normalized === "ringing_no_answer") {
    return "ringing-no-answer";
  }
  if (normalized === "followup" || normalized === "follow-up") {
    return "follow-up";
  }
  return normalized;
};

const matchesStatus = (status: string | undefined, target: string) =>
  normalizeStatus(status) === normalizeStatus(target);

const formatDate = (value?: string) => {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleDateString();
};

const getMonthKey = (value?: string) => {
  if (!value) return "unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getMonthLabel = (value: string) => {
  if (value === "unknown") return "Unknown";

  const [year, month] = value.split("-").map((part) => Number(part));
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(undefined, MONTH_LABEL_FORMAT);
};

const createEmptyCounselorStat = (name: string): CounselorStat => ({
  name,
  leadCount: 0,
  newCount: 0,
  ringingNoAnswerCount: 0,
  contactedCount: 0,
  followUpCount: 0,
  registeredCount: 0,
  lostCount: 0,
});

const emptyMonthlyStat = (month: string): MonthlyStatusStat => ({
  month,
  label: getMonthLabel(month),
  total: 0,
  newCount: 0,
  ringingNoAnswerCount: 0,
  contactedCount: 0,
  followUpCount: 0,
  registeredCount: 0,
  lostCount: 0,
});

const monthSort = (left: string, right: string) => {
  if (left === right) return 0;
  if (left === "unknown") return 1;
  if (right === "unknown") return -1;
  return left.localeCompare(right);
};

const resolveCounselorName = (
  lead: LeadRecord,
  userLookup: Map<string, string>,
) => {
  if (!lead.assignedTo) return "Unassigned";

  if (typeof lead.assignedTo !== "string") {
    return lead.assignedTo.name || lead.assignedTo.email || "Unassigned";
  }

  return userLookup.get(lead.assignedTo) || lead.assignedTo || "Unassigned";
};

const resolveCounselorKey = (lead: LeadRecord) => {
  if (!lead.assignedTo) return "Unassigned";

  if (typeof lead.assignedTo !== "string") {
    return (
      lead.assignedTo.id ||
      lead.assignedTo.name ||
      lead.assignedTo.email ||
      "Unassigned"
    );
  }

  return lead.assignedTo;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCounselor, setSelectedCounselor] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [activityPage, setActivityPage] = useState(1);

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const pb = createPocketBaseClient();

      const getLeads = async () => {
        try {
          return await pb.collection("leads").getFullList({
            sort: "-created",
            expand: "assignedTo",
          });
        } catch {
          return await pb.collection("leads").getFullList({
            sort: "-created",
          });
        }
      };

      const getHistory = async () => {
        try {
          return await pb.collection("leadHistory").getFullList({
            sort: "-created",
            expand: "changedBy,studentName,leadId",
          });
        } catch {
          return await pb.collection("leadHistory").getFullList({
            sort: "-created",
          });
        }
      };

      const [leads, history, userResponse, adminResponse, authUsersResponse] =
        await Promise.all([
          getLeads(),
          getHistory(),
          fetch("/api/users/lookup"),
          fetch("/api/admins/lookup"),
          fetch("/api/auth-users/lookup"),
        ]);

      const userLookup = new Map<string, string>();
      if (userResponse.ok) {
        const users = (await userResponse.json()) as UserLookupRecord[];
        users.forEach((user) => {
          userLookup.set(user.id, user.name || user.email || user.id);
        });
      }

      if (adminResponse && adminResponse.ok) {
        try {
          const admins = (await adminResponse.json()) as UserLookupRecord[];
          admins.forEach((a) => {
            userLookup.set(a.id, a.name || a.email || a.id);
          });
        } catch {
          // ignore parse errors
        }
      }

      if (authUsersResponse && authUsersResponse.ok) {
        try {
          const authUsers =
            (await authUsersResponse.json()) as UserLookupRecord[];
          authUsers.forEach((u) => {
            userLookup.set(u.id, u.name || u.email || u.id);
          });
        } catch {
          // ignore
        }
      }

      const leadRecords = leads as LeadRecord[];

      // Build a map of lead IDs to student names
      const leadIdToName = new Map<string, string>();
      leadRecords.forEach((lead) => {
        if (lead.id && lead.studentName) {
          leadIdToName.set(lead.id, lead.studentName);
        }
      });

      const totalLeads = leadRecords.length;
      const newLeads = leadRecords.filter((lead) =>
        matchesStatus(lead.leadStatus || lead.status, "New"),
      ).length;
      const ringingNoAnswerLeads = leadRecords.filter((lead) =>
        matchesStatus(lead.leadStatus || lead.status, "Ringing-No-Answer"),
      ).length;
      const contactedLeads = leadRecords.filter((lead) =>
        matchesStatus(lead.leadStatus || lead.status, "Contacted"),
      ).length;
      const followUpLeads = leadRecords.filter((lead) =>
        matchesStatus(lead.leadStatus || lead.status, "Follow-Up"),
      ).length;
      const registeredLeads = leadRecords.filter((lead) =>
        matchesStatus(lead.leadStatus || lead.status, "Registered"),
      ).length;
      const lostLeads = leadRecords.filter((lead) =>
        matchesStatus(lead.leadStatus || lead.status, "Lost"),
      ).length;

      const grouped: Record<string, CounselorStat> = {};
      const monthlyGrouped: Record<string, MonthlyStatusStat> = {};
      const monthlyCounselorGrouped: Record<
        string,
        Record<string, CounselorStat>
      > = {};

      leadRecords.forEach((lead) => {
        const monthKey = getMonthKey(lead.created);

        if (!monthlyGrouped[monthKey]) {
          monthlyGrouped[monthKey] = emptyMonthlyStat(monthKey);
        }

        if (!monthlyCounselorGrouped[monthKey]) {
          monthlyCounselorGrouped[monthKey] = {};
        }

        const monthlyStat = monthlyGrouped[monthKey];
        monthlyStat.total += 1;
        if (matchesStatus(lead.leadStatus || lead.status, "New"))
          monthlyStat.newCount += 1;
        if (matchesStatus(lead.leadStatus || lead.status, "Ringing-No-Answer")) {
          monthlyStat.ringingNoAnswerCount += 1;
        }
        if (matchesStatus(lead.leadStatus || lead.status, "Contacted")) {
          monthlyStat.contactedCount += 1;
        }
        if (matchesStatus(lead.leadStatus || lead.status, "Follow-Up")) {
          monthlyStat.followUpCount += 1;
        }
        if (matchesStatus(lead.leadStatus || lead.status, "Registered")) {
          monthlyStat.registeredCount += 1;
        }
        if (matchesStatus(lead.leadStatus || lead.status, "Lost")) {
          monthlyStat.lostCount += 1;
        }

        const counselorKey = resolveCounselorKey(lead);
        const counselorName = resolveCounselorName(lead, userLookup);

        if (!grouped[counselorKey]) {
          grouped[counselorKey] = createEmptyCounselorStat(counselorName);
        }

        if (!monthlyCounselorGrouped[monthKey][counselorKey]) {
          monthlyCounselorGrouped[monthKey][counselorKey] =
            createEmptyCounselorStat(counselorName);
        }

        grouped[counselorKey].leadCount += 1;
        monthlyCounselorGrouped[monthKey][counselorKey].leadCount += 1;
        if (matchesStatus(lead.leadStatus || lead.status, "New")) {
          monthlyCounselorGrouped[monthKey][counselorKey].newCount += 1;
          grouped[counselorKey].newCount += 1;
        }
        if (matchesStatus(lead.leadStatus || lead.status, "Ringing-No-Answer")) {
          monthlyCounselorGrouped[monthKey][counselorKey].ringingNoAnswerCount += 1;
          grouped[counselorKey].ringingNoAnswerCount += 1;
        }
        if (matchesStatus(lead.leadStatus || lead.status, "Contacted")) {
          monthlyCounselorGrouped[monthKey][counselorKey].contactedCount += 1;
          grouped[counselorKey].contactedCount += 1;
        }
        if (matchesStatus(lead.leadStatus || lead.status, "Follow-Up")) {
          monthlyCounselorGrouped[monthKey][counselorKey].followUpCount += 1;
          grouped[counselorKey].followUpCount += 1;
        }
        if (matchesStatus(lead.leadStatus || lead.status, "Registered")) {
          monthlyCounselorGrouped[monthKey][counselorKey].registeredCount += 1;
          grouped[counselorKey].registeredCount += 1;
        }
        if (matchesStatus(lead.leadStatus || lead.status, "Lost")) {
          monthlyCounselorGrouped[monthKey][counselorKey].lostCount += 1;
          grouped[counselorKey].lostCount += 1;
        }
      });

      const counselorStats = Object.values(grouped).sort((left, right) =>
        left.name.localeCompare(right.name),
      );

      const monthlyStatusStats = Object.values(monthlyGrouped).sort(
        (left, right) => monthSort(left.month, right.month),
      );

      const monthlyCounselorStats = Object.fromEntries(
        Object.entries(monthlyCounselorGrouped).map(([month, counselors]) => [
          month,
          Object.values(counselors).sort((left, right) =>
            left.name.localeCompare(right.name),
          ),
        ]),
      );

      const recentActivity = (history as HistoryRecord[])
        .slice(0, 20)
        .map((entry: HistoryRecord) => ({
          studentName:
            entry.expand?.leadId?.studentName ||
            leadIdToName.get(entry.expand?.leadId?.id || entry.leadId || "") ||
            entry.studentName ||
            "Unknown",
          eventType: entry.eventType || "update",
          changedBy:
            entry.changedByResolved ||
            entry.expand?.changedBy?.name ||
            entry.expand?.changedBy?.email ||
            userLookup.get(entry.changedBy || "") ||
            entry.changedBy ||
            "Unknown",
          created: entry.created || "",
        }));

      const data: DashboardStats = {
        totalLeads,
        newLeads,
        ringingNoAnswerLeads,
        contactedLeads,
        followUpLeads,
        registeredLeads,
        lostLeads,
        counselorStats,
        monthlyStatusStats,
        monthlyCounselorStats,
        recentActivity,
      };

      setStats(data);
    } catch (error) {
      if (error instanceof Error && error.message.includes("aborted")) {
        // Request was cancelled, don't show error
      } else {
        console.error(
          "Error fetching stats:",
          error instanceof Error ? error.message : String(error),
        );
        const defaultStats: DashboardStats = {
          totalLeads: 0,
          newLeads: 0,
          ringingNoAnswerLeads: 0,
          contactedLeads: 0,
          followUpLeads: 0,
          registeredLeads: 0,
          lostLeads: 0,
          counselorStats: [],
          monthlyStatusStats: [],
          monthlyCounselorStats: {},
          recentActivity: [],
        };
        setStats(defaultStats);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    const pb = createPocketBaseClient();
    
    pb.collection("leads").subscribe("*", () => {
      void fetchStats();
    });
    pb.collection("leadHistory").subscribe("*", () => {
      void fetchStats();
    });

    return () => {
      pb.collection("leads").unsubscribe("*");
      pb.collection("leadHistory").unsubscribe("*");
    };
  }, [fetchStats]);

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil((stats?.recentActivity.length || 0) / ACTIVITY_PAGE_SIZE),
    );

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivityPage((currentPage) => Math.min(currentPage, totalPages));
  }, [stats?.recentActivity.length]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivityPage(1);
  }, [selectedCounselor]);

  if (isLoading) {
    return (
      <div className="space-y-8">
        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-gray-200 animate-pulse rounded-lg p-6 h-24"
            />
          ))}
        </div>

        {/* Chart Skeleton */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="h-64 bg-gray-100 animate-pulse rounded-lg mb-4" />
          <div className="flex gap-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-3 w-3 rounded-sm bg-gray-300 animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6">
              <div className="h-8 bg-gray-200 animate-pulse rounded mb-4 w-1/3" />
              <div className="space-y-3">
                {[...Array(4)].map((_, j) => (
                  <div
                    key={j}
                    className="h-12 bg-gray-100 animate-pulse rounded"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-8">
        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-gray-200 animate-pulse rounded-lg p-6 h-24"
            />
          ))}
        </div>

        {/* Chart Skeleton */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="h-64 bg-gray-100 animate-pulse rounded-lg mb-4" />
          <div className="flex gap-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-3 w-3 rounded-sm bg-gray-300 animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6">
              <div className="h-8 bg-gray-200 animate-pulse rounded mb-4 w-1/3" />
              <div className="space-y-3">
                {[...Array(4)].map((_, j) => (
                  <div
                    key={j}
                    className="h-12 bg-gray-100 animate-pulse rounded"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Leads",
      value: stats.totalLeads,
      icon: Users,
      color: "blue",
      subtext: "Aggregated active records",
      gradient: "from-blue-500/10 via-blue-500/5 to-transparent",
      accent: "bg-blue-500",
      borderColor: "border-blue-100",
      iconColor: "text-blue-600 bg-blue-50",
    },
    {
      label: "New",
      value: stats.newLeads,
      icon: UserPlus,
      color: "sky",
      subtext: `${stats.totalLeads > 0 ? Math.round((stats.newLeads / stats.totalLeads) * 100) : 0}% of database`,
      gradient: "from-sky-500/10 via-sky-500/5 to-transparent",
      accent: "bg-sky-500",
      borderColor: "border-sky-100",
      iconColor: "text-sky-600 bg-sky-50",
    },
    {
      label: "Ringing No Answer",
      value: stats.ringingNoAnswerLeads,
      icon: PhoneOff,
      color: "indigo",
      subtext: `${stats.totalLeads > 0 ? Math.round((stats.ringingNoAnswerLeads / stats.totalLeads) * 100) : 0}% of database`,
      gradient: "from-indigo-500/10 via-indigo-500/5 to-transparent",
      accent: "bg-indigo-500",
      borderColor: "border-indigo-100",
      iconColor: "text-indigo-600 bg-indigo-50",
    },
    {
      label: "Contacted",
      value: stats.contactedLeads,
      icon: PhoneCall,
      color: "yellow",
      subtext: `${stats.totalLeads > 0 ? Math.round((stats.contactedLeads / stats.totalLeads) * 100) : 0}% of database`,
      gradient: "from-yellow-500/10 via-yellow-500/5 to-transparent",
      accent: "bg-yellow-500",
      borderColor: "border-yellow-100",
      iconColor: "text-yellow-600 bg-yellow-50",
    },
    {
      label: "Follow-Up",
      value: stats.followUpLeads,
      icon: Clock,
      color: "orange",
      subtext: `${stats.totalLeads > 0 ? Math.round((stats.followUpLeads / stats.totalLeads) * 100) : 0}% of database`,
      gradient: "from-orange-500/10 via-orange-500/5 to-transparent",
      accent: "bg-orange-500",
      borderColor: "border-orange-100",
      iconColor: "text-orange-600 bg-orange-50",
    },
    {
      label: "Registered",
      value: stats.registeredLeads,
      icon: CheckCircle,
      color: "green",
      subtext: `${stats.totalLeads > 0 ? Math.round((stats.registeredLeads / stats.totalLeads) * 100) : 0}% of database`,
      gradient: "from-green-500/10 via-green-500/5 to-transparent",
      accent: "bg-green-500",
      borderColor: "border-green-100",
      iconColor: "text-green-600 bg-green-50",
    },
    {
      label: "Lost",
      value: stats.lostLeads,
      icon: XCircle,
      color: "red",
      subtext: `${stats.totalLeads > 0 ? Math.round((stats.lostLeads / stats.totalLeads) * 100) : 0}% of database`,
      gradient: "from-red-500/10 via-red-500/5 to-transparent",
      accent: "bg-red-500",
      borderColor: "border-red-100",
      iconColor: "text-red-600 bg-red-50",
    },
  ];

  const counselorOptions = stats.counselorStats
    .map((counselor) => counselor.name)
    .filter((value, index, array) => array.indexOf(value) === index);

  const monthOptions = stats.monthlyStatusStats;

  const counselorStatsForMonth = selectedMonth
    ? stats.monthlyCounselorStats[selectedMonth] || []
    : stats.counselorStats;

  const filteredCounselorStats = selectedCounselor
    ? counselorStatsForMonth.filter(
        (counselor) => counselor.name === selectedCounselor,
      )
    : counselorStatsForMonth;

  const activityTotalPages = Math.max(
    1,
    Math.ceil(stats.recentActivity.length / ACTIVITY_PAGE_SIZE),
  );
  const activityStartIndex = (activityPage - 1) * ACTIVITY_PAGE_SIZE;
  const paginatedActivity = stats.recentActivity.slice(
    activityStartIndex,
    activityStartIndex + ACTIVITY_PAGE_SIZE,
  );

  const chartMax = Math.max(
    ...stats.monthlyStatusStats.map((entry) => entry.total),
    1,
  );

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          const isTotal = card.label === "Total Leads";
          return (
            <div
              key={card.label}
              className={`relative overflow-hidden bg-white border ${card.borderColor} rounded-2xl p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.01] flex flex-col justify-between group ${
                isTotal ? "lg:col-span-2" : ""
              }`}
            >
              {/* Subtle background glow */}
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${card.gradient} rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500`} />
              
              {/* Left-edge color bar accent */}
              <div className={`absolute left-0 top-0 bottom-0 w-[4px] ${card.accent}`} />
              
              <div className="flex items-start justify-between relative z-10">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {card.label}
                  </span>
                  <h4 className="text-3xl font-bold tracking-tight text-slate-800">
                    {card.value}
                  </h4>
                </div>
                <div className={`p-2.5 rounded-xl ${card.iconColor} transition-transform duration-300 group-hover:scale-110`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-xs text-slate-500 relative z-10">
                <span>{card.subtext}</span>
                {card.label === "Registered" && stats.totalLeads > 0 && (
                  <span className="flex items-center gap-1 text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-md">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Success
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly Status Bar Chart Widget */}
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 relative overflow-hidden transition-all duration-300 hover:shadow-md hover:scale-[1.005] group">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                Monthly Lead Status
              </h3>
              <p className="text-sm text-slate-400">
                Stacked monthly view of all lead statuses in the system.
              </p>
            </div>
          </div>
          <div className="text-xs font-semibold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
            Total Months: {stats.monthlyStatusStats.length}
          </div>
        </div>

        <div className="overflow-x-auto pb-4">
          <div className="min-w-max flex items-end gap-6 pt-6 px-2">
            {stats.monthlyStatusStats.length > 0 ? (
              stats.monthlyStatusStats.map((entry) => {
                const newHeight = (entry.newCount / chartMax) * 100;
                const ringingNoAnswerHeight = (entry.ringingNoAnswerCount / chartMax) * 100;
                const contactedHeight = (entry.contactedCount / chartMax) * 100;
                const followUpHeight = (entry.followUpCount / chartMax) * 100;
                const registeredHeight =
                  (entry.registeredCount / chartMax) * 100;
                const lostHeight = (entry.lostCount / chartMax) * 100;

                return (
                  <div
                    key={entry.month}
                    className="w-28 flex-shrink-0 text-center group/bar"
                  >
                    <div className="h-52 flex items-end rounded-2xl bg-slate-50/50 border border-slate-100 overflow-hidden shadow-inner p-1">
                      <div className="flex h-full w-full flex-col justify-end gap-[2px] rounded-xl overflow-hidden">
                        {entry.newCount > 0 && (
                          <div
                            className="bg-gradient-to-t from-blue-500 to-blue-400 rounded-sm transition-all duration-300 hover:brightness-110 cursor-pointer"
                            style={{ height: `${newHeight}%` }}
                            title={`New: ${entry.newCount}`}
                          />
                        )}
                        {entry.ringingNoAnswerCount > 0 && (
                          <div
                            className="bg-gradient-to-t from-indigo-500 to-indigo-400 rounded-sm transition-all duration-300 hover:brightness-110 cursor-pointer"
                            style={{ height: `${ringingNoAnswerHeight}%` }}
                            title={`Ringing No Answer: ${entry.ringingNoAnswerCount}`}
                          />
                        )}
                        {entry.contactedCount > 0 && (
                          <div
                            className="bg-gradient-to-t from-amber-500 to-amber-400 rounded-sm transition-all duration-300 hover:brightness-110 cursor-pointer"
                            style={{ height: `${contactedHeight}%` }}
                            title={`Contacted: ${entry.contactedCount}`}
                          />
                        )}
                        {entry.followUpCount > 0 && (
                          <div
                            className="bg-gradient-to-t from-orange-500 to-orange-400 rounded-sm transition-all duration-300 hover:brightness-110 cursor-pointer"
                            style={{ height: `${followUpHeight}%` }}
                            title={`Follow-Up: ${entry.followUpCount}`}
                          />
                        )}
                        {entry.registeredCount > 0 && (
                          <div
                            className="bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-sm transition-all duration-300 hover:brightness-110 cursor-pointer"
                            style={{ height: `${registeredHeight}%` }}
                            title={`Registered: ${entry.registeredCount}`}
                          />
                        )}
                        {entry.lostCount > 0 && (
                          <div
                            className="bg-gradient-to-t from-rose-500 to-rose-400 rounded-sm transition-all duration-300 hover:brightness-110 cursor-pointer"
                            style={{ height: `${lostHeight}%` }}
                            title={`Lost: ${entry.lostCount}`}
                          />
                        )}
                      </div>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-slate-700">
                      {entry.label}
                    </p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">{entry.total} leads</p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-400">
                No monthly lead data available.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-50 flex flex-wrap gap-4 text-xs font-medium text-slate-500">
          <span className="inline-flex items-center gap-1.5 bg-blue-50/50 px-2.5 py-1 rounded-full border border-blue-100/50">
            <span className="h-2 w-2 rounded-full bg-blue-500" /> New
          </span>
          <span className="inline-flex items-center gap-1.5 bg-indigo-50/50 px-2.5 py-1 rounded-full border border-indigo-100/50">
            <span className="h-2 w-2 rounded-full bg-indigo-500" /> Ringing No Answer
          </span>
          <span className="inline-flex items-center gap-1.5 bg-amber-50/50 px-2.5 py-1 rounded-full border border-amber-100/50">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Contacted
          </span>
          <span className="inline-flex items-center gap-1.5 bg-orange-50/50 px-2.5 py-1 rounded-full border border-orange-100/50">
            <span className="h-2 w-2 rounded-full bg-orange-500" /> Follow-Up
          </span>
          <span className="inline-flex items-center gap-1.5 bg-emerald-50/50 px-2.5 py-1 rounded-full border border-emerald-100/50">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Registered
          </span>
          <span className="inline-flex items-center gap-1.5 bg-rose-50/50 px-2.5 py-1 rounded-full border border-rose-100/50">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Lost
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {/* Lead Stats Table Widget */}
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 relative overflow-hidden transition-all duration-300 hover:shadow-md hover:scale-[1.005] group">
          <div className="flex flex-col gap-4 mb-6 pb-4 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">
                  Counselor Lead Stats
                </h3>
                <p className="text-sm text-slate-400">
                  Filter counselors and review their lead status breakdown.
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Counselor
                </label>
                <select
                  value={selectedCounselor}
                  onChange={(e) => setSelectedCounselor(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">All Counselors</option>
                  {counselorOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Month
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">All Months</option>
                  {monthOptions.map((entry) => (
                    <option key={entry.month} value={entry.month}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>Showing counselor stats for <strong className="text-slate-700 font-semibold">{selectedMonth ? getMonthLabel(selectedMonth) : "all months"}</strong>.</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-100 shadow-sm">{filteredCounselorStats.length} active</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 font-semibold rounded-l-xl">Counselor</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold text-right">New</th>
                  <th className="px-4 py-3 font-semibold text-right">Ringing</th>
                  <th className="px-4 py-3 font-semibold text-right">Contacted</th>
                  <th className="px-4 py-3 font-semibold text-right">Follow-Up</th>
                  <th className="px-4 py-3 font-semibold text-right">Registered</th>
                  <th className="px-4 py-3 font-semibold text-right rounded-r-xl">Lost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCounselorStats.length > 0 ? (
                  filteredCounselorStats.map((counselor) => (
                    <tr
                      key={counselor.name}
                      className="hover:bg-slate-50/50 transition-colors duration-200"
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                        {counselor.name}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-800">
                        {counselor.leadCount}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600 font-medium">
                        {counselor.newCount}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600 font-medium">
                        {counselor.ringingNoAnswerCount}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600 font-medium">
                        {counselor.contactedCount}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600 font-medium">
                        {counselor.followUpCount}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-emerald-600 font-semibold">
                        {counselor.registeredCount}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-rose-500 font-medium">
                        {counselor.lostCount}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-slate-400" colSpan={8}>
                      No counselor data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity Widget */}
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 relative overflow-hidden transition-all duration-300 hover:shadow-md hover:scale-[1.005] group">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6 pb-4 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">
                  Recent Activity Feed
                </h3>
                <p className="text-sm text-slate-400">
                  Paginated recent updates from lead history logs.
                </p>
              </div>
            </div>
            <div className="text-xs font-semibold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
              Page {activityPage} of {activityTotalPages}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 font-semibold rounded-l-xl">Date</th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Event Description</th>
                  <th className="px-4 py-3 font-semibold rounded-r-xl">Changed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedActivity.length > 0 ? (
                  paginatedActivity.map((activity, idx) => (
                    <tr
                      key={`${activity.created}-${idx}`}
                      className="hover:bg-slate-50/50 transition-colors duration-200"
                    >
                      <td className="px-4 py-3.5 text-sm text-slate-500 whitespace-nowrap font-mono text-xs">
                        {formatDate(activity.created)}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-slate-800">
                        {activity.studentName}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          activity.eventType?.includes("status") || activity.eventType?.includes("comment")
                            ? "bg-slate-100 text-slate-700"
                            : activity.eventType?.includes("created")
                              ? "bg-blue-50 text-blue-700"
                              : "bg-indigo-50 text-indigo-700"
                        }`}>
                          {activity.eventType}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-500 font-medium">
                        {activity.changedBy}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-slate-400" colSpan={4}>
                      No recent activity available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-50 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500">
            <p className="font-medium text-slate-400">
              Showing{" "}
              <strong className="text-slate-600">{Math.min(activityStartIndex + 1, stats.recentActivity.length)}</strong>
              -
              <strong className="text-slate-600">{Math.min(activityStartIndex + ACTIVITY_PAGE_SIZE, stats.recentActivity.length)}</strong>{" "}
              of <strong className="text-slate-600">{stats.recentActivity.length}</strong> entries
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActivityPage((page) => Math.max(1, page - 1))}
                disabled={activityPage === 1}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 shadow-sm transition-all animate-all"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  setActivityPage((page) =>
                    Math.min(activityTotalPages, page + 1),
                  )
                }
                disabled={activityPage === activityTotalPages}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 shadow-sm transition-all animate-all"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
