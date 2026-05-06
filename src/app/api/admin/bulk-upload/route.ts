import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

function generateLeadId(lastNum: number): string {
  return `AMZ/LEAD/${String(lastNum + 1).padStart(4, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      leads,
      assignmentMethod,
      singleCounselor,
      performedBy,
      performedByLabel,
    } = body;

    if (!leads || leads.length === 0) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    const pb = await getPocketBaseAdminClient();

    // Get the last lead ID
    const existingLeads = await pb.collection("leads").getFullList({
      sort: "-created",
      limit: 1,
    });

    let currentNum = 0;
    if (existingLeads.length > 0) {
      const lastLead = existingLeads[0];
      const match = lastLead.leadId.match(/AMZ\/LEAD\/(\d+)/);
      if (match) {
        currentNum = parseInt(match[1]);
      }
    }

    const now = new Date();
    let uploadedCount = 0;
    let failedCount = 0;
    const errors: Array<{ row: number; message: string }> = [];

    // Get list of counselors for round-robin
    const counselors = await pb.collection("users").getFullList({
      filter: 'role = "counselor"',
    });

    let currentCounselorIndex = 0;

    // Upload each lead
    for (let i = 0; i < leads.length; i++) {
      try {
        const lead = leads[i];

        // Validate required fields
        if (!lead.studentName || !lead.mobile || !lead.course) {
          errors.push({ row: i + 2, message: "Missing required fields" });
          failedCount++;
          continue;
        }

        // Determine assigned counselor
        let assignedCounselor = singleCounselor;

        if (assignmentMethod === "roundRobin" && counselors.length > 0) {
          assignedCounselor = counselors[currentCounselorIndex].name;
          currentCounselorIndex =
            (currentCounselorIndex + 1) % counselors.length;
        }

        if (!assignedCounselor) {
          errors.push({ row: i + 2, message: "No counselor assigned" });
          failedCount++;
          continue;
        }

        currentNum++;
        const leadId = generateLeadId(currentNum - 1);

        const initLog = JSON.stringify([
          {
            date: now.toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            author: "System",
            status: "New",
            text: "Lead imported",
          },
        ]);

        const createdLead = await pb.collection("leads").create({
          leadId,
          studentName: lead.studentName,
          mobile: lead.mobile,
          email: lead.email || "",
          course: lead.course,
          leadSource: lead.leadSource || "Bulk Upload",
          status: "New",
          assignedTo: assignedCounselor,
          comments: "",
          commentLog: initLog,
          lastModified: now,
        });

        try {
          await pb.collection("leadHistory").create({
            timeStamp: now,
            leadId: createdLead.id,
            studentName: createdLead.id,
            eventType: "Lead Created",
            changedBy: performedBy,
            newValue: "New",
            comment: `${performedByLabel || "Bulk Upload"} · ${
              assignmentMethod === "roundRobin"
                ? `Round Robin → ${assignedCounselor}`
                : `Single Counselor → ${assignedCounselor}`
            }`,
          });
        } catch (historyError) {
          console.warn("Lead history log skipped:", historyError);
        }

        uploadedCount++;
      } catch (error) {
        failedCount++;
        errors.push({
          row: i + 2,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      uploaded: uploadedCount,
      failed: failedCount,
      message: `${uploadedCount} leads uploaded successfully`,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error uploading leads:", error);
    return NextResponse.json(
      { error: "Failed to upload leads" },
      { status: 500 },
    );
  }
}
