import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function GET() {
  try {
    const pb = await getPocketBaseAdminClient();
    const records = await pb.collection("tasks").getFullList({
      sort: "-created",
      expand: "assignedTo",
    });

    const tasks = records.map((record) => {
      const assignee = record.expand?.assignedTo as { name?: string; email?: string } | undefined;
      return {
        id: record.id,
        taskId: record.task_id || record.id,
        title: record.title,
        description: record.description || "",
        assignedTo: record.assignedTo,
        assignedToName: assignee?.name || assignee?.email || "Unknown Staff",
        dueDate: record.dueDate || "",
        status: record.status || "Pending",
        priority: record.priority || "Medium",
        createdBy: record.createdBy || "Admin",
        created: record.created,
        updated: record.updated,
        notes: record.notes || "",
      };
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Error fetching admin tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      assignedTo?: string;
      dueDate?: string;
      priority?: string;
      createdBy?: string;
    };

    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const assignedTo = (body.assignedTo || "").trim();
    const dueDate = body.dueDate || "";
    const priority = body.priority || "Medium";
    const createdBy = body.createdBy || "Admin";

    if (!title || !assignedTo) {
      return NextResponse.json(
        { error: "Title and Assignee are required fields" },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();
    
    // Check if assignee exists
    try {
      await pb.collection("users").getOne(assignedTo);
    } catch {
      return NextResponse.json(
        { error: "Assignee user not found" },
        { status: 404 },
      );
    }

    // Auto-generate task_id based on previous tasks (e.g. AMZ/TASK/0001)
    const allTasks = await pb.collection("tasks").getFullList({
      sort: "-created",
      limit: 1,
    });

    let nextTaskId = "AMZ/TASK/0001";
    if (allTasks.length > 0) {
      const lastTask = allTasks[0];
      const match = (lastTask.task_id || "").match(/AMZ\/TASK\/(\d+)/);
      if (match) {
        nextTaskId = `AMZ/TASK/${String(parseInt(match[1]) + 1).padStart(4, "0")}`;
      } else {
        nextTaskId = `AMZ/TASK/${Date.now().toString().slice(-6)}`;
      }
    }

    const record = await pb.collection("tasks").create({
      task_id: nextTaskId,
      title,
      description,
      assignedTo,
      dueDate: dueDate || null,
      status: "Pending",
      priority,
      createdBy,
      notes: "",
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create task" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      taskId?: string;
      title?: string;
      description?: string;
      assignedTo?: string;
      dueDate?: string;
      priority?: string;
      status?: string;
      notes?: string;
    };

    const taskId = (body.taskId || "").trim();
    if (!taskId) {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();

    const updates: Record<string, unknown> = {};
    if (typeof body.title === "string") updates.title = body.title.trim();
    if (typeof body.description === "string") updates.description = body.description.trim();
    if (typeof body.assignedTo === "string") updates.assignedTo = body.assignedTo.trim();
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate || null;
    if (typeof body.priority === "string") updates.priority = body.priority;
    if (typeof body.status === "string") updates.status = body.status;
    if (typeof body.notes === "string") updates.notes = body.notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields provided to update" },
        { status: 400 },
      );
    }

    const updatedRecord = await pb.collection("tasks").update(taskId, updates);
    return NextResponse.json(updatedRecord);
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update task" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Task ID parameter 'id' is required" },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();
    await pb.collection("tasks").delete(id);

    return NextResponse.json({ success: true, message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete task" },
      { status: 500 },
    );
  }
}
