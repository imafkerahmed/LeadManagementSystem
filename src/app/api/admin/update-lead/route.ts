import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      leadId,
      newStatus,
      newCounselor,
      adminComment,
      adminId,
      adminName,
    } = body;

    if (!leadId) {
      return NextResponse.json(
        { error: "Lead ID is required" },
        { status: 400 },
      );
    }

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
    const oldStatus = lead.status;
    const oldCounselor = lead.assignedTo;
    const now = new Date();
    const trimmedComment = adminComment?.trim();

    const updates: Record<string, unknown> = {
      lastModified: now,
    };

    if (newStatus) {
      updates.status = newStatus;
    }

    if (newCounselor) {
      updates.assignedTo = newCounselor;
    }

    if (trimmedComment) {
      updates.comments = trimmedComment;
    }

    // Update the lead
    await pb.collection("leads").update(lead.id, updates);

    const historyEntries: Array<Record<string, unknown>> = [];

    if (newStatus && newStatus !== oldStatus) {
      historyEntries.push({
        timeStamp: now,
        leadId: lead.id,
        studentName: lead.id,
        eventType: "Status Change",
        changedBy: adminId || adminName,
        oldValue: oldStatus,
        newValue: newStatus,
        comment: trimmedComment || undefined,
      });
    }

    if (newCounselor && newCounselor !== oldCounselor) {
      historyEntries.push({
        timeStamp: now,
        leadId: lead.id,
        studentName: lead.id,
        eventType: "Reassignment",
        changedBy: adminId || adminName,
        oldValue: oldCounselor,
        newValue: newCounselor,
        comment:
          historyEntries.length === 0 ? trimmedComment || undefined : undefined,
      });
    }

    if (historyEntries.length === 0 && trimmedComment) {
      historyEntries.push({
        timeStamp: now,
        leadId: lead.id,
        studentName: lead.id,
        eventType: "Comment",
        changedBy: adminId || adminName,
        comment: trimmedComment,
      });
    }

    for (const entry of historyEntries) {
      await pb.collection("leadHistory").create(entry);
    }

    return NextResponse.json({
      success: true,
      message: "Lead updated successfully",
    });
  } catch (error) {
    console.error("Error updating lead:", error);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 },
    );
  }
}
