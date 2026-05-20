import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";
import {
  aggregateDailyMetrics,
  getStartOfDay,
  getEndOfDay,
} from "@/lib/daily-reports";
// DailyReportResponse not used here; response is built dynamically when debug is enabled

type LeadRecord = {
  id: string;
  studentName?: string;
  status?: string;
  assignedTo?: string;
  created?: string;
  updated?: string;
  followup1Completed?: boolean;
  followup2Completed?: boolean;
  followup3Completed?: boolean;
};

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
};

type HistoryRecord = {
  id?: string;
  eventType?: string;
  leadId?: string;
  changedBy?: string;
  oldValue?: string;
  newValue?: string;
  created?: string;
};

export async function GET(request: NextRequest) {
  try {
    const dateParam = request.nextUrl.searchParams.get("date");
    let targetDate: Date;
    if (dateParam) {
      const parts = dateParam.split("-");
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        targetDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
      } else {
        targetDate = new Date(dateParam);
      }
    } else {
      targetDate = new Date();
    }

    // Validate date is valid
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format. Use ISO date string (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    // Accept startOfDay and endOfDay from client to handle local timezone shifts perfectly
    const clientStartOfDay = request.nextUrl.searchParams.get("startOfDay");
    const clientEndOfDay = request.nextUrl.searchParams.get("endOfDay");

    const startOfDay = clientStartOfDay || getStartOfDay(targetDate);
    const endOfDay = clientEndOfDay || getEndOfDay(targetDate);

    const pb = await getPocketBaseAdminClient();

    // Fetch leads created on the target date (for daily metrics)
    const leadsToday = (await pb.collection("leads").getFullList({
      filter: `created >= "${startOfDay}" && created <= "${endOfDay}"`,
      sort: "-created",
    })) as LeadRecord[];

    // Fetch ALL leads (for overdue follow-up calculation across entire system)
    const allLeads = (await pb.collection("leads").getFullList({
      sort: "-created",
    })) as LeadRecord[];

    // Fetch lead history records for the target date (status changes, registrations, etc.)
    const history = (await pb.collection("leadHistory").getFullList({
      filter: `created >= "${startOfDay}" && created <= "${endOfDay}"`,
      sort: "-created",
    })) as HistoryRecord[];

    // Fetch all counselors (users) for reference
    const counselors = (await pb
      .collection("users")
      .getFullList()) as UserRecord[];

    // Aggregate metrics - pass allLeads for complete overdue calculation
    const reports = aggregateDailyMetrics(
      leadsToday,
      history,
      counselors,
      allLeads,
    );

    // If debug flag is present, also compute per-counselor lists of leadIds
    const debug = request.nextUrl.searchParams.get("debug");
    let reportsDebug: Record<string, { ringingLeadIds: string[] }> | undefined;
    if (debug === "true") {
      reportsDebug = {};
      // Build a quick lookup of leads by id
      const leadLookup = new Map<string, LeadRecord>();
      allLeads.forEach((l) => {
        if (l.id) leadLookup.set(l.id, l);
      });

      history.forEach((h) => {
        if (!h || h.eventType !== "Status Change") return;
        const leadId = h.leadId;
        if (!leadId) return;

        const newValue = (h.newValue || "").trim().toLowerCase();
        const isRinging =
          newValue === "ringing-no-answer" ||
          newValue === "ringing no answer" ||
          newValue === "ringing_no_answer";
        if (!isRinging) return;

        // Resolve counselor: prefer assignedTo on the lead record, fallback to changedBy
        let counselorId: string | undefined;
        const lead = leadLookup.get(leadId);
        if (lead && lead.assignedTo) counselorId = lead.assignedTo;
        if (!counselorId && h.changedBy) counselorId = h.changedBy;
        if (!counselorId) return;

        if (!reportsDebug![counselorId])
          reportsDebug![counselorId] = { ringingLeadIds: [] };
        if (!reportsDebug![counselorId].ringingLeadIds.includes(leadId)) {
          reportsDebug![counselorId].ringingLeadIds.push(leadId);
        }
      });
    }

    // Format response (typed without `any`)
    const response: {
      date: string;
      reports: typeof reports;
      reportsDebug?: Record<string, { ringingLeadIds: string[] }>;
    } = {
      date: targetDate.toISOString().split("T")[0], // YYYY-MM-DD format
      reports,
    };
    if (reportsDebug) response.reportsDebug = reportsDebug;

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching daily reports:", error);
    return NextResponse.json(
      { error: "Failed to fetch daily reports" },
      { status: 500 },
    );
  }
}
