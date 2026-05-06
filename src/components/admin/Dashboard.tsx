"use client";

import { useState, useEffect } from "react";
import { TrendingUp } from "lucide-react";

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
  recentActivity: any[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/admin/stats");
      const data = await response.json();

      // Handle error responses
      if (data.error || !data.counselorStats) {
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
      } else {
        setStats(data);
      }
    } catch (error) {
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
    } finally {
      setIsLoading(false);
    }
  };

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
    { label: "Follow-up", value: stats.followUpLeads, color: "orange" },
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
