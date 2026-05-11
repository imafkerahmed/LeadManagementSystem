import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

const AUTH_COLLECTION = "_pb_users_auth_";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = (body.userId || "").trim();
    const newPassword = body.newPassword || "";

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { error: "newPassword must be a string with at least 8 characters" },
        { status: 400 },
      );
    }

    const pb = await getPocketBaseAdminClient();

    // Update the auth user password
    try {
      await pb.collection(AUTH_COLLECTION).update(userId, {
        password: newPassword,
        passwordConfirm: newPassword,
      });
    } catch (err) {
      console.error("Failed to update auth user password:", err);
      return NextResponse.json(
        { error: "Failed to reset password" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, message: "Password reset" });
  } catch (error) {
    console.error("Error in reset-password route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
