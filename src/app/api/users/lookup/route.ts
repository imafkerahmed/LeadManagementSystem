import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  accountStatus?: string;
  active?: boolean;
};

export async function GET() {
  try {
    const pb = await getPocketBaseAdminClient();
    const users = (await pb.collection("users").getFullList({
      sort: "name",
    })) as UserRecord[];

    // Show all users with accountStatus = "enabled" or "active", regardless of role
    const assignableUsers = users.filter((user) => {
      const accountStatus = (user.accountStatus || "").toLowerCase();
      return accountStatus === "enabled" || accountStatus === "active";
    });

    return NextResponse.json(
      assignableUsers.map((user: UserRecord) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      })),
    );
  } catch (error) {
    console.error("Error fetching user lookup:", error);
    const msg =
      error instanceof Error
        ? error.message
        : "Failed to fetch users from PocketBase";
    console.error("Full error details:", {
      message: msg,
      error: error,
      stack: error instanceof Error ? error.stack : "No stack",
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
