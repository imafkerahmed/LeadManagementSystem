import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function GET(request: Request) {
  try {
    // Get userId from verified middleware header
    const userId = request.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json({ error: "userId required (must be authenticated)" }, { status: 401 });
    }

    const pb = await getPocketBaseAdminClient();

    // Fetch user from users collection
    const user = await pb.collection("users").getOne(userId);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Return the counselor's ID and name
    return NextResponse.json({
      id: user.id,
      name: user.name || user.email || "Student Counsellor",
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("Error fetching counselor data:", error);
    return NextResponse.json(
      { error: "Failed to fetch counselor data" },
      { status: 500 },
    );
  }
}
