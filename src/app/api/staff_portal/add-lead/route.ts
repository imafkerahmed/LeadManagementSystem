import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

function generateLeadId(lastNum: number): string {
  return `AMZ/LEAD/${String(lastNum + 1).padStart(4, "0")}`;
}

function normalizeCountryCode(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, "");
  return trimmed.startsWith("+")
    ? `+${trimmed.slice(1).replace(/[^\d]/g, "")}`
    : `+${trimmed.replace(/[^\d]/g, "")}`;
}

function normalizeMobile(value: string): string {
  return value.trim().replace(/\D/g, "").replace(/^0+/, "");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      studentName,
      countryCode,
      mobile,
      email,
      course,
      leadSource,
      leadSourceDetail,
      counselorId,
    } = body;

    if (!studentName || !countryCode || !mobile || !course || !counselorId) {
      return NextResponse.json(
        {
          error:
            "Missing required fields (studentName, countryCode, mobile, course, counselorId)",
        },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();

    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const normalizedMobile = normalizeMobile(mobile);

    // Create a canonical phone value for uniqueness checks and storage.
    const mobileWithCountry = `${normalizedCountryCode}${normalizedMobile}`;
    const legacyMobileWithCountry = `${normalizedCountryCode}-${normalizedMobile}`;

    let duplicateDetected = false;
    let duplicateLead: {
      leadId?: string;
      studentName?: string;
      mobile?: string;
      mobileWithCountry?: string;
      status?: string;
      assignedTo?: string;
      assigneeName?: string;
    } | null = null;

    // Check for existing lead with same mobile+country
    const existingLeads = await pb.collection("leads").getFullList({
      filter: `(mobileWithCountry = "${mobileWithCountry}" || mobileWithCountry = "${legacyMobileWithCountry}")`,
    });

    if (existingLeads.length > 0) {
      duplicateDetected = true;
      const existing = existingLeads[0];
      // Fetch assignee info
      let assigneeName = existing.assignedTo;
      try {
        const assignee = await pb
          .collection("users")
          .getOne(existing.assignedTo);
        assigneeName = assignee.name || assignee.email || existing.assignedTo;
      } catch {
        // If user lookup fails, just use ID
      }

      duplicateLead = {
        leadId: existing.leadId,
        studentName: existing.studentName,
        mobile: existing.mobile,
        mobileWithCountry: existing.mobileWithCountry,
        status: existing.status,
        assignedTo: existing.assignedTo,
        assigneeName,
      };

      // For counsellors we do NOT create a new lead when a duplicate exists.
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate lead exists",
          duplicateDetected: true,
          existingLead: duplicateLead,
        },
        { status: 409 },
      );
    }

    // Get the last lead ID to generate new one
    const allLeads = await pb.collection("leads").getFullList({
      sort: "-created",
      limit: 1,
    });

    let nextLeadId = "AMZ/LEAD/0001";
    if (allLeads.length > 0) {
      const lastLead = allLeads[0];
      const match = lastLead.leadId.match(/AMZ\/LEAD\/(\d+)/);
      if (match) {
        nextLeadId = generateLeadId(parseInt(match[1]));
      }
    }

    const now = new Date().toISOString();
    const leadPayload: Record<string, unknown> = {
      leadId: nextLeadId,
      studentName,
      countryCode: normalizedCountryCode,
      mobile: normalizedMobile,
      mobileWithCountry,
      email,
      course: course,
      courseName: course,
      leadSource,
      leadSourceDetail: leadSourceDetail || "",
      status: "New",
      assignedTo: counselorId,
      latestComment: "Lead created",
      created: now,
      updated: now,
    };

    const trimmedEmail = email?.trim();
    if (trimmedEmail) {
      leadPayload.email = trimmedEmail;
    }

    // Create new lead
    const newLead = await pb.collection("leads").create(leadPayload);

    // Log to history
    try {
      await pb.collection("leadHistory").create({
        timeStamp: now,
        leadId: newLead.id,
        studentName: newLead.id,
        eventType: "Lead Created",
        changedBy: counselorId,
        newValue: "New",
        comment: `Source: ${leadSource}`,
      });
    } catch (historyError) {
      console.error(
        "Lead history creation error:",
        historyError instanceof Error
          ? historyError.message
          : String(historyError),
      );
      throw new Error(
        `Failed to log history: ${historyError instanceof Error ? historyError.message : String(historyError)}`,
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lead added successfully!",
      leadId: nextLeadId,
      recordId: newLead.id,
      duplicateDetected,
      existingLead: duplicateLead,
    });
  } catch (error) {
    console.error(
      "Error adding lead:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to add lead",
      },
      { status: 500 },
    );
  }
}
