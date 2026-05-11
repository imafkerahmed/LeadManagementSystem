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
    const oldStatus = lead.status;
    const now = new Date().toISOString();

    const statusFlow = ["New", "Contacted", "Follow-up", "Registered", "Lost"];
    const oldIndex = statusFlow.indexOf(oldStatus);
    const newIndex = statusFlow.indexOf(newStatus);

    // Prevent updating terminal statuses (even comments should be disallowed)
    if (oldStatus === "Registered" || oldStatus === "Lost") {
      return NextResponse.json(
        { error: "Cannot update a lead that is Registered or Lost" },
        { status: 403 },
      );
    }

    type UserRoleRecord = {
      role?: string;
    };

    // Determine the requester's role from the app's users collection.
    // This matches the role source used by the login flow.
    let isAdmin = false;
    try {
      const userRecord = (await pb
        .collection("users")
        .getOne(counselorId)) as UserRoleRecord;
      isAdmin = userRecord.role === "admin";
    } catch {
      return NextResponse.json(
        { error: "Unable to verify user role" },
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

    // Require that the first status change from "New" must be to "Contacted"
    if (
      oldStatus === "New" &&
      newStatus !== "New" &&
      newStatus !== "Contacted" &&
      !isAdmin
    ) {
      return NextResponse.json(
        { error: "First status change from New must be to Contacted" },
        { status: 403 },
      );
    }

    // Prevent moving backward in the status flow for non-admins
    if (!isAdmin && newIndex < oldIndex) {
      return NextResponse.json(
        { error: "Cannot change to a previous status" },
        { status: 403 },
      );
    }

    // Update the lead: allow same-status updates (for comments) or forward moves
    const updatePayload: Record<string, unknown> = {
      latestComment: trimmedComment || "",
      updated: now,
    };

    if (oldStatus !== newStatus) {
      updatePayload.status = newStatus;
    }

    await pb.collection("leads").update(lead.id, updatePayload);

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
    }

    if (trimmedComment) {
      historyEntries.push({
        timeStamp: now,
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
        throw new Error(
          `Failed to log history: ${historyError instanceof Error ? historyError.message : String(historyError)}`,
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Updated successfully!",
      updatedStatus: oldStatus !== newStatus ? newStatus : oldStatus,
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
