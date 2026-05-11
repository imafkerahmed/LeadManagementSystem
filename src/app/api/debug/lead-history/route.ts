import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function GET() {
  try {
    const pb = await getPocketBaseAdminClient();
    const history = await pb.collection("leadHistory").getFullList({
      sort: "-created",
      perPage: 10,
      expand: "changedBy,studentName,leadId",
    });

    return NextResponse.json(history || []);
  } catch (error) {
    console.error(
      "Debug lead-history error:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
