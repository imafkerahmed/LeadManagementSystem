#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/*
  Migration script (non-destructive)
  - Copies `courseName` -> `course` when `course` is empty
  - Normalizes `mobileWithCountry` to `+{country}{digits}` (no dash)
  - Logs changes to stdout and writes `migration_log.json` in project root

  Usage: node scripts/normalize_leads.js
  Requires environment to have PocketBase admin credentials configured the same as getPocketBaseAdminClient()
*/

const fs = require("fs");
const path = require("path");
const PocketBase = require("pocketbase/cjs");

function normalizeMobileWithCountry(value) {
  if (!value) return "";
  const compact = String(value).trim();
  // remove spaces and non-digit/plus
  const cleaned = compact.replace(/[^+\d]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) {
    return "+" + cleaned.slice(1).replace(/\D/g, "");
  }
  // assume digits only, prefix +
  return "+" + cleaned.replace(/\D/g, "");
}

async function main() {
  const pbUrl = process.env.POCKETBASE_URL || "http://127.0.0.1:8090";
  const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
  const adminPass = process.env.POCKETBASE_ADMIN_PASS;
  const dryRun =
    process.argv.includes("--dry-run") || process.argv.includes("-d");

  if (!adminEmail || !adminPass) {
    console.error(
      "Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASS env vars",
    );
    process.exit(1);
  }

  const pb = new PocketBase(pbUrl);

  // Authenticate as admin using the same HTTP flow used in the app
  try {
    const authUrl = new URL("/api/admins/auth-with-password", pbUrl).toString();
    const response = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: adminEmail, password: adminPass }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Admin auth failed: ${response.status} ${errorData.message || response.statusText}`,
      );
    }

    const data = await response.json();
    if (!data.token) throw new Error("No auth token received from PocketBase");

    const adminModel = {
      id: data.admin?.id || "",
      collectionId: "",
      collectionName: "",
    };
    pb.authStore.save(data.token, adminModel);
    console.log("Authenticated to PocketBase at", pbUrl);
  } catch (err) {
    console.error("Failed to authenticate as admin:", err.message || err);
    process.exit(1);
  }

  const allLeads = await pb
    .collection("leads")
    .getFullList({ sort: "-created" });
  console.log("Leads fetched:", allLeads.length);

  const log = [];

  for (const lead of allLeads) {
    const updates = {};
    const origCourse = lead.course || null;
    const origCourseName = lead.courseName || null;
    const origMobile = lead.mobileWithCountry || lead.mobile || null;

    // course fallback
    if (
      (!lead.course || String(lead.course).trim() === "") &&
      lead.courseName
    ) {
      updates.course = lead.courseName;
    }

    // normalize mobileWithCountry
    const normalized = normalizeMobileWithCountry(
      lead.mobileWithCountry || lead.mobile || "",
    );
    if (normalized && normalized !== (lead.mobileWithCountry || "")) {
      updates.mobileWithCountry = normalized;
    }

    if (Object.keys(updates).length > 0) {
      const entry = {
        id: lead.id,
        leadId: lead.leadId || null,
        before: {
          course: origCourse,
          courseName: origCourseName,
          mobileWithCountry: origMobile,
        },
        after: updates,
      };

      if (dryRun) {
        console.log("[dry-run] Would update lead", lead.id, updates);
        log.push(entry);
      } else {
        try {
          await pb.collection("leads").update(lead.id, updates);
          console.log("Updated lead", lead.id, updates);
          log.push(entry);
        } catch (err) {
          console.error("Failed to update lead", lead.id, err.message || err);
          log.push({ id: lead.id, error: String(err) });
        }
      }
    }
  }

  const outName = dryRun ? "migration_dry_run.json" : "migration_log.json";
  const outPath = path.join(process.cwd(), outName);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      { date: new Date().toISOString(), dryRun: !!dryRun, changes: log },
      null,
      2,
    ),
  );
  console.log(
    dryRun ? "Dry-run complete." : "Migration complete.",
    "Log written to",
    outPath,
  );
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
