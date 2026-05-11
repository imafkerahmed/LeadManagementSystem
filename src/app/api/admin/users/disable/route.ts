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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      transferToUserId?: string;
      adminId?: string;
      adminName?: string;
    };

    const userId = (body.userId || "").trim();
    const transferToUserId = (body.transferToUserId || "").trim();
    const adminId = (body.adminId || "").trim();
    const adminName = (body.adminName || "").trim();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    if (transferToUserId && transferToUserId === userId) {
      return NextResponse.json(
        { error: "transferToUserId cannot be the same as userId" },
        { status: 400 },
      );
    }

    if (adminId && adminId === userId) {
      return NextResponse.json(
        { error: "You cannot disable your own account" },
        { status: 403 },
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
    const actorName = adminName || adminId || resolveName(userId);

    const user = (await pb
      .collection(AUTH_COLLECTION)
      .getOne(userId)) as ManagedUserRecord;

    if (normalizeStatus(user.accountStatus) === "disabled") {
      return NextResponse.json({
        success: true,
        message: "User is already disabled",
        transferredCount: 0,
      });
    }

    const assignmentFilter = buildAssigneeFilter(user);
    const assignedLeads = (await pb.collection("leads").getFullList({
      filter: assignmentFilter,
      fields: "id,leadId,assignedTo,studentName",
    })) as LeadRecord[];

    if (assignedLeads.length > 0 && !transferToUserId) {
      return NextResponse.json(
        {
          error:
            "This user has assigned leads. Provide transferToUserId to transfer leads before disabling.",
          requiresTransfer: true,
          assignedLeadCount: assignedLeads.length,
        },
        { status: 409 },
      );
    }

    let targetUser: ManagedUserRecord | null = null;
    if (transferToUserId) {
      targetUser = (await pb
        .collection(AUTH_COLLECTION)
        .getOne(transferToUserId)) as ManagedUserRecord;

      const targetRole = normalizeRole(targetUser.role);
      const targetStatus = normalizeStatus(targetUser.accountStatus);

      if (targetRole !== "student-counsellor") {
        return NextResponse.json(
          { error: "Lead transfer target must be a student-counsellor" },
          { status: 400 },
        );
      }

      if (targetStatus !== "enabled") {
        return NextResponse.json(
          { error: "Lead transfer target must be enabled" },
          { status: 400 },
        );
      }
    }

    let transferredCount = 0;
    const now = new Date().toISOString();

    if (targetUser && assignedLeads.length > 0) {
      for (const lead of assignedLeads) {
        await pb.collection("leads").update(lead.id, {
          assignedTo: targetUser.id,
          lastModified: now,
        });

        await pb.collection("leadHistory").create({
          timeStamp: now,
          leadId: lead.id,
          studentName: lead.id,
          eventType: "Reassignment",
          changedBy: actorName,
          oldValue: resolveName(user.id),
          newValue: resolveName(targetUser.id),
          comment: adminName
            ? `Transferred automatically during account disable by ${adminName}`
            : "Transferred automatically during account disable",
        });

        transferredCount += 1;
      }
    }

    await pb.collection(AUTH_COLLECTION).update(userId, {
      accountStatus: "disabled",
    });

    return NextResponse.json({
      success: true,
      message: "User disabled successfully",
      transferredCount,
      assignedLeadCount: assignedLeads.length,
      transferTarget: targetUser
        ? {
            id: targetUser.id,
            name: targetUser.name || targetUser.email || targetUser.id,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to disable user";
    console.error("Error disabling user:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
