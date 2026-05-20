import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

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

type DuplicateLeadInfo = {
  row: number;
  studentName: string;
  mobileWithCountry: string;
  assignedTo?: string;
  course?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leads } = body;

    if (!leads || !Array.isArray(leads)) {
      return NextResponse.json({ error: "Invalid leads list" }, { status: 400 });
    }

    const pb = await getPocketBaseAdminClient();

    const normalizedLeads = leads
      .map((lead, idx) => ({
        row: idx + 2,
        studentName: lead.studentName || "",
        mobileWithCountry: normalizeMobileWithCountry(lead.mobileWithCountry || lead.mobile || ""),
        course: lead.course || ""
      }))
      .filter(l => l.mobileWithCountry);

    if (normalizedLeads.length === 0) {
      return NextResponse.json({ duplicates: [] });
    }

    const duplicatesList: DuplicateLeadInfo[] = [];
    const batchSize = 50;

    for (let i = 0; i < normalizedLeads.length; i += batchSize) {
      const batch = normalizedLeads.slice(i, i + batchSize);
      const filterString = batch
        .map(l => `mobileWithCountry = "${l.mobileWithCountry}"`)
        .join(" || ");

      try {
        const existing = await pb.collection("leads").getFullList({
          filter: filterString,
          expand: "assignedTo",
          fields: "id,mobileWithCountry,studentName,course,assignedTo,expand.assignedTo.name,expand.assignedTo.email",
        });

        for (const item of existing) {
          const matchingDraft = batch.find(
            b => b.mobileWithCountry === item.mobileWithCountry
          );
          if (matchingDraft) {
            duplicatesList.push({
              row: matchingDraft.row,
              studentName: item.studentName || matchingDraft.studentName || "",
              mobileWithCountry: item.mobileWithCountry,
              assignedTo:
                item.expand?.assignedTo?.name ||
                item.expand?.assignedTo?.email ||
                item.assignedTo ||
                "",
              course: item.course || matchingDraft.course || ""
            });
          }
        }
      } catch (err) {
        console.error("Batch check error:", err);
      }
    }

    return NextResponse.json({ duplicates: duplicatesList });
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Failed to check duplicates";
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
