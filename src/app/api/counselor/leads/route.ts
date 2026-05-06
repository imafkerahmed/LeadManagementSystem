import { NextRequest, NextResponse } from "next/server";
import { createPocketBaseClient } from "@/lib/pocketbase";

type LeadRecord = {
  leadId?: string;
  studentName?: string;
  mobileNo?: string;
  email?: string;
  courseName?: string;
  leadStatus?: string;
  latestComment?: string;
};

export async function GET(request: NextRequest) {
  try {
    const pb = createPocketBaseClient();

    // Get leads assigned to the logged-in counselor
    const counselorId = request.nextUrl.searchParams.get("counselorId");
    const counselorName = request.nextUrl.searchParams.get("counselor");

    if (!counselorId && !counselorName) {
      return NextResponse.json(
        { error: "Counselor identity is required" },
        { status: 400 },
      );
    }

    const assignedValue = counselorId || counselorName;

    const leads = (await pb.collection("leads").getFullList({
      filter: `assignedTo = "${assignedValue}" && (leadStatus = "New" || leadStatus = "Contacted" || leadStatus = "Follow-Up")`,
      sort: "-created",
    })) as LeadRecord[];

    const formattedLeads = leads.map((lead) => ({
      leadId: lead.leadId,
      name: lead.studentName,
      mobile: lead.mobileNo,
      email: lead.email,
      course: lead.courseName,
      status: lead.leadStatus,
      comments: lead.latestComment || "",
      commentLog: [],
    }));

    return NextResponse.json(formattedLeads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 },
    );
  }
}
