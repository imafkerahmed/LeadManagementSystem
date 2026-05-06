import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, newStatus, comment, counselorName, counselorId } = body;

    if (!leadId || !newStatus || (!counselorName && !counselorId)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const actorId = counselorId || counselorName;
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
    const now = new Date();

    // Update the lead
    await pb.collection("leads").update(lead.id, {
      leadStatus: newStatus,
      latestComment: trimmedComment || comment,
      lastModified: now,
    });

    const historyEntries: Array<Record<string, unknown>> = [];

    if (oldStatus !== newStatus) {
      historyEntries.push({
        timeStamp: now,
        leadId: lead.id,
        studentName: lead.id,
        eventType: "Status Change",
        changedBy: actorId,
        oldValue: oldStatus,
        newValue: newStatus,
        comment: trimmedComment || undefined,
      });
    } else if (trimmedComment) {
      historyEntries.push({
        timeStamp: now,
        leadId: lead.id,
        studentName: lead.id,
        eventType: "Comment",
        changedBy: actorId,
        comment: trimmedComment,
      });
    }

    for (const entry of historyEntries) {
      try {
        await pb.collection("leadHistory").create(entry);
      } catch (historyError) {
        console.warn("Lead history log skipped:", historyError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Updated successfully!",
    });
  } catch (error) {
    console.error("Error updating lead:", error);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 },
    );
  }
}
