import PocketBase from "pocketbase";

const defaultPocketBaseUrl = "https://amazoncrm-db.codix.site";

export const pocketBaseUrl = (
  process.env.NEXT_PUBLIC_POCKETBASE_URL ?? defaultPocketBaseUrl
).replace(/\/$/, "");

const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || "";

let pbClientInstance: PocketBase | null = null;
let pbAdminInstance: PocketBase | null = null;

export function createPocketBaseClient() {
  if (!pbClientInstance) {
    pbClientInstance = new PocketBase(pocketBaseUrl);
    pbClientInstance.autoCancellation(false);
  }
  return pbClientInstance;
}

export async function getPocketBaseAdminClient() {
  if (!pbAdminInstance) {
    pbAdminInstance = new PocketBase(pocketBaseUrl);
    pbAdminInstance.autoCancellation(false);
  }

  if (!pbAdminInstance.authStore.isValid) {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      const msg =
        "POCKETBASE admin credentials are not configured (POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD).";
      console.error(msg);
      throw new Error(msg);
    }

    try {
      // Use HTTP API directly instead of SDK method to support newer PocketBase versions
      const authUrl = new URL(
        "/api/admins/auth-with-password",
        pocketBaseUrl,
      ).toString();
      const response = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Admin auth failed: ${response.status} ${errorData.message || response.statusText}`,
        );
      }

      const data = (await response.json()) as {
        token?: string;
        admin?: { id?: string };
      };

      // Manually set the token in the PocketBase client
      if (data.token) {
        // pb SDK expects an AuthRecord or undefined; set up minimal admin model
        const adminModel: Record<string, unknown> = {
          id: data.admin?.id || "",
          collectionId: "",
          collectionName: "",
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pbAdminInstance.authStore.save(data.token, adminModel as any);
      } else {
        throw new Error("No auth token received from PocketBase");
      }
    } catch (error) {
      console.error(
        "Failed to authenticate as admin:",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  return pbAdminInstance;
}

export async function checkPocketBaseHealth() {
  const healthUrl = new URL("/api/health", pocketBaseUrl).toString();

  try {
    const response = await fetch(healthUrl, {
      cache: "no-store",
    });

    const body = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      healthUrl,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: null as number | null,
      healthUrl,
      body: error instanceof Error ? error.message : "Unknown PocketBase error",
    };
  }
}

export async function setupPocketBaseCollections(): Promise<void> {
  const pb = await getPocketBaseAdminClient();

  try {
    // Create Users collection if not exists, or update it
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
            options: { values: ["admin", "student-counsellor", "only-task-view"] },
          },
          {
            name: "accountStatus",
            type: "select",
            required: true,
            options: { values: ["active", "disabled"] },
          },
          { name: "leadsEnabled", type: "bool", required: false },
          { name: "tasksEnabled", type: "bool", required: false },
        ],
      });
    }

    // Create Leads collection
    try {
      await pb.collections.getOne("leads");
    } catch {
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
            },
          },
          { name: "assignedTo", type: "text", required: true },
          { name: "comments", type: "text" },
          { name: "commentLog", type: "json" },
          { name: "lastModified", type: "date" },
        ],
      });
    }

    // Create LeadHistory collection
    try {
      await pb.collections.getOne("leadHistory");
    } catch {
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
    }

    // Create Tasks collection
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
            options: { values: ["Pending", "In-Progress", "Completed", "Cancelled"] },
          },
          {
            name: "priority",
            type: "select",
            required: true,
            options: { values: ["Low", "Medium", "High"] },
          },
          { name: "createdBy", type: "text" },
          { name: "notes", type: "text" },
        ],
        indexes: [
          "CREATE UNIQUE INDEX `idx_xwYCK88` ON `tasks` (`task_id`)"
        ]
      });
    }

    // Create TaskHistory collection
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

    // PocketBase collections setup completed
  } catch (error) {
    console.error(
      "Error setting up PocketBase collections:",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
