import { NextResponse } from "next/server";
import { createPocketBaseClient } from "@/lib/pocketbase";

type LeadRecord = {
  status?: string;
  assignedTo?: string;
};

type HistoryRecord = {
  eventType?: string;
  leadId?: string;
  studentName?: string;
  changedBy?: string;
  oldValue?: string;
  newValue?: string;
  comment?: string;
  created?: string;
};

export async function GET() {
  try {
    const pb = createPocketBaseClient();

    // Get all leads
    const allLeads = (await pb.collection("leads").getFullList({
      sort: "-created",
    })) as LeadRecord[];

    // Calculate stats
    const stats = {
      totalLeads: allLeads.length,
      newLeads: 0,
      contactedLeads: 0,
      followUpLeads: 0,
      registeredLeads: 0,
      lostLeads: 0,
      counselorStats: [] as Array<{
        name: string;
        leadCount: number;
        newCount: number;
        contactedCount: number;
      }>,
      recentActivity: [] as HistoryRecord[],
    };

    // Count by status
    const counselorMap = new Map<
      string,
      { total: number; new: number; contacted: number }
    >();

    allLeads.forEach((lead) => {
      switch (lead.status) {
        case "New":
          stats.newLeads++;
          break;
        case "Contacted":
          stats.contactedLeads++;
          break;
        case "Follow-up":
          stats.followUpLeads++;
          break;
        case "Registered":
          stats.registeredLeads++;
          break;
        case "Lost":
          stats.lostLeads++;
          break;
      }

      // Count by counselor
      const counselorKey = lead.assignedTo || "Unassigned";
      if (!counselorMap.has(counselorKey)) {
        counselorMap.set(counselorKey, { total: 0, new: 0, contacted: 0 });
      }

      const counselorData = counselorMap.get(counselorKey)!;
      counselorData.total++;

      if (lead.status === "New") counselorData.new++;
      if (lead.status === "Contacted") counselorData.contacted++;
    });

    // Convert counselor map to array
    counselorMap.forEach((value, key) => {
      stats.counselorStats.push({
        name: key,
        leadCount: value.total,
        newCount: value.new,
        contactedCount: value.contacted,
      });
    });

    // Get recent activity
    const recentHistory = (await pb.collection("leadHistory").getFullList({
      sort: "-created",
      limit: 10,
    })) as HistoryRecord[];

    stats.recentActivity = recentHistory.map((h) => ({
      eventType: h.eventType,
      leadId: h.leadId,
      studentName: h.studentName,
      changedBy: h.changedBy,
      oldValue: h.oldValue,
      newValue: h.newValue,
      comment: h.comment,
      created: h.created,
    }));

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 },
    );
  }
}
