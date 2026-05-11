import { NextRequest, NextResponse } from "next/server";
import { createPocketBaseClient } from "@/lib/pocketbase";

type LeadRecord = {
  id?: string;
  leadId?: string;
  studentName?: string;
  countryCode?: string;
  mobileNo?: string;
  mobile?: string;
  mobileWithCountry?: string;
  email?: string;
  course?: string;
  courseName?: string;
  leadSource?: string;
  leadSourceDetail?: string;
  status?: string;
  leadStatus?: string;
  latestComment?: string;
  created?: string;
  updated?: string;
  assignedTo?: string;
};

function escapeFilterValue(value: string) {
  return value.replace(/"/g, '\\"');
}

export async function GET(request: NextRequest) {
  try {
    const pb = createPocketBaseClient();

    // Get leads assigned to the logged-in counselor
    const counselorId = request.nextUrl.searchParams.get("counselorId");
    const counselorName = request.nextUrl.searchParams.get("counselor");
    const counselorEmail = request.nextUrl.searchParams.get("counselorEmail");

    if (!counselorId && !counselorName && !counselorEmail) {
      return NextResponse.json(
        { error: "Counselor identity is required" },
        { status: 400 },
      );
    }

    const assignedValues = [counselorId, counselorName, counselorEmail]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .map((value) => `assignedTo = "${escapeFilterValue(value)}"`);

    const leads = (await pb.collection("leads").getFullList({
      filter:
        `(${assignedValues.join(" || ")}) && ` +
        `(status = "New" || status = "Contacted" || status = "Follow-Up")`,
      sort: "-created",
    })) as LeadRecord[];

    const formattedLeads = leads.map((lead) => ({
      id: lead.id,
      leadId: lead.leadId,
      studentName: lead.studentName,
      countryCode: lead.countryCode || "+94",
      mobile: lead.mobileWithCountry || lead.mobileNo || lead.mobile || "",
      mobileWithCountry: lead.mobileWithCountry || lead.mobileNo || lead.mobile || "",
      email: lead.email,
      course: lead.course || lead.courseName || "",
      courseName: lead.courseName || lead.course || "",
      leadSource: lead.leadSource || "",
      leadSourceDetail: lead.leadSourceDetail || "",
      status: lead.leadStatus || lead.status || "",
      comments: lead.latestComment || "",
      created: lead.created || "",
      updated: lead.updated || lead.created || "",
      assignedTo: lead.assignedTo || counselorId || counselorName || counselorEmail || "",
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
