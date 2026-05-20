import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";
import {
  aggregateDailyMetrics,
  getStartOfDay,
  getEndOfDay,
} from "@/lib/daily-reports";
import { DailyReportResponse } from "@/types";

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
    // Get date parameter, default to today
    const dateParam = request.nextUrl.searchParams.get("date");
    const targetDate = dateParam ? new Date(dateParam) : new Date();

    // Validate date is valid
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format. Use ISO date string (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const startOfDay = getStartOfDay(targetDate);
    const endOfDay = getEndOfDay(targetDate);

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

    // Format response
    const response: DailyReportResponse = {
      date: targetDate.toISOString().split("T")[0], // YYYY-MM-DD format
      reports,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching daily reports:", error);
    return NextResponse.json(
      { error: "Failed to fetch daily reports" },
      { status: 500 },
    );
  }
}
