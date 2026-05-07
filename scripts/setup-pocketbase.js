#!/usr/bin/env node

/**
 * PocketBase Collection Setup Script
 * Run this script to create all required collections for the Lead Management System
 *
 * Usage: node scripts/setup-pocketbase.js
 */

import PocketBase from "pocketbase";

const POCKETBASE_URL =
  process.env.NEXT_PUBLIC_POCKETBASE_URL || "https://amazoncrm-db.codix.site";
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || "";

async function setupCollections() {
  const pb = new PocketBase(POCKETBASE_URL);

  console.log("🔐 Authenticating with PocketBase...");
  try {
    await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log("✅ Authenticated successfully\n");
  } catch (error) {
    console.error("❌ Authentication failed:", error);
    process.exit(1);
  }

  // Collections to create
  const collections = [
    {
      name: "users",
      displayName: "Users",
      description: "System users (admins and counselors)",
      fields: [
        { name: "email", type: "email", required: true },
        { name: "name", type: "text", required: true },
        {
          name: "role",
          type: "select",
          required: true,
          options: {
            values: ["admin", "student-counsellor"],
            maxSelect: 1,
          },
        },
        {
          name: "accountStatus",
          type: "select",
          required: true,
          options: {
            values: ["active", "disabled"],
            maxSelect: 1,
          },
        },
      ],
    },
    {
      name: "leads",
      displayName: "Leads",
      description: "Lead records with student information",
      fields: [
        { name: "leadId", type: "text", required: true },
        { name: "studentName", type: "text", required: true },
        { name: "mobile", type: "text", required: true },
        { name: "email", type: "email" },
        { name: "course", type: "text", required: true },
        { name: "leadSource", type: "text", required: true },
        {
          name: "status",
          type: "select",
          required: true,
          options: {
            values: ["New", "Contacted", "Follow-up", "Registered", "Lost"],
            maxSelect: 1,
          },
        },
        { name: "assignedTo", type: "text", required: true },
        { name: "comments", type: "text" },
        { name: "commentLog", type: "json" },
        { name: "lastModified", type: "date" },
      ],
    },
    {
      name: "leadHistory",
      displayName: "Lead History",
      description: "Audit trail of lead changes",
      fields: [
        { name: "leadId", type: "text", required: true },
        { name: "studentName", type: "text", required: true },
        { name: "eventType", type: "text", required: true },
        { name: "changedBy", type: "text", required: true },
        { name: "oldValue", type: "text" },
        { name: "newValue", type: "text" },
        { name: "comment", type: "text" },
      ],
    },
  ];

  // Create each collection
  for (const collection of collections) {
    console.log(`📋 Creating collection: "${collection.displayName}"...`);

    try {
      // Check if collection already exists
      await pb.collections.getOne(collection.name);
      console.log(`   ⚠️  Collection already exists, skipping...`);
    } catch {
      // Collection doesn't exist, create it
      try {
        const schema = collection.fields.map((field) => {
          const base = {
            name: field.name,
            type: field.type,
            required: field.required || false,
          };
          return field.options ? { ...base, options: field.options } : base;
        });

        await pb.collections.create({
          name: collection.name,
          type: "base",
          schema,
        });

        console.log(`   ✅ Created successfully`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Failed to create:`, message);
      }
    }
  }

  console.log("\n✨ Collection setup complete!");
  console.log(
    "📝 Next steps: You can now start using the Lead Management System",
  );
}

setupCollections().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
