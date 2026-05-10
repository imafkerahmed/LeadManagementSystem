#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/*
  Merge duplicate leads by canonical `mobileWithCountry`.
  - Dry-run by default: prints planned merges and writes `merge_dry_run.json`.
  - Use `--apply` to perform merges and delete duplicate records (destructive).
  - Requires POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASS env vars.

  Usage:
    node scripts/merge_duplicates.js        # dry-run
    node scripts/merge_duplicates.js --apply  # apply changes (destructive)
*/

const fs = require("fs");
const path = require("path");
const PocketBase = require("pocketbase/cjs");

function normalizeMobile(value) {
  if (!value) return "";
  const compact = String(value).trim();
  const cleaned = compact.replace(/[^+\d]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return "+" + cleaned.slice(1).replace(/\D/g, "");
  return "+" + cleaned.replace(/\D/g, "");
}

async function authAdmin(pbUrl, email, pass) {
  const pb = new PocketBase(pbUrl);
  const authUrl = new URL("/api/admins/auth-with-password", pbUrl).toString();
  const resp = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password: pass }),
  });
  if (!resp.ok) throw new Error("Admin auth failed: " + resp.status);
  const data = await resp.json();
  if (!data.token) throw new Error("No auth token received");
  const adminModel = {
    id: data.admin?.id || "",
    collectionId: "",
    collectionName: "",
  };
  pb.authStore.save(data.token, adminModel);
  return pb;
}

function pickPrimary(leads) {
  // Prefer lead with non-empty `course`, else earliest created
  const withCourse = leads.filter((l) => l.course && String(l.course).trim());
  if (withCourse.length === 1) return withCourse[0];
  if (withCourse.length > 1) return withCourse[0];

  // fallback to earliest created/addedDate
  const byCreated = leads.slice().sort((a, b) => {
    const ta = new Date(a.created || a.addedDate || 0).getTime() || 0;
    const tb = new Date(b.created || b.addedDate || 0).getTime() || 0;
    return ta - tb;
  });
  return byCreated[0];
}

async function main() {
  const pbUrl = process.env.POCKETBASE_URL || "http://127.0.0.1:8090";
  const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
  const adminPass = process.env.POCKETBASE_ADMIN_PASS;
  const apply = process.argv.includes("--apply");

  if (!adminEmail || !adminPass) {
    console.error("Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASS");
    process.exit(1);
  }

  const pb = await authAdmin(pbUrl, adminEmail, adminPass);
  console.log("Authenticated to PocketBase at", pbUrl);

  const allLeads = await pb
    .collection("leads")
    .getFullList({ sort: "-created" });
  console.log("Leads fetched:", allLeads.length);

  // Group by normalized mobileWithCountry
  const groups = new Map();
  for (const l of allLeads) {
    const raw = l.mobileWithCountry || l.mobile || l.mobileNo || "";
    const key = normalizeMobile(raw) || "id:" + l.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }

  const duplicates = [];
  for (const [key, group] of groups.entries()) {
    if (group.length <= 1) continue;
    duplicates.push({ key, group });
  }

  console.log("Duplicate groups found:", duplicates.length);
  const actions = [];

  for (const dup of duplicates) {
    const group = dup.group;
    const primary = pickPrimary(group);
    const others = group.filter((g) => g.id !== primary.id);

    const plan = {
      primary: {
        id: primary.id,
        leadId: primary.leadId || null,
        studentName: primary.studentName || null,
      },
      duplicates: others.map((o) => ({
        id: o.id,
        leadId: o.leadId || null,
        studentName: o.studentName || null,
      })),
      key: dup.key,
    };

    actions.push(plan);

    if (apply) {
      // Merge fields from duplicates into primary
      const update = {};
      for (const o of others) {
        if ((!primary.course || primary.course === "") && o.course)
          update.course = o.course;
        if ((!primary.email || primary.email === "") && o.email)
          update.email = o.email;
        if ((!primary.assignedTo || primary.assignedTo === "") && o.assignedTo)
          update.assignedTo = o.assignedTo;
        if (
          (!primary.latestComment || primary.latestComment === "") &&
          o.latestComment
        )
          update.latestComment = o.latestComment;
      }

      if (Object.keys(update).length > 0) {
        try {
          await pb.collection("leads").update(primary.id, update);
          console.log("Updated primary", primary.id, update);
        } catch (err) {
          console.error(
            "Failed to update primary",
            primary.id,
            err.message || err,
          );
        }
      }

      // Move history entries and delete duplicates
      for (const o of others) {
        try {
          const histories = await pb
            .collection("leadHistory")
            .getFullList({ filter: `leadId = "${o.id}"` });
          for (const h of histories) {
            const newH = { ...h };
            delete newH.id;
            newH.leadId = primary.id;
            try {
              await pb.collection("leadHistory").create(newH);
            } catch (createErr) {
              console.warn(
                "Failed to copy history item for",
                o.id,
                createErr.message || createErr,
              );
            }
          }

          // Delete the duplicate lead
          await pb.collection("leads").delete(o.id);
          console.log("Deleted duplicate lead", o.id);
        } catch (err) {
          console.error("Error processing duplicate", o.id, err.message || err);
        }
      }
    }
  }

  const outName = apply ? "merge_log.json" : "merge_dry_run.json";
  const outPath = path.join(process.cwd(), outName);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      { date: new Date().toISOString(), apply: !!apply, actions },
      null,
      2,
    ),
  );
  console.log(
    apply ? "Merge applied." : "Dry-run complete.",
    "Log written to",
    outPath,
  );
}

main().catch((e) => {
  console.error("Merge failed:", e.message || e);
  process.exit(1);
});
