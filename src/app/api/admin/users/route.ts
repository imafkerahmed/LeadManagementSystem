import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient, pocketBaseUrl } from "@/lib/pocketbase";

type ManagedUserRecord = {
  id: string;
  name?: string;
  email?: string;
  username?: string;
  role?: string;
  accountStatus?: string;
};

type LeadListResult = {
  totalItems: number;
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

function userAssignmentFilter(user: ManagedUserRecord) {
  const candidates = Array.from(
    new Set([user.id, user.name || "", user.email || ""]).values(),
  ).filter(Boolean);

  const conditions = candidates.map(
    (value) => `assignedTo = "${escapeFilterValue(value)}"`,
  );

  if (conditions.length === 0) {
    return "id = ''";
  }

  return `(${conditions.join(" || ")})`;
}

async function listManagedUsers() {
  const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || "";
  const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || "";

  let users: ManagedUserRecord[] = [];

  // Try direct HTTP fetch with admin creds first (avoids SDK authStore issues)
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    try {
      const authUrl = new URL(
        "/api/admins/auth-with-password",
        pocketBaseUrl,
      ).toString();
      const authResponse = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        }),
      });

      if (authResponse.ok) {
        const authData = (await authResponse.json()) as { token?: string };
        const token = authData.token;
        if (token) {
          const usersUrl = new URL(
            `/api/collections/${AUTH_COLLECTION}/records`,
            pocketBaseUrl,
          ).toString();
          const usersResponse = await fetch(usersUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (usersResponse.ok) {
            const usersData = (await usersResponse.json()) as {
              items?: ManagedUserRecord[];
            };
            users = usersData.items || [];
          }
        }
      }
    } catch (err) {
      // fall through to SDK fallback
      console.error("Direct HTTP fetch for managed users failed:", err);
    }
  }

  // Ensure we have an admin PocketBase client for lead counts
  const pb = await getPocketBaseAdminClient();

  // Fallback to SDK if direct fetch didn't provide users
  if (users.length === 0) {
    users = (await pb.collection(AUTH_COLLECTION).getFullList({
      sort: "name",
      fields: "id,name,email,username,role,accountStatus",
    })) as ManagedUserRecord[];
  }

  const enriched: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    accountStatus: string;
    assignedLeadCount: number;
  }> = [];

  // Fetch lead counts sequentially to avoid SDK auto-cancellation from many
  // parallel requests (PocketBase JS SDK may abort concurrent calls).
  for (const user of users) {
    let count = 0;
    try {
      const leadCounts = (await pb.collection("leads").getList(1, 1, {
        filter: userAssignmentFilter(user),
      })) as LeadListResult;
      count = leadCounts.totalItems || 0;
    } catch (err) {
      console.error(`Failed to fetch lead count for user ${user.id}:`, err);
      count = 0;
    }

    enriched.push({
      id: user.id,
      name: user.name || user.username || user.email || user.id,
      email: user.email || "",
      role: normalizeRole(user.role),
      accountStatus: normalizeStatus(user.accountStatus),
      assignedLeadCount: count,
    });
  }

  return enriched;
}

export async function GET() {
  try {
    const users = await listManagedUsers();
    return NextResponse.json(users);
  } catch (error) {
    console.error("Error fetching managed users:", error);
    return NextResponse.json(
      { error: "Failed to fetch managed users" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };

    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const role = normalizeRole(body.role);

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "name, email and password are required" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    if (role !== "admin" && role !== "student-counsellor") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const pb = await getPocketBaseAdminClient();

    const usernameBase =
      email.split("@")[0]?.replace(/[^a-zA-Z0-9._-]/g, "") || "user";
    const username = `${usernameBase}_${Date.now().toString().slice(-6)}`;

    const created = (await pb.collection(AUTH_COLLECTION).create({
      name,
      email,
      username,
      password,
      passwordConfirm: password,
      role,
      accountStatus: "enabled",
      emailVisibility: true,
    })) as ManagedUserRecord;

    return NextResponse.json(
      {
        id: created.id,
        name: created.name || name,
        email: created.email || email,
        role: normalizeRole(created.role),
        accountStatus: normalizeStatus(created.accountStatus),
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create user";
    console.error("Error creating managed user:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      name?: string;
      role?: string;
      accountStatus?: string;
    };

    const userId = (body.userId || "").trim();
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const nextName = body.name.trim();
      if (!nextName) {
        return NextResponse.json(
          { error: "name cannot be empty" },
          { status: 400 },
        );
      }
      updates.name = nextName;
    }

    if (typeof body.role === "string") {
      const role = normalizeRole(body.role);
      if (role !== "admin" && role !== "student-counsellor") {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updates.role = role;
    }

    if (typeof body.accountStatus === "string") {
      const status = normalizeStatus(body.accountStatus);
      if (status === "disabled") {
        return NextResponse.json(
          {
            error:
              "Use /api/admin/users/disable to disable users and transfer assigned leads safely",
          },
          { status: 409 },
        );
      }
      updates.accountStatus = status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided to update" },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();
    const updated = (await pb
      .collection(AUTH_COLLECTION)
      .update(userId, updates)) as ManagedUserRecord;

    return NextResponse.json({
      id: updated.id,
      name: updated.name || "",
      email: updated.email || "",
      role: normalizeRole(updated.role),
      accountStatus: normalizeStatus(updated.accountStatus),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update user";
    console.error("Error updating managed user:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
