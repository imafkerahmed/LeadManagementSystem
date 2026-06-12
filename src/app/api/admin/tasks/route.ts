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

async function getAdminUserId(request: NextRequest, pb: any): Promise<string> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const payload = token ? decodeJWT(token) : null;
  if (payload?.id) {
    return payload.id as string;
  }

  // Fallback: search for first admin user in PocketBase users collection
  try {
    const admins = await pb.collection("users").getFullList({
      filter: 'role = "admin"',
      limit: 1,
    });
    if (admins.length > 0) {
      return admins[0].id;
    }
  } catch (err) {
    console.error("Error finding fallback admin user:", err);
  }

  return "";
}

export async function GET() {
  try {
    const pb = await getPocketBaseAdminClient();
    let records = [];
    try {
      records = await pb.collection("tasks").getFullList({
        sort: "-created",
        expand: "assignedTo",
      });
    } catch (error: any) {
      if (error.status === 404 || error.message?.includes("not found")) {
        return NextResponse.json([]);
      }
      throw error;
    }

    const tasks = records.map((record) => {
      const assignee = record.expand?.assignedTo as
        | { name?: string; email?: string }
        | undefined;
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
    let allTasks: any[] = [];
    try {
      allTasks = await pb.collection("tasks").getFullList({
        sort: "-created",
        limit: 1,
      });
    } catch (err: any) {
      // If collection doesn't exist yet, it's fine, start with empty list
      if (err.status !== 404 && !err.message?.includes("not found")) {
        throw err;
      }
    }

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

    // Resolve creator admin name from token
    const adminId = await getAdminUserId(request, pb);
    let resolvedCreatedBy = "Admin";
    if (adminId) {
      try {
        const creator = await pb.collection("users").getOne(adminId);
        resolvedCreatedBy = creator.name || creator.email || "Admin";
      } catch (err) {
        console.error("Failed to fetch creator name:", err);
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
      createdBy: resolvedCreatedBy,
      notes: "",
    });

    // Write to TaskHistory
    if (adminId) {
      try {
        await pb.collection("taskHistory").create({
          timeStamp: new Date().toISOString(),
          taskId: record.id,
          eventType: "Task Created",
          changedBy: adminId,
          newValue: "Pending",
          comment: `Task created by ${resolvedCreatedBy}`,
        });
      } catch (err) {
        console.error("Failed to log task creation history:", err);
      }
    }

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create task",
      },
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

    // Fetch original record to identify changes
    let originalRecord;
    try {
      originalRecord = await pb.collection("tasks").getOne(taskId);
    } catch {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.title === "string") updates.title = body.title.trim();
    if (typeof body.description === "string")
      updates.description = body.description.trim();
    if (typeof body.assignedTo === "string")
      updates.assignedTo = body.assignedTo.trim();
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

    // Logging changes in TaskHistory
    const adminId = await getAdminUserId(request, pb);
    if (adminId) {
      const now = new Date().toISOString();
      const historyPromises = [];

      if (updates.status && updates.status !== originalRecord.status) {
        historyPromises.push(
          pb.collection("taskHistory").create({
            timeStamp: now,
            taskId,
            eventType: "Status Updated",
            changedBy: adminId,
            oldValue: originalRecord.status,
            newValue: updates.status,
          }),
        );
      }

      if (
        updates.assignedTo &&
        updates.assignedTo !== originalRecord.assignedTo
      ) {
        let oldName = originalRecord.assignedTo;
        let newName = updates.assignedTo as string;
        try {
          const [oldUser, newUser] = await Promise.all([
            pb
              .collection("users")
              .getOne(originalRecord.assignedTo)
              .catch(() => null),
            pb
              .collection("users")
              .getOne(updates.assignedTo as string)
              .catch(() => null),
          ]);
          if (oldUser) oldName = oldUser.name || oldUser.email || oldName;
          if (newUser) newName = newUser.name || newUser.email || newName;
        } catch {}

        historyPromises.push(
          pb.collection("taskHistory").create({
            timeStamp: now,
            taskId,
            eventType: "Assignee Changed",
            changedBy: adminId,
            oldValue: oldName,
            newValue: newName,
          }),
        );
      }

      if (updates.priority && updates.priority !== originalRecord.priority) {
        historyPromises.push(
          pb.collection("taskHistory").create({
            timeStamp: now,
            taskId,
            eventType: "Priority Updated",
            changedBy: adminId,
            oldValue: originalRecord.priority,
            newValue: updates.priority,
          }),
        );
      }

      if (updates.dueDate !== undefined) {
        const origDueDate = originalRecord.dueDate
          ? originalRecord.dueDate.split("T")[0]
          : "";
        const nextDueDate = updates.dueDate
          ? (updates.dueDate as string).split("T")[0]
          : "";
        if (origDueDate !== nextDueDate) {
          historyPromises.push(
            pb.collection("taskHistory").create({
              timeStamp: now,
              taskId,
              eventType: "Due Date Changed",
              changedBy: adminId,
              oldValue: origDueDate || "None",
              newValue: nextDueDate || "Cleared",
            }),
          );
        }
      }

      if (updates.title && updates.title !== originalRecord.title) {
        historyPromises.push(
          pb.collection("taskHistory").create({
            timeStamp: now,
            taskId,
            eventType: "Task Details Updated",
            changedBy: adminId,
            comment: `Title updated from "${originalRecord.title}" to "${updates.title}"`,
          }),
        );
      }

      if (
        updates.description !== undefined &&
        updates.description !== originalRecord.description
      ) {
        historyPromises.push(
          pb.collection("taskHistory").create({
            timeStamp: now,
            taskId,
            eventType: "Task Details Updated",
            changedBy: adminId,
            comment: "Task description updated",
          }),
        );
      }

      if (
        updates.notes !== undefined &&
        updates.notes !== originalRecord.notes
      ) {
        historyPromises.push(
          pb.collection("taskHistory").create({
            timeStamp: now,
            taskId,
            eventType: "Notes Added",
            changedBy: adminId,
            comment: updates.notes as string,
          }),
        );
      }

      if (historyPromises.length > 0) {
        try {
          await Promise.all(historyPromises);
        } catch (err) {
          console.error("Failed to log task updates to history:", err);
        }
      }
    }

    return NextResponse.json(updatedRecord);
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update task",
      },
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

    // Clean up taskHistory logs first
    try {
      const historyRecords = await pb.collection("taskHistory").getFullList({
        filter: `taskId = "${id}"`,
      });
      await Promise.all(
        historyRecords.map((r) => pb.collection("taskHistory").delete(r.id)),
      );
    } catch (err: any) {
      if (err.status !== 404 && !err.message?.includes("not found")) {
        console.error(
          "Failed to clean up task history records during deletion:",
          err,
        );
      }
    }

    await pb.collection("tasks").delete(id);

    return NextResponse.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete task",
      },
      { status: 500 },
    );
  }
}
