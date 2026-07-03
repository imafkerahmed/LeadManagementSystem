import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function POST(request: NextRequest) {
  try {
    const pb = await getPocketBaseAdminClient();

    // Secure the setup route in production once initialized
    const isDev = process.env.NODE_ENV === "development";
    const setupKeyHeader = request.headers.get("x-setup-key") || "";
    const expectedSetupKey = process.env.SETUP_SECRET_TOKEN || "";
    
    let hasExistingUsers = false;
    try {
      const usersList = await pb.collection("users").getList(1, 1);
      if (usersList.totalItems > 0) {
        hasExistingUsers = true;
      }
    } catch {
      // Collection does not exist yet
    }

    const isAuthorized = 
      isDev || 
      (!hasExistingUsers) || 
      (expectedSetupKey && setupKeyHeader === expectedSetupKey);

    if (!isAuthorized) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Forbidden: Setup collections cannot be run. Initial setup is already completed and environment is not in development mode." 
        },
        { status: 403 }
      );
    }

    // Setting up PocketBase collections...

    // 1. Create Users collection
    try {
      const usersCol = await pb.collections.getOne("users");
      let updated = false;

      // Clean up legacy fields
      const leadsIdx = usersCol.schema.findIndex(
        (f: any) => f.name === "leadsEnabled",
      );
      if (leadsIdx > -1) {
        usersCol.schema.splice(leadsIdx, 1);
        updated = true;
      }
      const tasksIdx = usersCol.schema.findIndex(
        (f: any) => f.name === "tasksEnabled",
      );
      if (tasksIdx > -1) {
        usersCol.schema.splice(tasksIdx, 1);
        updated = true;
      }

      const roleField = usersCol.schema.find((f: any) => f.name === "role");
      if (roleField && roleField.type === "select") {
        const targetValues = [
          "super-admin",
          "admin",
          "student-counsellor",
          "marketing-manager",
          "admissions-head",
        ];
        const currentValues = roleField.options?.values || [];
        const hasDiff =
          currentValues.length !== targetValues.length ||
          !targetValues.every((val: string) => currentValues.includes(val));

        if (hasDiff) {
          roleField.options.values = targetValues;
          updated = true;
        }
      }

      // Secure the users collection client-side API rules
      const targetListRule = null as any;
      const targetViewRule = '@request.auth.id != ""';
      const targetCreateRule = null as any;
      const targetUpdateRule = "id = @request.auth.id";
      const targetDeleteRule = null as any;

      if (
        usersCol.listRule !== targetListRule ||
        usersCol.viewRule !== targetViewRule ||
        usersCol.createRule !== targetCreateRule ||
        usersCol.updateRule !== targetUpdateRule ||
        usersCol.deleteRule !== targetDeleteRule
      ) {
        usersCol.listRule = targetListRule;
        usersCol.viewRule = targetViewRule;
        usersCol.createRule = targetCreateRule;
        usersCol.updateRule = targetUpdateRule;
        usersCol.deleteRule = targetDeleteRule;
        updated = true;
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
            options: { values: ["active", "disabled"] },
          },
        ],
        listRule: null,
        viewRule: '@request.auth.id != ""',
        createRule: null,
        updateRule: "id = @request.auth.id",
        deleteRule: null,
      });
    }

    // Secure existing Leads, LeadHistory, Tasks, and TaskHistory collections' API rules if they already exist
    try {
      const leadsCol = await pb.collections.getOne("leads");
      const targetLeadsListRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "marketing-manager" || @request.auth.role = "admissions-head" || (assignedTo = @request.auth.id && @request.auth.role = "student-counsellor")';
      const targetLeadsViewRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "marketing-manager" || @request.auth.role = "admissions-head" || (assignedTo = @request.auth.id && @request.auth.role = "student-counsellor")';
      const targetLeadsCreateRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "student-counsellor" || @request.auth.role = "marketing-manager" || @request.auth.role = "admissions-head"';
      const targetLeadsUpdateRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "marketing-manager" || @request.auth.role = "admissions-head" || (assignedTo = @request.auth.id && @request.auth.role = "student-counsellor")';
      const targetLeadsDeleteRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';

      if (
        leadsCol.listRule !== targetLeadsListRule ||
        leadsCol.viewRule !== targetLeadsViewRule ||
        leadsCol.createRule !== targetLeadsCreateRule ||
        leadsCol.updateRule !== targetLeadsUpdateRule ||
        leadsCol.deleteRule !== targetLeadsDeleteRule
      ) {
        leadsCol.listRule = targetLeadsListRule;
        leadsCol.viewRule = targetLeadsViewRule;
        leadsCol.createRule = targetLeadsCreateRule;
        leadsCol.updateRule = targetLeadsUpdateRule;
        leadsCol.deleteRule = targetLeadsDeleteRule;
        await pb.collections.update("leads", leadsCol);
      }
    } catch (err) {
      console.error("Failed to secure leads collection rules:", err);
    }

    try {
      const historyCol = await pb.collections.getOne("leadHistory");
      const targetHistoryListRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "marketing-manager" || @request.auth.role = "admissions-head" || changedBy = @request.auth.id || leadId.assignedTo = @request.auth.id';
      const targetHistoryViewRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "marketing-manager" || @request.auth.role = "admissions-head" || changedBy = @request.auth.id || leadId.assignedTo = @request.auth.id';
      const targetHistoryCreateRule = '@request.auth.id != ""';
      const targetHistoryUpdateRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';
      const targetHistoryDeleteRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';

      if (
        historyCol.listRule !== targetHistoryListRule ||
        historyCol.viewRule !== targetHistoryViewRule ||
        historyCol.createRule !== targetHistoryCreateRule ||
        historyCol.updateRule !== targetHistoryUpdateRule ||
        historyCol.deleteRule !== targetHistoryDeleteRule
      ) {
        historyCol.listRule = targetHistoryListRule;
        historyCol.viewRule = targetHistoryViewRule;
        historyCol.createRule = targetHistoryCreateRule;
        historyCol.updateRule = targetHistoryUpdateRule;
        historyCol.deleteRule = targetHistoryDeleteRule;
        await pb.collections.update("leadHistory", historyCol);
      }
    } catch (err) {
      console.error("Failed to secure leadHistory collection rules:", err);
    }

    try {
      const tasksCol = await pb.collections.getOne("tasks");
      const targetTasksListRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "marketing-manager" || @request.auth.role = "admissions-head" || assignedTo = @request.auth.id';
      const targetTasksViewRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "marketing-manager" || @request.auth.role = "admissions-head" || assignedTo = @request.auth.id';
      const targetTasksCreateRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "admissions-head"';
      const targetTasksUpdateRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "admissions-head" || assignedTo = @request.auth.id';
      const targetTasksDeleteRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';

      if (
        tasksCol.listRule !== targetTasksListRule ||
        tasksCol.viewRule !== targetTasksViewRule ||
        tasksCol.createRule !== targetTasksCreateRule ||
        tasksCol.updateRule !== targetTasksUpdateRule ||
        tasksCol.deleteRule !== targetTasksDeleteRule
      ) {
        tasksCol.listRule = targetTasksListRule;
        tasksCol.viewRule = targetTasksViewRule;
        tasksCol.createRule = targetTasksCreateRule;
        tasksCol.updateRule = targetTasksUpdateRule;
        tasksCol.deleteRule = targetTasksDeleteRule;
        await pb.collections.update("tasks", tasksCol);
      }
    } catch (err) {
      console.error("Failed to secure tasks collection rules:", err);
    }

    try {
      const taskHistoryCol = await pb.collections.getOne("taskHistory");
      const targetTaskHistoryListRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "marketing-manager" || @request.auth.role = "admissions-head" || changedBy = @request.auth.id || taskId.assignedTo = @request.auth.id';
      const targetTaskHistoryViewRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin" || @request.auth.role = "marketing-manager" || @request.auth.role = "admissions-head" || changedBy = @request.auth.id || taskId.assignedTo = @request.auth.id';
      const targetTaskHistoryCreateRule = '@request.auth.id != ""';
      const targetTaskHistoryUpdateRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';
      const targetTaskHistoryDeleteRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';

      if (
        taskHistoryCol.listRule !== targetTaskHistoryListRule ||
        taskHistoryCol.viewRule !== targetTaskHistoryViewRule ||
        taskHistoryCol.createRule !== targetTaskHistoryCreateRule ||
        taskHistoryCol.updateRule !== targetTaskHistoryUpdateRule ||
        taskHistoryCol.deleteRule !== targetTaskHistoryDeleteRule
      ) {
        taskHistoryCol.listRule = targetTaskHistoryListRule;
        taskHistoryCol.viewRule = targetTaskHistoryViewRule;
        taskHistoryCol.createRule = targetTaskHistoryCreateRule;
        taskHistoryCol.updateRule = targetTaskHistoryUpdateRule;
        taskHistoryCol.deleteRule = targetTaskHistoryDeleteRule;
        await pb.collections.update("taskHistory", taskHistoryCol);
      }
    } catch (err) {
      console.error("Failed to secure taskHistory collection rules:", err);
    }

    try {
      const assetsCol = await pb.collections.getOne("assets");
      const targetAssetsListRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';
      const targetAssetsViewRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';
      const targetAssetsCreateRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';
      const targetAssetsUpdateRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';
      const targetAssetsDeleteRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';

      if (
        assetsCol.listRule !== targetAssetsListRule ||
        assetsCol.viewRule !== targetAssetsViewRule ||
        assetsCol.createRule !== targetAssetsCreateRule ||
        assetsCol.updateRule !== targetAssetsUpdateRule ||
        assetsCol.deleteRule !== targetAssetsDeleteRule
      ) {
        assetsCol.listRule = targetAssetsListRule;
        assetsCol.viewRule = targetAssetsViewRule;
        assetsCol.createRule = targetAssetsCreateRule;
        assetsCol.updateRule = targetAssetsUpdateRule;
        assetsCol.deleteRule = targetAssetsDeleteRule;
        await pb.collections.update("assets", assetsCol);
      }
    } catch (err) {
      console.error("Failed to secure assets collection rules:", err);
    }

    try {
      const assetHistoryCol = await pb.collections.getOne("assetHistory");
      const targetAssetHistoryListRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';
      const targetAssetHistoryViewRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';
      const targetAssetHistoryCreateRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';
      const targetAssetHistoryUpdateRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';
      const targetAssetHistoryDeleteRule = '@request.auth.role = "super-admin" || @request.auth.role = "admin"';

      if (
        assetHistoryCol.listRule !== targetAssetHistoryListRule ||
        assetHistoryCol.viewRule !== targetAssetHistoryViewRule ||
        assetHistoryCol.createRule !== targetAssetHistoryCreateRule ||
        assetHistoryCol.updateRule !== targetAssetHistoryUpdateRule ||
        assetHistoryCol.deleteRule !== targetAssetHistoryDeleteRule
      ) {
        assetHistoryCol.listRule = targetAssetHistoryListRule;
        assetHistoryCol.viewRule = targetAssetHistoryViewRule;
        assetHistoryCol.createRule = targetAssetHistoryCreateRule;
        assetHistoryCol.updateRule = targetAssetHistoryUpdateRule;
        assetHistoryCol.deleteRule = targetAssetHistoryDeleteRule;
        await pb.collections.update("assetHistory", assetHistoryCol);
      }
    } catch (err) {
      console.error("Failed to secure assetHistory collection rules:", err);
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
              values: [
                "New",
                "Ringing-No-Answer",
                "Contacted",
                "Follow-up",
                "Registered",
                "Lost",
              ],
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
        id: "8ym6u5er490f9fh",
        name: "tasks",
        type: "base",
        schema: [
          { name: "task_id", type: "text", required: false },
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
              values: ["Pending", "In-Progress", "Completed", "Cancelled"],
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
        indexes: ["CREATE UNIQUE INDEX `idx_xwYCK88` ON `tasks` (`task_id`)"],
      });
    }

    // 5. Create TaskHistory collection
    try {
      await pb.collections.getOne("taskHistory");
    } catch {
      await pb.collections.create({
        name: "taskHistory",
        type: "base",
        schema: [
          { name: "timeStamp", type: "date", required: false },
          {
            name: "taskId",
            type: "relation",
            required: false,
            options: {
              collectionId: "8ym6u5er490f9fh",
              maxSelect: 1,
              minSelect: null,
              cascadeDelete: false,
            },
          },
          { name: "eventType", type: "text", required: false },
          {
            name: "changedBy",
            type: "relation",
            required: false,
            options: {
              collectionId: "_pb_users_auth_",
              maxSelect: 1,
              minSelect: null,
              cascadeDelete: false,
            },
          },
          { name: "oldValue", type: "text", required: false },
          { name: "newValue", type: "text", required: false },
          { name: "comment", type: "text", required: false },
        ],
      });
    }

    // Create Invoices collection
    let invoicesCollectionId = "invoices0000000";
    try {
      const invColl = await pb.collections.getOne("invoices");
      invoicesCollectionId = invColl.id;
      
      // Ensure invoiceId is present
      const hasInvoiceId = invColl.schema.some((f: any) => f.name === "invoiceId");
      if (!hasInvoiceId) {
        invColl.schema.push({ name: "invoiceId", type: "text", required: false });
        await pb.collections.update(invColl.id, invColl);
      }
    } catch {
      const createdInv = await pb.collections.create({
        id: "invoices0000000",
        name: "invoices",
        type: "base",
        schema: [
          { name: "invoiceId", type: "text", required: false },
          {
            name: "file",
            type: "file",
            required: true,
            options: {
              maxSelect: 1,
              maxSize: 5242880,
              mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
              thumbs: [],
              protected: false
            }
          },
          { name: "name", type: "text", required: false }
        ],
        listRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        viewRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        createRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        updateRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        deleteRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
      });
      invoicesCollectionId = createdInv.id;
    }

    // 6. Create Assets collection
    try {
      const existing = await pb.collections.getOne("assets");
      let modified = false;

      // Ensure type is text, serialNumber is optional, and legacy assetId is optional
      existing.schema = existing.schema.map((f: any) => {
        if (f.name === "type" && f.type === "select") {
          modified = true;
          return { name: "type", type: "text", required: true };
        }
        if (f.name === "serialNumber" && f.required === true) {
          modified = true;
          return { ...f, required: false };
        }
        if (f.name === "assetId" && f.required === true) {
          modified = true;
          return { ...f, required: false };
        }
        return f;
      });

      // Ensure asset_id (snake_case) is present in schema
      const hasAssetIdNew = existing.schema.some((f: any) => f.name === "asset_id");
      if (!hasAssetIdNew) {
        existing.schema.push({ name: "asset_id", type: "text", required: true });
        modified = true;
      }

      // Ensure legacy assetId is present in schema as optional
      const hasAssetId = existing.schema.some((f: any) => f.name === "assetId");
      if (!hasAssetId) {
        existing.schema.push({ name: "assetId", type: "text", required: false });
        modified = true;
      }

      // Ensure invoiceFile is present in schema
      const hasInvoiceFile = existing.schema.some((f: any) => f.name === "invoiceFile");
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

      // Ensure assignedLocation is present in schema
      const hasAssignedLocation = existing.schema.some((f: any) => f.name === "assignedLocation");
      if (!hasAssignedLocation) {
        existing.schema.push({ name: "assignedLocation", type: "text", required: false });
        modified = true;
      }

      // Ensure invoice (relation to invoices) is present in schema
      const hasInvoiceRelation = existing.schema.some((f: any) => f.name === "invoice");
      if (!hasInvoiceRelation) {
        existing.schema.push({
          name: "invoice",
          type: "relation",
          required: false,
          options: {
            collectionId: invoicesCollectionId,
            maxSelect: 1,
            minSelect: null,
            cascadeDelete: false,
          }
        });
        modified = true;
      }

      if (modified) {
        console.log("Updating assets schema to add asset_id, make serialNumber and assetId optional...");
        await pb.collections.update(existing.id, existing);
      }

      // Migrate data from serialNumber column to asset_id column for existing records
      console.log("Migrating data from serialNumber column to asset_id column...");
      const list = await pb.collection("assets").getFullList();
      for (let i = 0; i < list.length; i++) {
        const asset = list[i];
        const currentSerialNumber = asset.serialNumber || "";
        
        // If the serialNumber contains an Asset ID (starts with "AST-")
        if (currentSerialNumber.startsWith("AST-")) {
          console.log(`Migrating asset ${asset.id}: moving Asset ID "${currentSerialNumber}" to asset_id and clearing serialNumber.`);
          await pb.collection("assets").update(asset.id, {
            asset_id: currentSerialNumber,
            serialNumber: "" // Clear serialNumber as it was holding the Asset ID
          });
        }
      }

      // Migrate old invoice files to the new invoices collection
      console.log("Checking for assets with legacy invoice files to migrate...");
      const listAssets = await pb.collection("assets").getFullList();
      const invoiceFileToRecordMap: { [filename: string]: string } = {};

      try {
        const existingInvoices = await pb.collection("invoices").getFullList();
        for (const inv of existingInvoices) {
          if (inv.file) {
            invoiceFileToRecordMap[inv.file] = inv.id;
          }
          if (!inv.invoiceId) {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            let randId = "";
            for (let j = 0; j < 6; j++) {
              randId += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const generatedId = `INV-${randId}`;
            console.log(`Backfilling invoiceId "${generatedId}" for existing invoice ${inv.id}...`);
            await pb.collection("invoices").update(inv.id, { invoiceId: generatedId });
          }
        }
      } catch (e) {
        console.error("Error loading existing invoices:", e);
      }

      for (let i = 0; i < listAssets.length; i++) {
        const asset = listAssets[i];
        if (asset.invoiceFile && !asset.invoice) {
          console.log(`Migrating legacy invoice "${asset.invoiceFile}" of asset ${asset.id}...`);
          try {
            if (invoiceFileToRecordMap[asset.invoiceFile]) {
              const invId = invoiceFileToRecordMap[asset.invoiceFile];
              await pb.collection("assets").update(asset.id, { invoice: invId });
              console.log(`Linked asset ${asset.id} to existing invoice ${invId}`);
            } else {
              const fileUrl = `${pb.baseUrl || "https://amazoncrm-db.codix.site"}/api/files/assets/${asset.id}/${asset.invoiceFile}`;
              const fileResponse = await fetch(fileUrl);
              if (fileResponse.ok) {
                const blob = await fileResponse.blob();
                const cleanName = asset.invoiceFile.split("_").slice(2).join("_") || asset.invoiceFile;
                const fileObj = new File([blob], cleanName, { type: blob.type });

                const form = new FormData();
                form.append("file", fileObj);
                form.append("name", cleanName);

                const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                let randId = "";
                for (let j = 0; j < 6; j++) {
                  randId += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                form.append("invoiceId", `INV-${randId}`);

                const invoiceRecord = await pb.collection("invoices").create(form);
                invoiceFileToRecordMap[asset.invoiceFile] = invoiceRecord.id;

                await pb.collection("assets").update(asset.id, { invoice: invoiceRecord.id });
                console.log(`Successfully migrated invoice file to invoices collection (id: ${invoiceRecord.id}) and linked to asset ${asset.id}`);
              } else {
                console.warn(`Failed to fetch file from URL: ${fileUrl}`);
              }
            }
          } catch (migrateErr) {
            console.error(`Failed to migrate invoice for asset ${asset.id}:`, migrateErr);
          }
        }
      }

      // DEDUPLICATE INVOICES: Keep exactly 1 invoice for all assets
      console.log("Starting invoices collection consolidation...");
      try {
        const allInvoices = await pb.collection("invoices").getFullList({ sort: "created" });
        if (allInvoices.length > 1) {
          const primaryInv = allInvoices[0];
          console.log(`Consolidating invoices: keeping primary invoice ${primaryInv.id} (${primaryInv.file}) and deleting the remaining ${allInvoices.length - 1}...`);
          
          const assetsToUpdate = await pb.collection("assets").getFullList();
          for (const asset of assetsToUpdate) {
            if (asset.invoice || asset.invoiceFile) {
              if (asset.invoice !== primaryInv.id) {
                console.log(`Re-linking asset ${asset.id} to primary invoice ${primaryInv.id}...`);
                await pb.collection("assets").update(asset.id, { invoice: primaryInv.id });
              }
            }
          }
          
          for (let k = 1; k < allInvoices.length; k++) {
            const dupInv = allInvoices[k];
            console.log(`Deleting duplicate invoice record ${dupInv.id} (${dupInv.file})...`);
            await pb.collection("invoices").delete(dupInv.id);
          }
        }
        console.log("Invoices consolidation complete.");
      } catch (dedupErr) {
        console.error("Error during invoices consolidation:", dedupErr);
      }
    } catch {
      await pb.collections.create({
        id: "assets000000001",
        name: "assets",
        type: "base",
        schema: [
          { name: "asset_id", type: "text", required: true },
          { name: "assetId", type: "text", required: false },
          { name: "name", type: "text", required: true },
          { name: "type", type: "text", required: true },
          { name: "brand", type: "text", required: true },
          { name: "model", type: "text", required: false },
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
            required: false,
            options: {
              collectionId: "_pb_users_auth_",
              maxSelect: 1,
              minSelect: null,
              cascadeDelete: false,
            },
          },
          { name: "assignedAt", type: "date", required: false },
          { name: "assignedLocation", type: "text", required: false },
          { name: "purchaseDate", type: "date", required: false },
          { name: "purchaseCost", type: "number", required: false },
          { name: "warrantyExpiry", type: "date", required: false },
          { name: "notes", type: "text", required: false },
          {
            name: "invoice",
            type: "relation",
            required: false,
            options: {
              collectionId: "invoices0000000",
              maxSelect: 1,
              minSelect: null,
              cascadeDelete: false,
            }
          },
          {
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
          },
        ],
        listRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        viewRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        createRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        updateRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        deleteRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
      });
    }

    // 7. Create AssetHistory collection
    try {
      await pb.collections.getOne("assetHistory");
    } catch {
      await pb.collections.create({
        id: "assethistory101",
        name: "assetHistory",
        type: "base",
        schema: [
          {
            name: "assetId",
            type: "relation",
            required: true,
            options: {
              collectionId: "assets000000001",
              maxSelect: 1,
              minSelect: null,
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
              minSelect: null,
              cascadeDelete: false,
            },
          },
          { name: "action", type: "text", required: true },
          { name: "details", type: "text", required: true },
          { name: "date", type: "date", required: true },
        ],
        listRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        viewRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        createRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        updateRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
        deleteRule: '@request.auth.role = "super-admin" || @request.auth.role = "admin"',
      });
    }

    try {
      const acCol = await pb.collections.getOne("accessControl");
      const targetPageField = acCol.schema.find(
        (f: any) => f.name === "targetPage",
      );
      if (targetPageField && targetPageField.type === "select") {
        const targetValues = ["admin", "user"];
        const currentValues = targetPageField.options?.values || [];
        const hasDiff =
          currentValues.length !== targetValues.length ||
          !targetValues.every((val: string) => currentValues.includes(val));
        if (hasDiff) {
          targetPageField.options.values = targetValues;
          await pb.collections.update("accessControl", acCol);
        }
      }
    } catch {
      await pb.collections.create({
        name: "accessControl",
        type: "base",
        schema: [
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
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: "",
        updateRule: '@request.auth.role = "super-admin"',
        deleteRule: "",
      });
    }

    // Seed default rules (idempotent seeder: only create if sectionKey does not exist)
    const defaultRules = [
      {
        sectionKey: "admin_dashboard",
        displayName: "Dashboard Tab",
        targetPage: "admin",
        allowedRoles: [
          "super-admin",
          "admin",
          "admissions-head",
          "marketing-manager",
        ],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_leads",
        displayName: "All Leads Tab",
        targetPage: "admin",
        allowedRoles: [
          "super-admin",
          "admin",
          "admissions-head",
          "marketing-manager",
        ],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_tasks",
        displayName: "Tasks Tab",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin", "admissions-head"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_bulk",
        displayName: "Bulk Upload Tab",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin", "marketing-manager"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_reports",
        displayName: "Reports Tab",
        targetPage: "admin",
        allowedRoles: [
          "super-admin",
          "admin",
          "admissions-head",
          "marketing-manager",
        ],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_settings",
        displayName: "Settings Tab",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_user_management",
        displayName: "User Directory Control",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_leads_edit",
        displayName: "Edit Lead Details",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin", "admissions-head"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_leads_delete",
        displayName: "Delete Lead Records",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_tasks_create",
        displayName: "Create New Tasks",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin", "admissions-head"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_tasks_edit",
        displayName: "Edit Task Details",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin", "admissions-head"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_tasks_delete",
        displayName: "Delete Task Records",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin", "admissions-head"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_assets",
        displayName: "Asset Management Tab",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_assets_create",
        displayName: "Create Assets",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_assets_edit",
        displayName: "Edit Assets",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "admin_assets_delete",
        displayName: "Delete Assets",
        targetPage: "admin",
        allowedRoles: ["super-admin", "admin"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },

      {
        sectionKey: "user_leads",
        displayName: "Leads Tab",
        targetPage: "user",
        allowedRoles: ["student-counsellor"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "user_tasks",
        displayName: "Tasks Tab",
        targetPage: "user",
        allowedRoles: ["student-counsellor"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "user_add_lead",
        displayName: "Create Lead Records",
        targetPage: "user",
        allowedRoles: ["student-counsellor"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "user_edit_followup",
        displayName: "Modify Follow-Up Dates",
        targetPage: "user",
        allowedRoles: ["super-admin", "admin", "admissions-head"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "user_update_registered_lost",
        displayName: "Set Terminal Statuses",
        targetPage: "user",
        allowedRoles: [
          "super-admin",
          "admin",
          "admissions-head",
          "student-counsellor",
        ],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
      {
        sectionKey: "user_tasks_complete",
        displayName: "Complete Task Records",
        targetPage: "user",
        allowedRoles: ["student-counsellor"],
        allowedUsers: [],
        deniedUsers: [],
        enabled: true,
      },
    ];

    for (const rule of defaultRules) {
      try {
        await pb
          .collection("accessControl")
          .getFirstListItem(`sectionKey = "${rule.sectionKey}"`);
      } catch {
        await pb.collection("accessControl").create(rule);
      }
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
