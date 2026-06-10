import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function POST() {
  try {
    const pb = await getPocketBaseAdminClient();

    // Setting up PocketBase collections...

    // 1. Create Users collection
    try {
      const usersCol = await pb.collections.getOne("users");
      let updated = false;

      if (!usersCol.schema.some((f: any) => f.name === "leadsEnabled")) {
        usersCol.schema.push({ name: "leadsEnabled", type: "bool", required: false });
        updated = true;
      }
      if (!usersCol.schema.some((f: any) => f.name === "tasksEnabled")) {
        usersCol.schema.push({ name: "tasksEnabled", type: "bool", required: false });
        updated = true;
      }

      const roleField = usersCol.schema.find((f: any) => f.name === "role");
      if (roleField && roleField.type === "select") {
        const values = roleField.options?.values || [];
        if (!values.includes("only-task-view")) {
          roleField.options.values = [...values, "only-task-view"];
          updated = true;
        }
      }

      if (updated) {
        await pb.collections.update("users", usersCol);
      }
    } catch {
      await pb.collections.create({
        name: "users",
        type: "base",
        schema: [
          { name: "email", type: "email", required: true },
          { name: "name", type: "text", required: true },
          {
            name: "role",
            type: "select",
            required: true,
            options: {
              values: ["admin", "counselor", "only-task-view"],
              maxSelect: 1,
            },
          },
          { name: "leadsEnabled", type: "bool", required: false },
          { name: "tasksEnabled", type: "bool", required: false },
        ],
      });
    }

    // 2. Create Leads collection
    try {
      await pb.collections.getOne("leads");
    } catch {
      // creating leads collection
      await pb.collections.create({
        name: "leads",
        type: "base",
        schema: [
          { name: "leadId", type: "text", required: true },
          { name: "studentName", type: "text", required: true },
          { name: "mobile", type: "text", required: true },
          { name: "email", type: "email" },
          { name: "course", type: "text", required: true },
          { name: "leadSource", type: "text", required: true },
          { name: "leadSourceDetail", type: "text" },
          {
            name: "status",
            type: "select",
            required: true,
            options: {
              values: ["New", "Ringing-No-Answer", "Contacted", "Follow-up", "Registered", "Lost"],
              maxSelect: 1,
            },
          },
          { name: "assignedTo", type: "text", required: true },
          { name: "comments", type: "text" },
          { name: "commentLog", type: "json" },
          { name: "lastModified", type: "date" },
        ],
      });
      // leads collection created
    }

    // 3. Create LeadHistory collection
    try {
      await pb.collections.getOne("leadHistory");
    } catch {
      // creating leadHistory collection
      await pb.collections.create({
        name: "leadHistory",
        type: "base",
        schema: [
          { name: "timeStamp", type: "date" },
          {
            name: "leadId",
            type: "relation",
            required: true,
            options: {
              collectionId: "pbc_488101053",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
          {
            name: "studentName",
            type: "relation",
            required: true,
            options: {
              collectionId: "pbc_488101053",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
          { name: "eventType", type: "text", required: true },
          {
            name: "changedBy",
            type: "relation",
            required: true,
            options: {
              collectionId: "_pb_users_auth_",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
          { name: "oldValue", type: "text" },
          { name: "newValue", type: "text" },
          { name: "comment", type: "text" },
        ],
      });
      // leadHistory collection created
    }

    // 4. Create Tasks collection
    try {
      await pb.collections.getOne("tasks");
    } catch {
      await pb.collections.create({
        name: "tasks",
        type: "base",
        schema: [
          { name: "title", type: "text", required: true },
          { name: "description", type: "text" },
          {
            name: "assignedTo",
            type: "relation",
            required: true,
            options: {
              collectionId: "_pb_users_auth_",
              maxSelect: 1,
              minSelect: 0,
              cascadeDelete: false,
            },
          },
          { name: "dueDate", type: "date" },
          {
            name: "status",
            type: "select",
            required: true,
            options: {
              values: ["Pending", "In-Progress", "Completed"],
              maxSelect: 1,
            },
          },
          {
            name: "priority",
            type: "select",
            required: true,
            options: {
              values: ["Low", "Medium", "High"],
              maxSelect: 1,
            },
          },
          { name: "createdBy", type: "text" },
          { name: "notes", type: "text" },
        ],
      });
    }

    return NextResponse.json({
      success: true,
      message: "PocketBase collections setup completed successfully!",
    });
  } catch (error) {
    console.error(
      "Error setting up collections:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
