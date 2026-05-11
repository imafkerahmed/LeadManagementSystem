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
    } catch {
      // Fall back to query without expand
      history = await pb.collection("leadHistory").getFullList({
        filter: `leadId = "${leadId}"`,
        sort: "-created",
      });
    }

    // Try to get user list for fallback resolution
    const userIdToName = new Map<string, string>();
    try {
      type PBUser = { id?: string; name?: string; email?: string };
      const users = (await pb.collection("users").getFullList()) as PBUser[];
      (users || []).forEach((u) => {
        userIdToName.set(u.id || "", u.name || u.email || u.id || "");
      });
    } catch {
      // ignore
    }

    const resolveUserValue = (value?: string) => {
      const trimmedValue = value?.trim() || "";
      if (!trimmedValue) return "";
      return userIdToName.get(trimmedValue) || trimmedValue;
    };

    // Get the lead to resolve student name
    let lead: { studentName?: string } | null = null;
    try {
      lead = await pb.collection("leads").getOne(leadId);
    } catch {
      // ignore
    }

    // Resolve changedBy and studentName
    type Entry = {
      id?: string;
      eventType?: string;
      comment?: string;
      oldValue?: string;
      newValue?: string;
      created?: string;
      expand?: {
        leadId?: { studentName?: string };
        changedBy?: { name?: string; email?: string };
      };
      leadId?: string;
      changedBy?: string;
    };

    const resolved = (history as Entry[]).map((entry) => ({
      id: entry.id,
      eventType: entry.eventType,
      comment: entry.comment,
      oldValue: resolveUserValue(entry.oldValue),
      newValue: resolveUserValue(entry.newValue),
      created: entry.created,
      studentName:
        entry.expand?.leadId?.studentName ||
        lead?.studentName ||
        entry.leadId ||
        "Unknown",
      changedBy:
        entry.expand?.changedBy?.name ||
        entry.expand?.changedBy?.email ||
        userIdToName.get(entry.changedBy || "") ||
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
