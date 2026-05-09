import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

type PBUser = { id?: string; name?: string; email?: string };
type PBEntry = {
  id?: string;
  expand?: { changedBy?: PBUser };
  changedBy?: string;
};

export async function GET() {
  try {
    const pb = await getPocketBaseAdminClient();

    // Fetch leads
    const leads = await pb.collection("leads").getFullList({
      sort: "-created",
      expand: "assignedTo",
    });

    // Fetch leadHistory with expanded relations
    let history = [];
    try {
      history = await pb.collection("leadHistory").getFullList({
        sort: "-created",
        expand: "changedBy,studentName,leadId",
      });
    } catch {
      // If expand fails, fetch without it
      history = await pb.collection("leadHistory").getFullList({
        sort: "-created",
      });
    }

    // Build a map of user IDs to names by fetching all possible users
    const userIdToName = new Map<string, string>();

    // Get users from the users collection
    try {
      const users = (await pb.collection("users").getFullList()) as PBUser[];
      (users || []).forEach((u) => {
        userIdToName.set(u.id || "", u.name || u.email || u.id || "");
      });
    } catch (err) {
      console.debug("Failed to fetch users for resolution:", err);
    }

    // Manually resolve changedBy by querying for the user details
    // This is a workaround for when changedBy points to auth users
    const historyWithResolvedNames = (history as PBEntry[]).map((entry) => ({
      ...entry,
      changedByResolved: resolveChangedBy(entry, userIdToName),
    }));

    return NextResponse.json({
      leads,
      history: historyWithResolvedNames,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 },
    );
  }
}

function resolveChangedBy(entry: PBEntry, userIdToName: Map<string, string>) {
  // First try expand
  if (entry.expand?.changedBy?.name) return entry.expand.changedBy.name;
  if (entry.expand?.changedBy?.email) return entry.expand.changedBy.email;

  // Then try map lookup
  if (entry.changedBy && userIdToName.has(entry.changedBy)) {
    return userIdToName.get(entry.changedBy) || entry.changedBy;
  }

  // Fall back to changedBy id or unknown
  return entry.changedBy || "Unknown";
}
