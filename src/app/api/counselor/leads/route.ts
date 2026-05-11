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

    // Extract auth token from Authorization header
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    if (!token) {
      return NextResponse.json(
        { error: "Authentication is required" },
        { status: 401 },
      );
    }

    // Authenticate the PocketBase client with the user's token
    pb.authStore.save(token);

    // Get the authenticated user (counselor)
    const authUser = pb.authStore.model as {
      id?: string;
      name?: string;
      email?: string;
      role?: string;
    } | null;

    if (!authUser?.id) {
      return NextResponse.json(
        { error: "Unable to determine user identity from token" },
        { status: 401 },
      );
    }

    // Build filter: filter by multiple identity variations (id, name, email)
    // This handles legacy data that may have used different identity formats
    const assignedValues = [authUser.id, authUser.name, authUser.email]
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
      mobileWithCountry:
        lead.mobileWithCountry || lead.mobileNo || lead.mobile || "",
      email: lead.email,
      course: lead.course || lead.courseName || "",
      courseName: lead.courseName || lead.course || "",
      leadSource: lead.leadSource || "",
      leadSourceDetail: lead.leadSourceDetail || "",
      status: lead.leadStatus || lead.status || "",
      comments: lead.latestComment || "",
      created: lead.created || "",
      updated: lead.updated || lead.created || "",
      assignedTo:
        lead.assignedTo || authUser.id || "",
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
