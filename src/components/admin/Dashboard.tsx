"use client";

import { useState, useEffect, useCallback } from "react";
import { createPocketBaseClient } from "@/lib/pocketbase";

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
    { label: "Total Leads", value: stats.totalLeads, color: "blue" },
    { label: "New", value: stats.newLeads, color: "blue" },
    { label: "Ringing No Answer", value: stats.ringingNoAnswerLeads, color: "indigo" },
    { label: "Contacted", value: stats.contactedLeads, color: "yellow" },
    { label: "Follow-Up", value: stats.followUpLeads, color: "orange" },
    { label: "Registered", value: stats.registeredLeads, color: "green" },
    { label: "Lost", value: stats.lostLeads, color: "red" },
  ];

  const colorClasses: Record<string, string> = {
    blue: "text-blue-700",
    indigo: "text-indigo-700",
    yellow: "text-yellow-700",
    orange: "text-orange-700",
    green: "text-green-700",
    red: "text-red-700",
  };

  const bgClasses: Record<string, string> = {
    blue: "bg-blue-50",
    indigo: "bg-indigo-50",
    yellow: "bg-yellow-50",
    orange: "bg-orange-50",
    green: "bg-green-50",
    red: "bg-red-50",
  };

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`${bgClasses[card.color]} rounded-lg p-6`}
          >
            <p className="text-sm font-medium text-gray-600">{card.label}</p>
            <p
              className={`text-3xl font-bold ${colorClasses[card.color]} mt-2`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Monthly Lead Status
            </h3>
            <p className="text-sm text-gray-500">
              Stacked monthly view of all lead statuses in the system.
            </p>
          </div>
          <div className="text-sm text-gray-500">
            Total months: {stats.monthlyStatusStats.length}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-max flex items-end gap-4 pb-2">
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
                    className="w-24 flex-shrink-0 text-center"
                  >
                    <div className="h-48 flex items-end rounded-xl bg-gray-50 border border-gray-200 overflow-hidden">
                      <div className="flex h-full w-full flex-col justify-end">
                        <div
                          className="bg-blue-500"
                          style={{ height: `${newHeight}%` }}
                          title={`New: ${entry.newCount}`}
                        />
                        <div
                          className="bg-indigo-500"
                          style={{ height: `${ringingNoAnswerHeight}%` }}
                          title={`Ringing No Answer: ${entry.ringingNoAnswerCount}`}
                        />
                        <div
                          className="bg-yellow-500"
                          style={{ height: `${contactedHeight}%` }}
                          title={`Contacted: ${entry.contactedCount}`}
                        />
                        <div
                          className="bg-orange-500"
                          style={{ height: `${followUpHeight}%` }}
                          title={`Follow-Up: ${entry.followUpCount}`}
                        />
                        <div
                          className="bg-green-500"
                          style={{ height: `${registeredHeight}%` }}
                          title={`Registered: ${entry.registeredCount}`}
                        />
                        <div
                          className="bg-red-500"
                          style={{ height: `${lostHeight}%` }}
                          title={`Lost: ${entry.lostCount}`}
                        />
                      </div>
                    </div>
                    <p className="mt-3 text-xs font-medium text-gray-700">
                      {entry.label}
                    </p>
                    <p className="text-xs text-gray-500">{entry.total} leads</p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-gray-500">
                No monthly lead data available.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-xs text-gray-600">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-blue-500" /> New
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-indigo-500" /> Ringing No Answer
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-yellow-500" /> Contacted
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-orange-500" /> Follow-Up
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-green-500" /> Registered
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-red-500" /> Lost
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Lead Stats
              </h3>
              <p className="text-sm text-gray-500">
                Filter counsellors and review their lead status breakdown.
              </p>
            </div>
            <div className="w-full md:w-64">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Counsellor
              </label>
              <select
                value={selectedCounselor}
                onChange={(e) => setSelectedCounselor(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">All Counsellors</option>
                {counselorOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4 w-full md:w-64">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              <option value="">All Months</option>
              {monthOptions.map((entry) => (
                <option key={entry.month} value={entry.month}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Showing counselor stats for{" "}
            {selectedMonth ? getMonthLabel(selectedMonth) : "all months"}.
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="border-b border-gray-200 px-3 py-3 font-medium">
                    Counsellor
                  </th>
                  <th className="border-b border-gray-200 px-3 py-3 font-medium text-right">
                    Total
                  </th>
                  <th className="border-b border-gray-200 px-3 py-3 font-medium text-right">
                    New
                  </th>
                  <th className="border-b border-gray-200 px-3 py-3 font-medium text-right">
                    Ringing No Answer
                  </th>
                  <th className="border-b border-gray-200 px-3 py-3 font-medium text-right">
                    Contacted
                  </th>
                  <th className="border-b border-gray-200 px-3 py-3 font-medium text-right">
                    Follow-Up
                  </th>
                  <th className="border-b border-gray-200 px-3 py-3 font-medium text-right">
                    Registered
                  </th>
                  <th className="border-b border-gray-200 px-3 py-3 font-medium text-right">
                    Lost
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCounselorStats.length > 0 ? (
                  filteredCounselorStats.map((counselor) => (
                    <tr
                      key={counselor.name}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="px-3 py-4 text-sm font-medium text-gray-900">
                        {counselor.name}
                      </td>
                      <td className="px-3 py-4 text-right text-sm text-gray-700">
                        {counselor.leadCount}
                      </td>
                      <td className="px-3 py-4 text-right text-sm text-gray-700">
                        {counselor.newCount}
                      </td>
                      <td className="px-3 py-4 text-right text-sm text-gray-700">
                        {counselor.ringingNoAnswerCount}
                      </td>
                      <td className="px-3 py-4 text-right text-sm text-gray-700">
                        {counselor.contactedCount}
                      </td>
                      <td className="px-3 py-4 text-right text-sm text-gray-700">
                        {counselor.followUpCount}
                      </td>
                      <td className="px-3 py-4 text-right text-sm text-gray-700">
                        {counselor.registeredCount}
                      </td>
                      <td className="px-3 py-4 text-right text-sm text-gray-700">
                        {counselor.lostCount}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-sm text-gray-500" colSpan={8}>
                      No counsellor data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Recent Activity
              </h3>
              <p className="text-sm text-gray-500">
                Paginated recent updates from lead history.
              </p>
            </div>
            <div className="text-sm text-gray-500">
              Page {activityPage} of {activityTotalPages}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="border-b border-gray-200 px-3 py-3 font-medium">
                    Date
                  </th>
                  <th className="border-b border-gray-200 px-3 py-3 font-medium">
                    Student
                  </th>
                  <th className="border-b border-gray-200 px-3 py-3 font-medium">
                    Event
                  </th>
                  <th className="border-b border-gray-200 px-3 py-3 font-medium">
                    Changed By
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedActivity.length > 0 ? (
                  paginatedActivity.map((activity, idx) => (
                    <tr
                      key={`${activity.created}-${idx}`}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="px-3 py-4 text-sm text-gray-700 whitespace-nowrap">
                        {formatDate(activity.created)}
                      </td>
                      <td className="px-3 py-4 text-sm font-medium text-gray-900">
                        {activity.studentName}
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-700">
                        {activity.eventType}
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-700">
                        {activity.changedBy}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-sm text-gray-500" colSpan={4}>
                      No recent activity available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              Showing{" "}
              {Math.min(activityStartIndex + 1, stats.recentActivity.length)}-
              {Math.min(
                activityStartIndex + ACTIVITY_PAGE_SIZE,
                stats.recentActivity.length,
              )}{" "}
              of {stats.recentActivity.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActivityPage((page) => Math.max(1, page - 1))}
                disabled={activityPage === 1}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() =>
                  setActivityPage((page) =>
                    Math.min(activityTotalPages, page + 1),
                  )
                }
                disabled={activityPage === activityTotalPages}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
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
