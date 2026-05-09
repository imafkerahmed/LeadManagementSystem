import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("leadId");

    if (!leadId) {
      return NextResponse.json(
        { error: "leadId is required" },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();

    // Fetch leadHistory
    let history = [];
    try {
      history = await pb.collection("leadHistory").getFullList({
        filter: `leadId = "${leadId}"`,
        sort: "-created",
        expand: "changedBy,studentName,leadId",
      });
    } catch (e) {
      // Fall back to query without expand
      history = await pb.collection("leadHistory").getFullList({
        filter: `leadId = "${leadId}"`,
        sort: "-created",
      });
    }

    // Try to get user list for fallback resolution
    const userIdToName = new Map<string, string>();
    try {
      const users = await pb.collection("users").getFullList();
      (users || []).forEach((u: any) => {
        userIdToName.set(u.id, u.name || u.email || u.id);
      });
    } catch (e) {
      // ignore
    }

    // Get the lead to resolve student name
    let lead: any = null;
    try {
      lead = await pb.collection("leads").getOne(leadId);
    } catch (e) {
      // ignore
    }

    // Resolve changedBy and studentName
    const resolved = history.map((entry: any) => ({
      id: entry.id,
      eventType: entry.eventType,
      comment: entry.comment,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      created: entry.created,
      studentName:
        entry.expand?.leadId?.studentName ||
        lead?.studentName ||
        entry.leadId ||
        "Unknown",
      changedBy:
        entry.expand?.changedBy?.name ||
        entry.expand?.changedBy?.email ||
        userIdToName.get(entry.changedBy) ||
        entry.changedBy ||
        "Unknown",
    }));

    return NextResponse.json(resolved);
  } catch (error) {
    console.error("Error fetching lead history:", error);
    return NextResponse.json(
      { error: "Failed to fetch lead history" },
      { status: 500 },
    );
  }
}
