import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    const json = JSON.parse(decoded);
    return (json.data as Record<string, unknown>) || json;
  } catch {
    return null;
  }
}

function checkAdminAuth(request: NextRequest): { authenticated: boolean; userId?: string; errorResponse?: NextResponse } {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    return {
      authenticated: false,
      errorResponse: NextResponse.json({ error: "Authentication is required" }, { status: 401 }),
    };
  }

  const payload = decodeJWT(token);
  if (!payload?.id) {
    return {
      authenticated: false,
      errorResponse: NextResponse.json({ error: "Invalid authentication token" }, { status: 401 }),
    };
  }

  const role = payload.role as string;
  if (role !== "admin" && role !== "super-admin") {
    return {
      authenticated: false,
      errorResponse: NextResponse.json({ error: "Forbidden. Admin privileges required." }, { status: 403 }),
    };
  }

  return {
    authenticated: true,
    userId: payload.id as string,
  };
}

// GET: Fetch all KPI records or aggregates
export async function GET(request: NextRequest) {
  const auth = checkAdminAuth(request);
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const pb = await getPocketBaseAdminClient();
    
    // Fetch all KPI entries
    let records: any[] = [];
    try {
      records = await pb.collection("kpiLedger").getFullList({
        sort: "-date",
        expand: "staffId,awardedBy",
      });
    } catch (error: any) {
      if (error.status === 404 || error.message?.includes("not found")) {
        records = [];
      } else {
        throw error;
      }
    }

    // Map records for response
    const formattedRecords = records.map((rec) => {
      const staff = rec.expand?.staffId as { name?: string; email?: string } | undefined;
      const adminUser = rec.expand?.awardedBy as { name?: string; email?: string } | undefined;
      return {
        id: rec.id,
        staffId: rec.staffId,
        staffName: staff?.name || staff?.email || "Unknown Staff",
        points: rec.points,
        category: rec.category,
        comments: rec.comments || "",
        date: rec.date || rec.created,
        awardedBy: rec.awardedBy,
        awardedByName: adminUser?.name || adminUser?.email || "Admin",
      };
    });

    return NextResponse.json(formattedRecords);
  } catch (error) {
    console.error("Error fetching admin KPI logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch KPI records" },
      { status: 500 }
    );
  }
}

// POST: Award points
export async function POST(request: NextRequest) {
  const auth = checkAdminAuth(request);
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const body = (await request.json()) as {
      staffId?: string;
      points?: number;
      category?: string;
      comments?: string;
      date?: string;
    };

    const staffId = (body.staffId || "").trim();
    const points = typeof body.points === "number" ? body.points : parseInt(body.points || "0");
    const category = (body.category || "").trim();
    const comments = (body.comments || "").trim();
    const date = body.date || new Date().toISOString();

    if (!staffId || !category) {
      return NextResponse.json(
        { error: "staffId and category are required fields" },
        { status: 400 }
      );
    }

    if (isNaN(points) || points < -500 || points > 500) {
      return NextResponse.json(
        { error: "Points must be a number between -500 and 500" },
        { status: 400 }
      );
    }

    const pb = await getPocketBaseAdminClient();

    // Check if staff user exists
    try {
      await pb.collection("users").getOne(staffId);
    } catch {
      return NextResponse.json(
        { error: "Staff user not found" },
        { status: 404 }
      );
    }

    const record = await pb.collection("kpiLedger").create({
      staffId,
      points,
      category,
      comments,
      date,
      awardedBy: auth.userId,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Error creating KPI entry:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to award points" },
      { status: 500 }
    );
  }
}

// DELETE: Retract points
export async function DELETE(request: NextRequest) {
  const auth = checkAdminAuth(request);
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "KPI log ID parameter 'id' is required" },
        { status: 400 }
      );
    }

    const pb = await getPocketBaseAdminClient();
    await pb.collection("kpiLedger").delete(id);

    return NextResponse.json({
      success: true,
      message: "KPI point entry deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting KPI entry:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete KPI entry" },
      { status: 500 }
    );
  }
}
