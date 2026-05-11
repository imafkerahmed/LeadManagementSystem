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

function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    const json = JSON.parse(decoded);
    // PocketBase tokens have user data nested under a 'data' key
    return (json.data as Record<string, unknown>) || json;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Extract auth token from Authorization header
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    if (!token) {
      return NextResponse.json(
        { error: "Authentication is required" },
        { status: 401 },
      );
    }

    // Decode JWT to extract user identity
    const payload = decodeJWT(token);

    if (!payload?.id) {
      return NextResponse.json(
        { error: "Unable to determine user identity from token" },
        { status: 401 },
      );
    }

    const counselorId = payload.id as string;
    const counselorName = (payload.name as string) || "";
    const counselorEmail = (payload.email as string) || "";

    // Create PocketBase client for querying leads
    const pb = createPocketBaseClient();
    pb.authStore.save(token);

    // Build filter: filter by multiple identity variations (id, name, email)
    // This handles legacy data that may have used different identity formats
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
      assignedTo: lead.assignedTo || counselorId || "",
    }));

    return NextResponse.json(formattedLeads);
  } catch (error) {
    // Handle abort errors gracefully - these are expected when client cancels
    if (
      error instanceof Error &&
      (error.message.includes("aborted") || error.message.includes("abort"))
    ) {
      return NextResponse.json([], { status: 200 });
    }

    console.error(
      "Error fetching leads:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 },
    );
  }
}
