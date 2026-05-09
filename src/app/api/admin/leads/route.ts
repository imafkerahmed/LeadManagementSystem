import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

type LeadRecord = {
  id: string;
  leadId?: string;
  studentName?: string;
  mobile?: string;
  mobileWithCountry?: string;
  countryCode?: string;
  email?: string;
  course?: string;
  leadSource?: string;
  status?: string;
  assignedTo?: string;
  comments?: string;
  created?: string;
  updated?: string;
};

export async function GET(request: NextRequest) {
  try {
    const pb = await getPocketBaseAdminClient();

    // Get all leads with optional filtering
    const statusFilter = request.nextUrl.searchParams.get("status");
    const counselorFilter = request.nextUrl.searchParams.get("counselor");
    const searchTerm = request.nextUrl.searchParams.get("search");
    const page = request.nextUrl.searchParams.get("page") || "1";
    const limit = request.nextUrl.searchParams.get("limit") || "50";

    let filter = "";
    const filters: string[] = [];

    if (statusFilter) {
      filters.push(`status = "${statusFilter}"`);
    }

    if (counselorFilter) {
      filters.push(`assignedTo = "${counselorFilter}"`);
    }

    if (searchTerm) {
      filters.push(
        `(studentName ~ "${searchTerm}" || mobile ~ "${searchTerm}" || email ~ "${searchTerm}")`,
      );
    }

    if (filters.length > 0) {
      filter = filters.join(" && ");
    }

    const leads = await pb
      .collection("leads")
      .getList(parseInt(page), parseInt(limit), {
        filter,
        sort: "-created",
      });

    const formattedLeads = leads.items.map((lead: LeadRecord) => ({
      id: lead.id,
      leadId: lead.leadId,
      studentName: lead.studentName,
      mobile: lead.mobileWithCountry || lead.mobile || "",
      mobileWithCountry: lead.mobileWithCountry || lead.mobile || "",
      countryCode: lead.countryCode || "+94",
      email: lead.email,
      course: lead.course,
      leadSource: lead.leadSource,
      status: lead.status,
      assignedTo: lead.assignedTo,
      comments: lead.comments,
      created: lead.created,
      updated: lead.updated,
    }));

    return NextResponse.json({
      items: formattedLeads,
      page: leads.page,
      perPage: leads.perPage,
      totalItems: leads.totalItems,
      totalPages: leads.totalPages,
    });
  } catch (error) {
    console.error("Error fetching leads:", error);
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 },
    );
  }
}
