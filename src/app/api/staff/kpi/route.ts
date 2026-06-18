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

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    if (!token) {
      return NextResponse.json(
        { error: "Authentication is required" },
        { status: 401 }
      );
    }

    const payload = decodeJWT(token);
    if (!payload?.id) {
      return NextResponse.json(
        { error: "Unable to determine user identity from token" },
        { status: 401 }
      );
    }

    const userId = payload.id as string;
    const pb = await getPocketBaseAdminClient();

    // 1. Fetch this user's detailed KPI records
    let myRecords: any[] = [];
    try {
      myRecords = await pb.collection("kpiLedger").getFullList({
        filter: `staffId = "${userId}"`,
        sort: "-date",
        expand: "awardedBy",
      });
    } catch (error: any) {
      if (error.status !== 404 && !error.message?.includes("not found")) {
        throw error;
      }
    }

    const formattedHistory = myRecords.map((rec) => {
      const adminUser = rec.expand?.awardedBy as { name?: string; email?: string } | undefined;
      return {
        id: rec.id,
        points: rec.points,
        category: rec.category,
        comments: rec.comments || "",
        date: rec.date || rec.created,
        awardedByName: adminUser?.name || adminUser?.email || "Admin",
      };
    });

    // 2. Fetch all KPI records to calculate the leaderboard
    let allRecords: any[] = [];
    try {
      allRecords = await pb.collection("kpiLedger").getFullList({
        expand: "staffId",
      });
    } catch (error: any) {
      if (error.status !== 404 && !error.message?.includes("not found")) {
        throw error;
      }
    }

    // 3. Fetch all active counselors to populate leaderboard (even those with 0 points)
    let counselors: any[] = [];
    try {
      counselors = await pb.collection("users").getFullList({
        filter: 'role = "student-counsellor"',
      });
    } catch (error: any) {
      if (error.status !== 404 && !error.message?.includes("not found")) {
        throw error;
      }
    }

    // Aggregating points
    const pointsMap: Record<string, { name: string; email: string; points: number }> = {};
    
    // Initialize active counselors with 0 points
    counselors.forEach((c) => {
      pointsMap[c.id] = {
        name: c.name || "",
        email: c.email || "",
        points: 0,
      };
    });

    // Sum up points from ledger
    allRecords.forEach((rec) => {
      const staffId = rec.staffId;
      const points = rec.points || 0;
      
      if (pointsMap[staffId]) {
        pointsMap[staffId].points += points;
      } else {
        // Fallback for counselors not fetched or with other roles
        const staff = rec.expand?.staffId as { name?: string; email?: string } | undefined;
        pointsMap[staffId] = {
          name: staff?.name || "",
          email: staff?.email || "Unknown",
          points: points,
        };
      }
    });

    // Convert to sorted leaderboard array
    const leaderboard = Object.entries(pointsMap)
      .map(([id, data]) => ({
        id,
        name: data.name || data.email || "Unknown Staff",
        points: data.points,
      }))
      .sort((a, b) => b.points - a.points);

    // Find current user's rank
    const myRank = leaderboard.findIndex((item) => item.id === userId) + 1;

    return NextResponse.json({
      history: formattedHistory,
      leaderboard,
      myRank: myRank > 0 ? myRank : null,
      myTotalPoints: pointsMap[userId]?.points || 0,
    });
  } catch (error) {
    console.error("Error fetching staff KPI details:", error);
    return NextResponse.json(
      { error: "Failed to fetch KPI details" },
      { status: 500 }
    );
  }
}
