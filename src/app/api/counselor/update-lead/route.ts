import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, newStatus, comment, counselorId } = body;

    if (!leadId || !newStatus) {
      return NextResponse.json(
        { error: "Missing required fields: leadId or newStatus" },
        { status: 400 },
      );
    }

    if (!counselorId) {
      return NextResponse.json(
        { error: "Missing required field: counselorId" },
        { status: 400 },
      );
    }

    const trimmedComment = comment?.trim();

    const pb = await getPocketBaseAdminClient();

    // Find the lead
    const leads = await pb.collection("leads").getFullList({
      filter: `leadId = "${leadId}"`,
      limit: 1,
    });

    if (leads.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = leads[0];
    const oldStatus = lead.leadStatus;
    const now = new Date().toISOString();

    // Update the lead
    await pb.collection("leads").update(lead.id, {
      leadStatus: newStatus,
      latestComment: trimmedComment || "",
      lastModified: now,
    });

    const historyEntries: Array<Record<string, unknown>> = [];

    if (oldStatus !== newStatus) {
      historyEntries.push({
        timeStamp: now,
        leadId: lead.id,
        studentName: lead.id,
        eventType: "Status Change",
        changedBy: counselorId,
        oldValue: oldStatus,
        newValue: newStatus,
        comment: trimmedComment || "",
      });
    } else if (trimmedComment) {
      historyEntries.push({
        timeStamp: now,
        leadId: lead.id,
        studentName: lead.id,
        eventType: "Comment",
        changedBy: counselorId,
        comment: trimmedComment,
      });
    }

    for (const entry of historyEntries) {
      try {
        await pb.collection("leadHistory").create(entry);
      } catch (historyError) {
        console.error("Lead history creation error:", historyError);
        throw new Error(
          `Failed to log history: ${historyError instanceof Error ? historyError.message : String(historyError)}`,
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Updated successfully!",
    });
  } catch (error) {
    console.error("Error updating lead:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update lead",
      },
      { status: 500 },
    );
  }
}
