import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function POST() {
  try {
    const pb = await getPocketBaseAdminClient();

    console.log("Setting up PocketBase collections...");

    // 1. Create Users collection
    try {
      await pb.collections.getOne("users");
      console.log("Users collection already exists");
    } catch {
      console.log("Creating users collection...");
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
      console.log("✅ Users collection created");
    }

    // 2. Create Leads collection
    try {
      await pb.collections.getOne("leads");
      console.log("Leads collection already exists");
    } catch {
      console.log("Creating leads collection...");
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
              values: ["New", "Contacted", "Follow-Up", "Registered", "Lost"],
              maxSelect: 1,
            },
          },
          { name: "assignedTo", type: "text", required: true },
          { name: "comments", type: "text" },
          { name: "commentLog", type: "json" },
          { name: "lastModified", type: "date" },
        ],
      });
      console.log("✅ Leads collection created");
    }

    // 3. Create LeadHistory collection
    try {
      await pb.collections.getOne("leadHistory");
      console.log("LeadHistory collection already exists");
    } catch {
      console.log("Creating leadHistory collection...");
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
      console.log("✅ LeadHistory collection created");
    }

    return NextResponse.json({
      success: true,
      message: "PocketBase collections setup completed successfully!",
    });
  } catch (error) {
    console.error("Error setting up collections:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
