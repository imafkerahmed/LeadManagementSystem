import { NextRequest, NextResponse } from "next/server";
import { createPocketBaseClient } from "@/lib/pocketbase";

function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    const json = JSON.parse(decoded);
    // PocketBase tokens have user data nested under a 'data' key
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
        { status: 401 },
      );
    }

    const payload = decodeJWT(token);
    if (!payload?.id) {
      return NextResponse.json(
        { error: "Unable to determine user identity from token" },
        { status: 401 },
      );
    }

    const userId = payload.id as string;
    const pb = createPocketBaseClient();
    pb.authStore.save(token);

    const tasks = await pb.collection("tasks").getFullList({
      filter: `assignedTo = "${userId}"`,
      sort: "-created",
    });

    const formattedTasks = tasks.map((record) => ({
      id: record.id,
      taskId: record.task_id || record.id,
      title: record.title,
      description: record.description || "",
      assignedTo: record.assignedTo,
      dueDate: record.dueDate || "",
      status: record.status || "Pending",
      priority: record.priority || "Medium",
      createdBy: record.createdBy || "Admin",
      created: record.created,
      updated: record.updated,
      notes: record.notes || "",
    }));

    return NextResponse.json(formattedTasks);
  } catch (error) {
    console.error("Error fetching staff tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    if (!token) {
      return NextResponse.json(
        { error: "Authentication is required" },
        { status: 401 },
      );
    }

    const payload = decodeJWT(token);
    if (!payload?.id) {
      return NextResponse.json(
        { error: "Unable to determine user identity from token" },
        { status: 401 },
      );
    }

    const userId = payload.id as string;

    const body = (await request.json()) as {
      taskId?: string;
      status?: string;
      notes?: string;
    };

    const taskId = (body.taskId || "").trim();
    const status = body.status;
    const notes = body.notes;

    if (!taskId) {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 },
      );
    }

    const pb = createPocketBaseClient();
    pb.authStore.save(token);

    // Fetch the task first to ensure it exists and is assigned to this user
    let taskRecord;
    try {
      taskRecord = await pb.collection("tasks").getOne(taskId);
    } catch {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 },
      );
    }

    if (taskRecord.assignedTo !== userId) {
      return NextResponse.json(
        { error: "Unauthorized. You can only update tasks assigned to you." },
        { status: 403 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (typeof status === "string") {
      if (status !== "Pending" && status !== "In-Progress" && status !== "Completed" && status !== "Cancelled") {
        return NextResponse.json(
          { error: "Invalid status value" },
          { status: 400 },
        );
      }
      updates.status = status;
    }

    if (typeof notes === "string") {
      updates.notes = notes;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields provided to update" },
        { status: 400 },
      );
    }

    const updatedRecord = await pb.collection("tasks").update(taskId, updates);
    return NextResponse.json(updatedRecord);
  } catch (error) {
    console.error("Error updating staff task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update task" },
      { status: 500 },
    );
  }
}
