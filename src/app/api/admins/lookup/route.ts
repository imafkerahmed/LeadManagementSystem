import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function GET() {
  try {
    const pb = await getPocketBaseAdminClient();

    // Attempt to use admin service if available
    let admins: Array<{ id: string; email?: string; name?: string }> = [];
    try {
      // pocketbase SDK exposes an admins service
      // @ts-ignore
      const list = await pb.admins.getFullList();
      admins = (list || []).map((a: any) => ({
        id: a.id,
        email: a.email,
        name: a.name || a.email,
      }));
    } catch (e) {
      // Fall back to direct collection call if admins service isn't present
      try {
        const coll = await pb.collection("admins").getFullList();
        admins = (coll || []).map((a: any) => ({
          id: a.id,
          email: a.email,
          name: a.name || a.email,
        }));
      } catch (err) {
        // ignore, return empty array
        console.debug("No admins found or unable to list admins", err);
      }
    }

    return NextResponse.json(
      admins.map((a) => ({
        id: a.id,
        name: a.name || a.email,
        email: a.email,
      })),
    );
  } catch (error) {
    console.error("Error fetching admins lookup:", error);
    return NextResponse.json(
      { error: "Failed to fetch admins" },
      { status: 500 },
    );
  }
}
