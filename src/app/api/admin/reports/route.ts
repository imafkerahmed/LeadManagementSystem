import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

type LeadRecord = {
  id: string;
  studentName?: string;
  mobileWithCountry?: string;
  course?: string;
  courseName?: string;
  status?: string;
  assignedTo?: string;
  created?: string;
  updated?: string;
};

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
};

type HistoryRecord = {
  id?: string;
  eventType?: string;
  comment?: string;
  oldValue?: string;
  newValue?: string;
  created?: string;
  leadId?: string;
  changedBy?: string;
};

export async function GET(request: NextRequest) {
  try {
    const startDate = request.nextUrl.searchParams.get("startDate");
    const endDate = request.nextUrl.searchParams.get("endDate");
    const counselor = request.nextUrl.searchParams.get("counselor");
    const status = request.nextUrl.searchParams.get("status");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "Start and end dates are required" },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    // Build query filter
    const filters: string[] = [];
    filters.push(`created >= "${startIso}"`);
    filters.push(`created <= "${endIso}"`);

    if (counselor && counselor !== "all") {
      filters.push(`assignedTo = "${counselor}"`);
    }

    if (status && status !== "all") {
      filters.push(`status = "${status}"`);
    }

    const filter = filters.join(" && ");

    // Fetch leads using admin client
    const leads = (await pb.collection("leads").getFullList({
      filter,
      sort: "-created",
    })) as LeadRecord[];

    // Fetch all counselors for reference
    const counselors = (await pb
      .collection("users")
      .getFullList()) as UserRecord[];

    // Calculate statistics
    const stats = {
      totalLeads: leads.length,
      byStatus: {
        New: 0,
        Contacted: 0,
        "Follow-Up": 0,
        Registered: 0,
        Lost: 0,
      } as Record<string, number>,
      byCounselor: {} as Record<string, number>,
      enrollmentRate: 0,
      conversionRate: 0,
      avgLeadsPerCounselor: 0,
    };

    let enrolledCount = 0;
    const counselorIds = new Set<string>();

    leads.forEach((lead: LeadRecord) => {
      // Count by status
      if (lead.status) {
        stats.byStatus[lead.status] = (stats.byStatus[lead.status] || 0) + 1;
      }

      // Count registered
      if (lead.status === "Registered") {
        enrolledCount += 1;
      }

      // Count by counselor
      const counselorId = lead.assignedTo as string;
      if (counselorId) {
        stats.byCounselor[counselorId] =
          (stats.byCounselor[counselorId] || 0) + 1;
        counselorIds.add(counselorId);
      }
    });

    // Calculate rates
    if (leads.length > 0) {
      stats.enrollmentRate = Math.round((enrolledCount / leads.length) * 100);
      stats.conversionRate = Math.round((enrolledCount / leads.length) * 100);
    }

    if (counselorIds.size > 0) {
      stats.avgLeadsPerCounselor = Math.round(leads.length / counselorIds.size);
    }

    // stats calculated

    // Format leads for response
    const formattedLeads = leads.map((lead: LeadRecord) => {
      const assignedCounselor = counselors.find(
        (c) => c.id === lead.assignedTo,
      );
      return {
        id: lead.id,
        studentName: lead.studentName || "",
        mobileWithCountry: lead.mobileWithCountry || "",
        // Support both legacy and current schemas.
        course: lead.course || lead.courseName || "",
        status: lead.status || "",
        assignedTo: lead.assignedTo || "",
        assignedToName:
          assignedCounselor?.name || assignedCounselor?.email || "Unassigned",
        createdAt: lead.created || new Date().toISOString(),
        updatedAt: lead.updated || new Date().toISOString(),
      };
    });

    // Log first few leads to debug course field
    // sample lead omitted from logs in production

    // Fetch history for all leads in report
    const leadIds = leads.map((l) => l.id);
    let allHistory: Array<
      HistoryRecord & { studentName?: string; changedByName?: string }
    > = [];

    if (leadIds.length > 0) {
      try {
        const historyRecords = (await pb.collection("leadHistory").getFullList({
          filter: leadIds.map((id) => `leadId = "${id}"`).join(" || "),
          sort: "-created",
        })) as HistoryRecord[];

        // Get user map for history
        const userIdToName = new Map<string, string>();
        counselors.forEach((c) => {
          userIdToName.set(c.id, c.name || c.email || c.id);
        });

        const resolveUserValue = (value?: string) => {
          const trimmedValue = value?.trim() || "";
          if (!trimmedValue) return "";
          return userIdToName.get(trimmedValue) || trimmedValue;
        };

        allHistory = historyRecords.map((h) => {
          const leadData = leads.find((l) => l.id === h.leadId);
          return {
            ...h,
            studentName: leadData?.studentName || "Unknown",
            oldValue: resolveUserValue(h.oldValue),
            newValue: resolveUserValue(h.newValue),
            changedByName:
              userIdToName.get(h.changedBy || "") || h.changedBy || "Unknown",
          };
        });
      } catch (err) {
        console.error(
          "Error fetching lead history:",
          err instanceof Error ? err.message : String(err),
        );
        // Continue without history
      }
    }
    // report generated

    return NextResponse.json({
      leads: formattedLeads,
      counselors,
      stats,
      history: allHistory,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error generating report:", errorMessage);
    return NextResponse.json(
      { error: "Failed to generate report", details: errorMessage },
      { status: 500 },
    );
  }
}
