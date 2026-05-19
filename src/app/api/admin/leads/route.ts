import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  accountStatus?: string;
};

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
  leadStatus?: string;
  courseName?: string;
  leadSourceDetail?: string;
  created?: string;
  updated?: string;
};

function escapeFilterValue(value: string) {
  return value.replace(/"/g, '\\"');
}

export async function GET(request: NextRequest) {
  try {
    const pb = await getPocketBaseAdminClient();

    // Get all leads with optional filtering
    const statusFilter = request.nextUrl.searchParams.get("status");
    const counselorFilter = request.nextUrl.searchParams.get("counselor");
    const searchTerm = request.nextUrl.searchParams.get("search");
    const loadAll = request.nextUrl.searchParams.get("all") === "1";
    const page = request.nextUrl.searchParams.get("page") || "1";
    const limit = request.nextUrl.searchParams.get("limit") || "50";

    const users = (await pb.collection("users").getFullList({
      sort: "name",
      fields: "id,name,email,role,accountStatus",
    })) as UserRecord[];

    const userById = new Map(users.map((user) => [user.id, user]));
    const userByName = new Map(
      users.map((user) => [user.name || user.email || user.id, user]),
    );

    let filter = "";
    const filters: string[] = [];

    if (statusFilter) {
      const escapedStatus = escapeFilterValue(statusFilter);
      filters.push(`status = "${escapedStatus}"`);
    }

    if (counselorFilter) {
      const resolvedCounselor =
        userById.get(counselorFilter) || userByName.get(counselorFilter);
      const counselorValues = new Set<string>([
        counselorFilter,
        resolvedCounselor?.id || "",
        resolvedCounselor?.name || "",
        resolvedCounselor?.email || "",
      ]);
      const counselorFilterParts = Array.from(counselorValues)
        .filter(Boolean)
        .map((value) => `assignedTo = "${escapeFilterValue(value)}"`);

      if (counselorFilterParts.length > 0) {
        filters.push(`(${counselorFilterParts.join(" || ")})`);
      }
    }

    if (searchTerm) {
      const escapedSearch = escapeFilterValue(searchTerm);
      filters.push(
        `(` +
          `studentName ~ "${escapedSearch}" || ` +
          `mobile ~ "${escapedSearch}" || ` +
          `mobileWithCountry ~ "${escapedSearch}" || ` +
          `email ~ "${escapedSearch}" || ` +
          `course ~ "${escapedSearch}" || ` +
          `courseName ~ "${escapedSearch}"` +
          `)`,
      );
    }

    if (filters.length > 0) {
      filter = filters.join(" && ");
    }

    const leadsResult = loadAll
      ? await pb.collection("leads").getFullList({
          filter,
          sort: "-created",
        })
      : await pb.collection("leads").getList(parseInt(page), parseInt(limit), {
          filter,
          sort: "-created",
        });

    const leadItems = Array.isArray(leadsResult)
      ? leadsResult
      : leadsResult.items;

    const formattedLeads = leadItems.map((lead: LeadRecord) => ({
      id: lead.id,
      leadId: lead.leadId,
      studentName: lead.studentName,
      mobile: lead.mobileWithCountry || lead.mobile || "",
      mobileWithCountry: lead.mobileWithCountry || lead.mobile || "",
      countryCode: lead.countryCode || "+94",
      email: lead.email,
      course: lead.course || lead.courseName || "",
      courseName: lead.courseName || lead.course || "",
      leadSource: lead.leadSource,
      leadSourceDetail: lead.leadSourceDetail || "",
      status: lead.leadStatus || lead.status,
      assignedToId: lead.assignedTo || "",
      assignedToName:
        userById.get(lead.assignedTo || "")?.name ||
        userById.get(lead.assignedTo || "")?.email ||
        userByName.get(lead.assignedTo || "")?.name ||
        userByName.get(lead.assignedTo || "")?.email ||
        lead.assignedTo ||
        "",
      assignedTo:
        userById.get(lead.assignedTo || "")?.name ||
        userById.get(lead.assignedTo || "")?.email ||
        userByName.get(lead.assignedTo || "")?.name ||
        userByName.get(lead.assignedTo || "")?.email ||
        lead.assignedTo ||
        "",
      comments: lead.comments,
      followup1Date: (lead as any).followup1Date || null,
      followup1Completed: (lead as any).followup1Completed || false,
      followup2Date: (lead as any).followup2Date || null,
      followup2Completed: (lead as any).followup2Completed || false,
      followup3Date: (lead as any).followup3Date || null,
      followup3Completed: (lead as any).followup3Completed || false,
      created: lead.created,
      updated: lead.updated,
    }));

    if (loadAll) {
      return NextResponse.json({
        items: formattedLeads,
        page: 1,
        perPage: formattedLeads.length,
        totalItems: formattedLeads.length,
        totalPages: 1,
      });
    }

    const pagedLeads = leadsResult as {
      page: number;
      perPage: number;
      totalItems: number;
      totalPages: number;
    };

    return NextResponse.json({
      items: formattedLeads,
      page: pagedLeads.page,
      perPage: pagedLeads.perPage,
      totalItems: pagedLeads.totalItems,
      totalPages: pagedLeads.totalPages,
    });
  } catch (error) {
    // Handle abort errors gracefully - these are expected when client cancels
    if (
      error instanceof Error &&
      (error.message.includes("aborted") || error.message.includes("abort"))
    ) {
      return NextResponse.json(
        { items: [], page: 1, perPage: 50, totalItems: 0, totalPages: 0 },
        { status: 200 },
      );
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
