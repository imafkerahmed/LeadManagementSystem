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
      console.error("Failed to secure leads collection rules in pocketbase.ts:", err);
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
      console.error("Failed to secure leadHistory collection rules in pocketbase.ts:", err);
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
      console.error("Failed to secure tasks collection rules in pocketbase.ts:", err);
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
      console.error("Failed to secure taskHistory collection rules in pocketbase.ts:", err);
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
              values: [
                "New",
                "Ringing-No-Answer",
                "Contacted",
                "Follow-up",
                "Registered",
                "Lost",
              ],
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
            options: {
              values: ["Pending", "In-Progress", "Completed", "Cancelled"],
            },
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
        indexes: ["CREATE UNIQUE INDEX `idx_xwYCK88` ON `tasks` (`task_id`)"],
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

    // PocketBase collections setup completed
  } catch (error) {
    console.error(
      "Error setting up PocketBase collections:",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
