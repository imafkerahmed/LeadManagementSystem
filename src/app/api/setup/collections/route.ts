import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function POST() {
  try {
    const pb = await getPocketBaseAdminClient();

    // Setting up PocketBase collections...

    // 1. Create Users collection
    try {
      await pb.collections.getOne("users");
    } catch {
      // creating users collection
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
              values: ["admin", "counselor"],
              maxSelect: 1,
            },
          },
        ],
      });
      // users collection created
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
