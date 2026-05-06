"use client";

import { useState, useEffect, useCallback } from "react";
import { createPocketBaseClient } from "@/lib/pocketbase";

type LeadRecord = {
  leadStatus?: string;
  assignedTo?:
    | string
    | {
        name?: string;
      };
};

type HistoryRecord = {
  eventType?: string;
  changedBy?: string;
  created?: string;
  expand?: {
    studentName?: {
      studentName?: string;
    };
    leadId?: {
      studentName?: string;
    };
    changedBy?: {
      name?: string;
      email?: string;
    };
  };
};

type RecentActivityItem = {
  studentName: string;
  eventType: string;
  changedBy: string;
  created: string;
};

interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  followUpLeads: number;
  registeredLeads: number;
  lostLeads: number;
  counselorStats: Array<{
    name: string;
    leadCount: number;
    newCount: number;
    contactedCount: number;
  }>;
  recentActivity: RecentActivityItem[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const pb = createPocketBaseClient();
      const leads = (await pb
        .collection("leads")
        .getFullList({ sort: "-created" })) as LeadRecord[];

      const totalLeads = leads.length;
      const newLeads = leads.filter((lead) => lead.leadStatus === "New").length;
      const contactedLeads = leads.filter(
        (lead) => lead.leadStatus === "Contacted",
      ).length;
      const followUpLeads = leads.filter(
        (lead) => lead.leadStatus === "Follow-Up",
      ).length;
      const registeredLeads = leads.filter(
        (lead) => lead.leadStatus === "Registered",
      ).length;
      const lostLeads = leads.filter(
        (lead) => lead.leadStatus === "Lost",
      ).length;

      const grouped: Record<
        string,
        {
          name: string;
          leadCount: number;
          newCount: number;
          contactedCount: number;
        }
      > = {};
      leads.forEach((lead) => {
        const name =
          (lead.assignedTo &&
            (typeof lead.assignedTo === "string"
              ? lead.assignedTo
              : lead.assignedTo.name)) ||
          (typeof lead.assignedTo === "string" ? lead.assignedTo : undefined) ||
          "Unassigned";
        if (!grouped[name])
          grouped[name] = {
            name,
            leadCount: 0,
            newCount: 0,
            contactedCount: 0,
          };
        grouped[name].leadCount += 1;
        if (lead.leadStatus === "New") grouped[name].newCount += 1;
        if (lead.leadStatus === "Contacted") grouped[name].contactedCount += 1;
      });

      const counselorStats = Object.values(grouped);

      // recent activity from leadHistory collection
      const history = (await pb.collection("leadHistory").getFullList({
        sort: "-created",
        expand: "changedBy,studentName,leadId",
      })) as HistoryRecord[];
      const recentActivity = history.slice(0, 20).map((h) => ({
        studentName:
          h.expand?.studentName?.studentName ||
          h.expand?.leadId?.studentName ||
          "Unknown",
        eventType: h.eventType || "update",
        changedBy:
          h.expand?.changedBy?.name ||
          h.expand?.changedBy?.email ||
          h.changedBy ||
          "Unknown",
        created: h.created || "",
      }));

      const data: DashboardStats = {
        totalLeads,
        newLeads,
        contactedLeads,
        followUpLeads,
        registeredLeads,
        lostLeads,
        counselorStats,
        recentActivity,
      };

      setStats(data);
    } catch (error) {
      if (error instanceof Error && error.message.includes("aborted")) {
        // Request was cancelled, don't show error
        console.debug("Stats request cancelled");
      } else {
        console.error("Error fetching stats:", error);
        const defaultStats: DashboardStats = {
          totalLeads: 0,
          newLeads: 0,
          contactedLeads: 0,
          followUpLeads: 0,
          registeredLeads: 0,
          lostLeads: 0,
          counselorStats: [],
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

  if (isLoading) {
    return <div className="text-center py-12">Loading dashboard...</div>;
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-red-600">
        Failed to load dashboard
      </div>
    );
  }

  const statCards = [
    { label: "Total Leads", value: stats.totalLeads, color: "blue" },
    { label: "New", value: stats.newLeads, color: "blue" },
    { label: "Contacted", value: stats.contactedLeads, color: "yellow" },
    { label: "Follow-Up", value: stats.followUpLeads, color: "orange" },
    { label: "Registered", value: stats.registeredLeads, color: "green" },
    { label: "Lost", value: stats.lostLeads, color: "red" },
  ];

  const colorClasses: Record<string, string> = {
    blue: "text-blue-700",
    yellow: "text-yellow-700",
    orange: "text-orange-700",
    green: "text-green-700",
    red: "text-red-700",
  };

  const bgClasses: Record<string, string> = {
    blue: "bg-blue-50",
    yellow: "bg-yellow-50",
    orange: "bg-orange-50",
    green: "bg-green-50",
    red: "bg-red-50",
  };

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

      {/* Counselor Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Counselor Performance
        </h3>
        <div className="space-y-4">
          {stats.counselorStats && stats.counselorStats.length > 0 ? (
            stats.counselorStats.map((counselor) => {
              const maxLeads = Math.max(
                ...stats.counselorStats.map((c) => c.leadCount),
                1,
              );
              return (
                <div key={counselor.name} className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {counselor.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {counselor.newCount} new • {counselor.contactedCount}{" "}
                      contacted
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600"
                        style={{
                          width: `${(counselor.leadCount / maxLeads) * 100}%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">
                      {counselor.leadCount}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-gray-500">No counselor data available</p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Activity
        </h3>
        <div className="space-y-3">
          {stats.recentActivity && stats.recentActivity.length > 0 ? (
            stats.recentActivity.map((activity, idx) => (
              <div
                key={idx}
                className="py-3 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {activity.studentName}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {activity.eventType} by {activity.changedBy}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(activity.created).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}
