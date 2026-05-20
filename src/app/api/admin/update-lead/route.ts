import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

function normalizeLeadStatus(value: string | undefined): string {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "ringing-no-answer" || normalized === "ringing no answer") {
    return "Ringing-No-Answer";
  }
  if (normalized === "followup" || normalized === "follow-up") {
    return "Follow-up";
  }
  if (normalized === "new") return "New";
  if (normalized === "contacted") return "Contacted";
  if (normalized === "registered") return "Registered";
  if (normalized === "lost") return "Lost";
  return (value || "").trim();
}

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
};

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
    const oldStatus = normalizeLeadStatus(lead.status);
    const oldCounselor = lead.assignedTo;
    const now = new Date();
    const trimmedComment = adminComment?.trim();
    const users = (await pb.collection("users").getFullList({
      fields: "id,name,email",
    })) as UserRecord[];
    const userIdToName = new Map<string, string>();
    users.forEach((user) => {
      userIdToName.set(user.id, user.name || user.email || user.id);
    });
    const resolveUserName = (value?: string) => {
      const trimmedValue = value?.trim() || "";
      if (!trimmedValue) return "";
      return userIdToName.get(trimmedValue) || trimmedValue;
    };
    const actorName = adminName?.trim() || adminId?.trim() || "Unknown";

    const updates: Record<string, unknown> = {
      lastModified: now,
    };

    const normalizedNewStatus = normalizeLeadStatus(newStatus);

    if (normalizedNewStatus === "Follow-up" && !lead.followup1Date) {
      return NextResponse.json(
        {
          error:
            "Set the first follow-up date before moving the lead to Follow-up",
        },
        { status: 400 },
      );
    }

    if (normalizedNewStatus) {
      updates.status = normalizedNewStatus;
    }

    if (newCounselor) {
      updates.assignedTo = newCounselor;
    }

    if (trimmedComment) {
      updates.latestComment = trimmedComment;
    }

    // Update the lead
    await pb.collection("leads").update(lead.id, updates);

    const historyEntries: Array<Record<string, unknown>> = [];

    if (normalizedNewStatus && normalizedNewStatus !== oldStatus) {
      historyEntries.push({
        timeStamp: now,
        leadId: lead.id,
        studentName: lead.id,
        eventType: "Status Change",
        changedBy: adminId?.trim() || actorName,
        oldValue: oldStatus,
        newValue: normalizedNewStatus,
        comment: trimmedComment || undefined,
      });
    }

    if (newCounselor && newCounselor !== oldCounselor) {
      historyEntries.push({
        timeStamp: now,
        leadId: lead.id,
        studentName: lead.id,
        eventType: "Reassignment",
        changedBy: adminId?.trim() || actorName,
        oldValue: resolveUserName(oldCounselor),
        newValue: resolveUserName(newCounselor),
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
        changedBy: adminId?.trim() || actorName,
        comment: trimmedComment,
      });
    }

    for (const entry of historyEntries) {
      try {
        await pb.collection("leadHistory").create(entry);
      } catch (historyError) {
        console.error(
          "Lead history creation error:",
          historyError instanceof Error
            ? historyError.message
            : String(historyError),
        );
      }
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
