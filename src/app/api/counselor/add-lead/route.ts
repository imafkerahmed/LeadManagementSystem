import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

function generateLeadId(lastNum: number): string {
  return `AMZ/LEAD/${String(lastNum + 1).padStart(4, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentName, mobile, email, course, leadSource, counselorId } =
      body;

    if (!studentName || !mobile || !course || !counselorId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();

    // Get the last lead ID to generate new one
    const existingLeads = await pb.collection("leads").getFullList({
      sort: "-created",
      limit: 1,
    });

    let nextLeadId = "AMZ/LEAD/0001";
    if (existingLeads.length > 0) {
      const lastLead = existingLeads[0];
      const match = lastLead.leadId.match(/AMZ\/LEAD\/(\d+)/);
      if (match) {
        nextLeadId = generateLeadId(parseInt(match[1]));
      }
    }

    const now = new Date().toISOString();
    const leadPayload: Record<string, unknown> = {
      leadId: nextLeadId,
      studentName,
      mobileNo: mobile,
      courseName: course,
      leadSource,
      leadStatus: "New",
      assignedTo: counselorId,
      latestComment: "Lead created",
      addedDate: now,
      lastModified: now,
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
      console.error("Lead history creation error:", historyError);
      throw new Error(
        `Failed to log history: ${historyError instanceof Error ? historyError.message : String(historyError)}`,
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lead added successfully!",
      leadId: nextLeadId,
      recordId: newLead.id,
    });
  } catch (error) {
    console.error("Error adding lead:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to add lead",
      },
      { status: 500 },
    );
  }
}
