import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

type ManagedUserRecord = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  accountStatus?: string;
};

type LeadRecord = {
  id: string;
  leadId?: string;
  assignedTo?: string;
  studentName?: string;
  status?: string;
};

type UserLabelRecord = {
  id: string;
  name?: string;
  email?: string;
};

const AUTH_COLLECTION = "_pb_users_auth_";

function escapeFilterValue(value: string) {
  return value.replace(/"/g, '\\"');
}

function normalizeRole(role?: string) {
  const normalized = (role || "").trim().toLowerCase();
  if (normalized === "counselor") {
    return "student-counsellor";
  }
  return normalized || "student-counsellor";
}

function normalizeStatus(status?: string) {
  const normalized = (status || "").trim().toLowerCase();
  if (normalized === "active") return "enabled";
  if (normalized === "disabled") return "disabled";
  return "enabled";
}

function buildAssigneeFilter(user: ManagedUserRecord) {
  const values = Array.from(
    new Set([user.id, user.name || "", user.email || ""]).values(),
  ).filter(Boolean);

  const parts = values.map(
    (value) => `assignedTo = "${escapeFilterValue(value)}"`,
  );

  if (parts.length === 0) {
    return "id = ''";
  }

  return `(${parts.join(" || ")})`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = (searchParams.get("userId") || "").trim();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();
    const user = (await pb
      .collection(AUTH_COLLECTION)
      .getOne(userId)) as ManagedUserRecord;

    const assignmentFilter = buildAssigneeFilter(user);
    const assignedLeads = (await pb.collection("leads").getFullList({
      filter: assignmentFilter,
      fields: "id,status",
    })) as LeadRecord[];

    const statusCounts: Record<string, number> = {
      "New": 0,
      "Ringing-No-Answer": 0,
      "Contacted": 0,
      "Follow-up": 0,
      "Registered": 0,
      "Lost": 0,
    };

    assignedLeads.forEach((lead) => {
      const status = lead.status || "New";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      assignedLeadCount: assignedLeads.length,
      statusCounts,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch lead status counts";
    console.error("Error fetching lead status counts:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      transferToUserId?: string; // legacy single select
      transferToUserIds?: string[]; // new multi select
      selectedStatuses?: string[]; // new status filter
      adminId?: string;
      adminName?: string;
    };

    const userId = (body.userId || "").trim();
    const adminId = (body.adminId || "").trim();
    const adminName = (body.adminName || "").trim();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    if (adminId && adminId === userId) {
      return NextResponse.json(
        { error: "You cannot disable your own account" },
        { status: 403 },
      );
    }

    // Resolve targetUserIds, keeping compatibility with single transferToUserId
    let targetUserIds: string[] = [];
    if (body.transferToUserIds && Array.isArray(body.transferToUserIds)) {
      targetUserIds = body.transferToUserIds.map((id) => id.trim()).filter(Boolean);
    } else if (body.transferToUserId) {
      targetUserIds = [body.transferToUserId.trim()].filter(Boolean);
    }

    if (targetUserIds.includes(userId)) {
      return NextResponse.json(
        { error: "Lead transfer targets cannot include the user being disabled" },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();

    const userLabels = (await pb.collection("users").getFullList({
      fields: "id,name,email",
    })) as UserLabelRecord[];
    const userIdToName = new Map<string, string>();
    userLabels.forEach((item) => {
      userIdToName.set(item.id, item.name || item.email || item.id);
    });
    const resolveName = (value?: string) => {
      const trimmed = value?.trim() || "";
      if (!trimmed) return "Unknown";
      return userIdToName.get(trimmed) || trimmed;
    };
    const user = (await pb
      .collection(AUTH_COLLECTION)
      .getOne(userId)) as ManagedUserRecord;

    const isAlreadyDisabled = normalizeStatus(user.accountStatus) === "disabled";

    const assignmentFilter = buildAssigneeFilter(user);
    const assignedLeads = (await pb.collection("leads").getFullList({
      filter: assignmentFilter,
      fields: "id,leadId,assignedTo,studentName,status",
    })) as LeadRecord[];

    // Filter leads to reassign based on selectedStatuses
    const selectedStatuses = body.selectedStatuses;
    const leadsToTransfer =
      selectedStatuses && Array.isArray(selectedStatuses)
        ? assignedLeads.filter((lead) => selectedStatuses.includes(lead.status || "New"))
        : assignedLeads;

    if (isAlreadyDisabled && leadsToTransfer.length === 0) {
      return NextResponse.json({
        success: true,
        message: "User is already disabled and has no matching leads to transfer",
        transferredCount: 0,
        assignedLeadCount: assignedLeads.length,
        matchingLeadCount: 0,
      });
    }

    if (leadsToTransfer.length > 0 && targetUserIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "This user has assigned leads matching the selected statuses. Provide transferToUserIds to transfer leads before disabling.",
          requiresTransfer: true,
          assignedLeadCount: assignedLeads.length,
          matchingLeadCount: leadsToTransfer.length,
        },
        { status: 409 },
      );
    }

    const targetUsers: ManagedUserRecord[] = [];
    if (targetUserIds.length > 0) {
      for (const tId of targetUserIds) {
        const tUser = (await pb
          .collection(AUTH_COLLECTION)
          .getOne(tId)) as ManagedUserRecord;

        const targetRole = normalizeRole(tUser.role);
        const targetStatus = normalizeStatus(tUser.accountStatus);

        if (targetRole !== "student-counsellor") {
          return NextResponse.json(
            { error: `Lead transfer target ${resolveName(tId)} must be a student-counsellor` },
            { status: 400 },
          );
        }

        if (targetStatus !== "enabled") {
          return NextResponse.json(
            { error: `Lead transfer target ${resolveName(tId)} must be enabled` },
            { status: 400 },
          );
        }

        targetUsers.push(tUser);
      }
    }

    let transferredCount = 0;
    const now = new Date().toISOString();

    if (targetUsers.length > 0 && leadsToTransfer.length > 0) {
      for (let i = 0; i < leadsToTransfer.length; i++) {
        const lead = leadsToTransfer[i];
        const targetUser = targetUsers[i % targetUsers.length];

        await pb.collection("leads").update(lead.id, {
          assignedTo: targetUser.id,
          status: "New",
          followup1Date: null,
          followup1Completed: false,
          followup2Date: null,
          followup2Completed: false,
          followup3Date: null,
          followup3Completed: false,
          lastModified: now,
        });

        try {
          await pb.collection("leadHistory").create({
            timeStamp: now,
            leadId: lead.id,
            studentName: lead.id,
            eventType: "Reassignment",
            changedBy: adminId || userId,
            oldValue: resolveName(user.id),
            newValue: resolveName(targetUser.id),
            comment: adminName
              ? `Transferred and reset to New during account disable by ${adminName}`
              : "Transferred and reset to New during account disable",
          });
        } catch (historyErr) {
          console.error("Failed to write lead history:", historyErr);
        }

        transferredCount += 1;
      }
    }

    if (!isAlreadyDisabled) {
      await pb.collection(AUTH_COLLECTION).update(userId, {
        accountStatus: "disabled",
      });
    }

    return NextResponse.json({
      success: true,
      message: isAlreadyDisabled ? "Leads transferred successfully" : "User disabled successfully",
      transferredCount,
      assignedLeadCount: assignedLeads.length,
      matchingLeadCount: leadsToTransfer.length,
      transferTargets: targetUsers.map((tu) => ({
        id: tu.id,
        name: tu.name || tu.email || tu.id,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to disable user";
    console.error("Error disabling user:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
