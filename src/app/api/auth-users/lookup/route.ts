import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function GET() {
  try {
    const pb = await getPocketBaseAdminClient();

    // _pb_users_auth_ stores auth user records (counsellors/students)
    const list = await pb.collection("_pb_users_auth_").getFullList();

    const users = (list || []).map((u: any) => ({
      id: u.id,
      name: u.name || u.username || u.email || u.id,
      email: u.email,
    }));

    return NextResponse.json(users);
  } catch (error) {
    console.error("Error fetching auth users:", error);
    return NextResponse.json(
      { error: "Failed to fetch auth users" },
      { status: 500 },
    );
  }
}
