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
        allowedRoles: ["super-admin", "admin", "admissions-head"],
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
