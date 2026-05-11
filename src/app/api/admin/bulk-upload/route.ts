import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

function generateLeadId(lastNum: number): string {
  return `AMZ/LEAD/${String(lastNum + 1).padStart(4, "0")}`;
}

function normalizeMobileWithCountry(value: string): string {
  const compact = value.trim().replace(/[^\d+]/g, "");
  if (!compact) return "";

  if (compact.startsWith("+")) {
    return `+${compact.replace(/\D/g, "")}`;
  }

  // Accept digit-only values from CSV (e.g. 94718777704) as canonical intl format.
  const digits = compact.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

type CounselorRecord = {
  id: string;
  name?: string;
  email?: string;
};

type DuplicateLeadInfo = {
  row: number;
  studentName: string;
  mobileWithCountry: string;
  assignedTo?: string;
};

async function getAssignableCounselors(
  pb: Awaited<ReturnType<typeof getPocketBaseAdminClient>>,
  selectedCounselorIds?: string[],
) {
  // Get all users with accountStatus = "enabled" or "active", regardless of role
  const enabledFilter =
    '(accountStatus = "enabled" || accountStatus = "active")';

  let counselors = [] as CounselorRecord[];

  try {
    counselors = (await pb.collection("users").getFullList({
      filter: enabledFilter,
      fields: "id,name,email",
    })) as CounselorRecord[];
  } catch (error) {
    console.error("Error fetching enabled users:", error);
    // Return empty array on error
  }

  const selectedIds = selectedCounselorIds?.filter(Boolean) ?? [];
  if (selectedIds.length > 0) {
    counselors = counselors.filter((counselor) =>
      selectedIds.includes(counselor.id),
    );
  }

  return counselors.filter((counselor) => counselor.id && counselor.name);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      leads,
      assignmentMethod,
      selectedCounselorIds,
      singleCounselor,
      performedBy,
      performedByLabel,
    } = body;

    if (!leads || leads.length === 0) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    const pb = await getPocketBaseAdminClient();

    // Get the last lead ID
    const existingLeads = await pb.collection("leads").getFullList({
      sort: "-created",
      limit: 1,
    });

    let currentNum = 0;
    if (existingLeads.length > 0) {
      const lastLead = existingLeads[0];
      const match = lastLead.leadId.match(/AMZ\/LEAD\/(\d+)/);
      if (match) {
        currentNum = parseInt(match[1]);
      }
    }

    const now = new Date();
    let uploadedCount = 0;
    let failedCount = 0;
    const errors: Array<{ row: number; message: string }> = [];
    const duplicateLeads: DuplicateLeadInfo[] = [];

    const counselors = await getAssignableCounselors(pb, selectedCounselorIds);

    if (counselors.length === 0 && !singleCounselor) {
      return NextResponse.json(
        {
          success: false,
          uploaded: 0,
          failed: leads.length,
          message: "No active counselors available for assignment",
        },
        { status: 400 },
      );
    }

    const counselorIds = counselors.map((counselor) => counselor.id || "");
    const counselorNamesById = Object.fromEntries(
      counselors.map((c) => [c.id || "", c.name || ""]),
    );
    let currentCounselorIndex = 0;

    const getBalancedCounselorId = (leadIndex: number) => {
      if (counselorIds.length === 0) return "";

      const baseCount = Math.floor(leads.length / counselorIds.length);
      const remainder = leads.length % counselorIds.length;

      let cursor = 0;
      for (
        let counselorIndex = 0;
        counselorIndex < counselorIds.length;
        counselorIndex++
      ) {
        const takeCount = baseCount + (counselorIndex < remainder ? 1 : 0);
        if (leadIndex < cursor + takeCount) {
          return counselorIds[counselorIndex];
        }
        cursor += takeCount;
      }

      return counselorIds[counselorIds.length - 1] || "";
    };

    // Upload each lead
    for (let i = 0; i < leads.length; i++) {
      try {
        const lead = leads[i];

        // Validate required fields
        if (!lead.studentName || !lead.course) {
          errors.push({ row: i + 2, message: "Missing required fields" });
          failedCount++;
          continue;
        }

        const mobileWithCountry = normalizeMobileWithCountry(
          lead.mobileWithCountry || lead.mobile || "",
        );
        if (!mobileWithCountry) {
          errors.push({ row: i + 2, message: "Missing mobile number" });
          failedCount++;
          continue;
        }

        // Skip insert when this mobile already exists and collect duplicates for user review.
        try {
          const existingLead = await pb
            .collection("leads")
            .getFirstListItem(`mobileWithCountry = \"${mobileWithCountry}\"`, {
              expand: "assignedTo",
              fields:
                "id,mobileWithCountry,studentName,assignedTo,expand.assignedTo.name,expand.assignedTo.email",
            });

          duplicateLeads.push({
            row: i + 2,
            studentName: existingLead.studentName || lead.studentName || "",
            mobileWithCountry,
            assignedTo:
              existingLead.expand?.assignedTo?.name ||
              existingLead.expand?.assignedTo?.email ||
              existingLead.assignedTo ||
              "",
          });
          failedCount++;
          continue;
        } catch (lookupError: unknown) {
          const status =
            lookupError instanceof Object && "status" in lookupError
              ? (lookupError as { status?: number }).status
              : undefined;
          if (status !== 404) {
            throw lookupError;
          }
        }

        // Determine assigned counselor id (PocketBase relation expects IDs)
        let assignedCounselorId = singleCounselor;

        if (assignmentMethod === "roundRobin" && counselorIds.length > 0) {
          assignedCounselorId = counselorIds[currentCounselorIndex];
          currentCounselorIndex =
            (currentCounselorIndex + 1) % counselorIds.length;
        }

        if (assignmentMethod === "equalSplit" && counselorIds.length > 0) {
          assignedCounselorId = getBalancedCounselorId(i);
        }

        if (!assignedCounselorId) {
          errors.push({ row: i + 2, message: "No counselor assigned" });
          failedCount++;
          continue;
        }

        currentNum++;
        const leadId = generateLeadId(currentNum - 1);

        const initLog = JSON.stringify([
          {
            date: now.toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            author: "System",
            status: "New",
            text: "Lead imported",
          },
        ]);
        // Attempt to create lead and capture richer errors when they occur
        try {
          const leadNow = now.toISOString();
          const createdLead = await pb.collection("leads").create({
            leadId,
            studentName: lead.studentName,
            mobileWithCountry,
            email: lead.email || "",
            course: lead.course,
            leadSource: lead.leadSource || "Bulk Upload",
            leadSourceDetail: lead.leadSourceDetail || "",
            // write both status variants used across codebase
            leadStatus: "New",
            status: "New",
            assignedTo: assignedCounselorId,
            latestComment: "Lead imported",
            addedDate: leadNow,
            lastModified: leadNow,
            commentLog: initLog,
          });

          try {
            await pb.collection("leadHistory").create({
              timeStamp: now,
              leadId: createdLead.id,
              studentName: createdLead.id,
              eventType: "Lead Created",
              changedBy: performedBy,
              newValue: "New",
              comment: `${performedByLabel || "Bulk Upload"} · ${
                assignmentMethod === "roundRobin"
                  ? `Round Robin → ${counselorNamesById[assignedCounselorId] || assignedCounselorId}`
                  : assignmentMethod === "equalSplit"
                    ? `Equal Split → ${counselorNamesById[assignedCounselorId] || assignedCounselorId}`
                    : `Single Counselor → ${counselorNamesById[assignedCounselorId] || assignedCounselorId}`
              }`,
            });
          } catch (historyError) {
            console.warn("Lead history log skipped:", historyError);
          }

          uploadedCount++;
        } catch (createError: unknown) {
          failedCount++;

          // Try to extract pocketbase validation details when available
          let detail =
            createError instanceof Error
              ? createError.message
              : String(createError);
          try {
            if (createError instanceof Object && "data" in createError)
              detail += ` | ${JSON.stringify((createError as Record<string, unknown>).data)}`;
            else if (
              createError instanceof Object &&
              "response" in createError
            ) {
              const response = (createError as Record<string, unknown>)
                .response;
              if (response instanceof Object && "data" in response)
                detail += ` | ${JSON.stringify((response as Record<string, unknown>).data)}`;
            }
          } catch {
            // ignore JSON errors
          }

          errors.push({ row: i + 2, message: detail });
          // continue to next row
          continue;
        }
      } catch (error) {
        failedCount++;
        errors.push({
          row: i + 2,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      uploaded: uploadedCount,
      failed: failedCount,
      message: `${uploadedCount} leads uploaded successfully`,
      errors: errors.length > 0 ? errors : undefined,
      duplicates: duplicateLeads.length > 0 ? duplicateLeads : undefined,
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Failed to upload leads";
    console.error("Error uploading leads:", errorMsg);
    console.error("Full error details:", {
      message: errorMsg,
      error: error,
      stack: error instanceof Error ? error.stack : "No stack",
    });
    return NextResponse.json(
      {
        error: errorMsg,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
