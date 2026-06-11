import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

function normalizeLeadStatus(value: string | undefined): string {
  const normalized = (value || "").trim().toLowerCase();
  if (
    normalized === "ringing-no-answer" ||
    normalized === "ringing no answer"
  ) {
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
    const oldStatus = normalizeLeadStatus(lead.status);
    const normalizedNewStatus = normalizeLeadStatus(newStatus);
    const now = new Date().toISOString();

    const statusFlow = [
      "New",
      "Ringing-No-Answer",
      "Contacted",
      "Follow-up",
      "Registered",
      "Lost",
    ];
    const oldIndex = statusFlow.indexOf(oldStatus);
    const newIndex = statusFlow.indexOf(normalizedNewStatus);

    type UserRoleRecord = {
      role?: string;
    };

    // Determine the requester's role from the app's users collection.
    // This matches the role source used by the login flow.
    let userRecord: UserRoleRecord;
    let isAdmin = false;
    try {
      userRecord = (await pb
        .collection("users")
        .getOne(counselorId)) as UserRoleRecord;
      isAdmin =
        userRecord.role === "admin" ||
        userRecord.role === "super-admin" ||
        userRecord.role === "marketing-manager" ||
        userRecord.role === "admissions-head";
    } catch {
      return NextResponse.json(
        { error: "Unable to verify user role" },
        { status: 403 },
      );
    }

    // Check dynamic user_update_registered_lost access policy
    let canUpdateTerminal = false;
    try {
      const policy = await pb
        .collection("accessControl")
        .getFirstListItem(`sectionKey = "user_update_registered_lost"`);
      
      if (policy && policy.enabled !== false) {
        const denied = policy.deniedUsers || [];
        const allowed = policy.allowedUsers || [];
        const roles = policy.allowedRoles || [];
        
        canUpdateTerminal =
          !denied.includes(counselorId) &&
          (allowed.includes(counselorId) || roles.includes(userRecord.role || ""));
      }
    } catch {
      // Fallback to isAdmin role check if policy retrieval fails
      canUpdateTerminal = isAdmin;
    }

    // Prevent any updates to Registered or Lost leads for unauthorized users
    if ((oldStatus === "Registered" || oldStatus === "Lost") && !canUpdateTerminal) {
      return NextResponse.json(
        { error: "Cannot update Registered or Lost leads" },
        { status: 403 },
      );
    }

    // Prevent marking leads as Registered or Lost for unauthorized users
    if (
      (normalizedNewStatus === "Registered" || normalizedNewStatus === "Lost") &&
      oldStatus !== normalizedNewStatus &&
      !canUpdateTerminal
    ) {
      return NextResponse.json(
        { error: "Cannot mark leads as Registered or Lost" },
        { status: 403 },
      );
    }

    // Validate status indices
    if (oldIndex === -1 || newIndex === -1) {
      return NextResponse.json(
        { error: "Invalid status value provided" },
        { status: 400 },
      );
    }

    // Checked transition constraints
    if (normalizedNewStatus === "New") {
      return NextResponse.json(
        {
          error:
            "A lead in New status must be transitioned to a different status",
        },
        { status: 400 },
      );
    }

    if (normalizedNewStatus !== oldStatus && !trimmedComment) {
      return NextResponse.json(
        { error: "A comment is required for every status change" },
        { status: 400 },
      );
    }

    // Prevent moving backward in the status flow for non-admins
    if (!isAdmin && newIndex < oldIndex) {
      return NextResponse.json(
        { error: "Cannot change to a previous status" },
        { status: 403 },
      );
    }

    if (normalizedNewStatus === "Follow-up" && !lead.followup1Date) {
      return NextResponse.json(
        {
          error:
            "Set the first follow-up date before moving the lead to Follow-up",
        },
        { status: 400 },
      );
    }

    // Update the lead: allow same-status updates (for comments) or forward moves
    const updatePayload: Record<string, unknown> = {
      latestComment: trimmedComment || "",
      updated: now,
    };

    if (oldStatus !== normalizedNewStatus) {
      updatePayload.status = normalizedNewStatus;
    }

    await pb.collection("leads").update(lead.id, updatePayload);

    const historyEntries: Array<Record<string, unknown>> = [];

    if (oldStatus !== normalizedNewStatus) {
      historyEntries.push({
        timeStamp: now,
        created: now,
        leadId: lead.id,
        studentName: lead.id,
        eventType: "Status Change",
        changedBy: counselorId,
        oldValue: oldStatus,
        newValue: normalizedNewStatus,
        comment: trimmedComment || "",
      });
    }

    if (trimmedComment) {
      historyEntries.push({
        timeStamp: now,
        created: now,
        leadId: lead.id,
        studentName: lead.id,
        eventType: "Comment",
        changedBy: counselorId,
        oldValue: trimmedComment,
        newValue: trimmedComment,
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
      message: "Updated successfully!",
      updatedStatus:
        oldStatus !== normalizedNewStatus ? normalizedNewStatus : oldStatus,
      latestComment: trimmedComment || "",
    });
  } catch (error) {
    console.error(
      "Error updating lead:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update lead",
      },
      { status: 500 },
    );
  }
}
