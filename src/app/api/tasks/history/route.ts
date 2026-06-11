import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId") || "";

    if (!taskId) {
      return NextResponse.json(
        { error: "taskId query parameter is required" },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();

    let history = [];
    try {
      history = await pb.collection("taskHistory").getFullList({
        filter: `taskId = "${taskId}"`,
        sort: "-created",
        expand: "changedBy",
      });
    } catch (error: any) {
      if (error.status === 404 || error.message?.includes("not found")) {
        return NextResponse.json([]);
      }
      throw error;
    }

    const formatted = history.map((record) => {
      const user = record.expand?.changedBy as
        | { name?: string; email?: string }
        | undefined;
      return {
        id: record.id,
        timeStamp: record.timeStamp || record.created,
        taskId: record.taskId,
        eventType: record.eventType,
        changedBy: user?.name || user?.email || "System",
        oldValue: record.oldValue || "",
        newValue: record.newValue || "",
        comment: record.comment || "",
        created: record.created,
      };
    });

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Error fetching task history:", error);
    return NextResponse.json(
      { error: "Failed to fetch task history" },
      { status: 500 },
    );
  }
}
