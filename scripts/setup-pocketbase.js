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
            values: [
              "super-admin",
              "admin",
              "student-counsellor",
              "marketing-manager",
              "admissions-head",
            ],
            maxSelect: 1,
          },
        },
        {
          name: "accountStatus",
          type: "select",
          required: true,
          options: {
            values: ["enabled", "disabled"],
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
        { name: "countryCode", type: "text", required: true },
        { name: "mobile", type: "text", required: true },
        { name: "mobileWithCountry", type: "text", required: true },
        { name: "email", type: "email" },
        { name: "course", type: "text", required: true },
        { name: "leadSource", type: "text", required: true },
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
    {
      name: "accessControl",
      displayName: "Access Control",
      description: "Dynamic access policies for pages & features",
      fields: [
        { name: "sectionKey", type: "text", required: true, unique: true },
        { name: "displayName", type: "text", required: true },
        {
          name: "targetPage",
          type: "select",
          required: true,
          options: {
            values: ["admin", "user"],
            maxSelect: 1,
          },
        },
        { name: "allowedRoles", type: "json", required: true },
        {
          name: "allowedUsers",
          type: "relation",
          required: false,
          options: {
            collectionId: "_pb_users_auth_",
            maxSelect: null,
            cascadeDelete: false,
          },
        },
        {
          name: "deniedUsers",
          type: "relation",
          required: false,
          options: {
            collectionId: "_pb_users_auth_",
            maxSelect: null,
            cascadeDelete: false,
          },
        },
        { name: "enabled", type: "bool", required: true },
      ],
    },
    {
      name: "kpiLedger",
      displayName: "KPI Ledger",
      description: "Manual points allocations and appraisals for staff",
      fields: [
        {
          name: "staffId",
          type: "relation",
          required: true,
          options: {
            collectionId: "_pb_users_auth_",
            maxSelect: 1,
            cascadeDelete: true,
          },
        },
        { name: "points", type: "number", required: true },
        { name: "category", type: "text", required: true },
        { name: "comments", type: "text" },
        { name: "date", type: "date" },
        {
          name: "awardedBy",
          type: "relation",
          required: true,
          options: {
            collectionId: "_pb_users_auth_",
            maxSelect: 1,
            cascadeDelete: false,
          },
        },
      ],
    },
    {
      name: "invoices",
      displayName: "Invoices",
      description: "Aggregated purchase invoice attachments",
      fields: [
        { name: "invoiceId", type: "text" },
        {
          name: "file",
          type: "file",
          required: true,
          options: {
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
          }
        },
        { name: "name", type: "text" },
      ]
    },
    {
      name: "assets",
      displayName: "Assets",
      description: "Company hardware and peripheral assets",
      fields: [
        { name: "asset_id", type: "text", required: true },
        { name: "assetId", type: "text", required: false },
        { name: "name", type: "text", required: true },
        { name: "type", type: "text", required: true },
        { name: "brand", type: "text", required: true },
        { name: "model", type: "text" },
        { name: "serialNumber", type: "text", required: false },
        {
          name: "status",
          type: "select",
          required: true,
          options: {
            values: ["available", "assigned", "maintenance", "retired"],
            maxSelect: 1,
          },
        },
        {
          name: "assignedTo",
          type: "relation",
          options: {
            collectionId: "_pb_users_auth_",
            maxSelect: 1,
            cascadeDelete: false,
          },
        },
        { name: "assignedAt", type: "date" },
        { name: "assignedLocation", type: "text" },
        { name: "purchaseDate", type: "date" },
        { name: "purchaseCost", type: "number" },
        { name: "warrantyExpiry", type: "date" },
        { name: "notes", type: "text" },
        {
          name: "invoice",
          type: "relation",
          options: {
            collectionId: "invoices",
            maxSelect: 1,
            cascadeDelete: false,
          }
        },
        {
          name: "invoiceFile",
          type: "file",
          options: {
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
          }
        },
      ],
    },
    {
      name: "assetHistory",
      displayName: "Asset History",
      description: "Audit trail of changes and assignments to company assets",
      fields: [
        {
          name: "assetId",
          type: "relation",
          required: true,
          options: {
            collectionId: "assets",
            maxSelect: 1,
            cascadeDelete: true,
          },
        },
        {
          name: "changedBy",
          type: "relation",
          required: true,
          options: {
            collectionId: "_pb_users_auth_",
            maxSelect: 1,
            cascadeDelete: false,
          },
        },
        { name: "action", type: "text", required: true },
        { name: "details", type: "text", required: true },
        { name: "date", type: "date", required: true },
      ],
    },
  ];

  // Create each collection
  for (const collection of collections) {
    console.log(`📋 Creating collection: "${collection.displayName}"...`);

    try {
      // Check if collection already exists
      const existing = await pb.collections.getOne(collection.name);
      let modified = false;

      // Migrate type and optional serialNumber
      existing.schema = existing.schema.map((f) => {
        if (collection.name === "assets" && f.name === "type" && f.type === "select") {
          modified = true;
          return { name: "type", type: "text", required: true };
        }
        if (collection.name === "assets" && f.name === "serialNumber" && f.required === true) {
          modified = true;
          return { ...f, required: false };
        }
        return f;
      });

      if (collection.name === "invoices") {
        const hasInvoiceId = existing.schema.some((f) => f.name === "invoiceId");
        if (!hasInvoiceId) {
          existing.schema.push({ name: "invoiceId", type: "text", required: false });
          modified = true;
        }
      }

      if (collection.name === "assets") {
        // Ensure assetId is present
        const hasAssetId = existing.schema.some((f) => f.name === "assetId");
        if (!hasAssetId) {
          existing.schema.push({ name: "assetId", type: "text", required: true });
          modified = true;
        }

        // Ensure invoiceFile is present
        const hasInvoiceFile = existing.schema.some((f) => f.name === "invoiceFile");
        if (!hasInvoiceFile) {
          existing.schema.push({
            name: "invoiceFile",
            type: "file",
            required: false,
            options: {
              maxSelect: 1,
              maxSize: 5242880,
              mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
              thumbs: [],
              protected: false
            }
          });
          modified = true;
        }
        // Ensure assignedLocation is present
        const hasAssignedLocation = existing.schema.some((f) => f.name === "assignedLocation");
        if (!hasAssignedLocation) {
          existing.schema.push({ name: "assignedLocation", type: "text", required: false });
          modified = true;
        }
        // Ensure invoice is present
        const hasInvoice = existing.schema.some((f) => f.name === "invoice");
        if (!hasInvoice) {
          existing.schema.push({
            name: "invoice",
            type: "relation",
            required: false,
            options: {
              collectionId: "invoices",
              maxSelect: 1,
              cascadeDelete: false,
            }
          });
          modified = true;
        }
        if (modified) {
          console.log(`   🔄 Updating schema definition for "${collection.name}"...`);
          await pb.collections.update(existing.id, existing);
        }

        // Backfill and migrate asset_id from serialNumber for existing assets
        console.log("   🔄 Checking and migrating asset_id for existing assets...");
        const list = await pb.collection("assets").getFullList();
        for (let i = 0; i < list.length; i++) {
          const asset = list[i];
          const currentSerialNumber = asset.serialNumber || "";
          
          if (currentSerialNumber.startsWith("AST-")) {
            console.log(`      Migrating asset ${asset.id}: moving Asset ID "${currentSerialNumber}" to asset_id and clearing serialNumber.`);
            await pb.collection("assets").update(asset.id, {
              asset_id: currentSerialNumber,
              serialNumber: ""
            });
          }
        }
      } else {
        if (modified) {
          console.log(`   🔄 Updating schema definition for "${collection.name}"...`);
          await pb.collections.update(existing.id, existing);
        } else {
          console.log(`   ⚠️  Collection already exists, skipping...`);
        }
      }
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
