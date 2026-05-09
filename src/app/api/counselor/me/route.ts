import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function GET(request: Request) {
  try {
    // Get userId from query params (passed from client)
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
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
