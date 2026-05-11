import { NextResponse } from "next/server";
import { getPocketBaseAdminClient, pocketBaseUrl } from "@/lib/pocketbase";

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  accountStatus?: string;
  active?: boolean;
};

const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || "";

export async function GET() {
  try {
    let users: UserRecord[] = [];

    // Try using direct HTTP fetch to avoid SDK auto-cancellation issues
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      try {
        const authUrl = new URL(
          "/api/admins/auth-with-password",
          pocketBaseUrl,
        ).toString();
        const authResponse = await fetch(authUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identity: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
          }),
        });

        if (authResponse.ok) {
          const authData = (await authResponse.json()) as { token?: string };
          const token = authData.token;

          if (token) {
            const usersUrl = new URL(
              "/api/collections/users/records",
              pocketBaseUrl,
            ).toString();
            const usersResponse = await fetch(usersUrl, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (usersResponse.ok) {
              const usersData = (await usersResponse.json()) as {
                items?: UserRecord[];
              };
              users = usersData.items || [];
            }
          }
        }
      } catch (fetchError) {
        console.error("Error using direct HTTP fetch for users:", fetchError);
        // Fall back to SDK method
      }
    }

    // Fallback to SDK if direct fetch didn't work
    if (users.length === 0) {
      try {
        const pb = await getPocketBaseAdminClient();
        users = (await pb.collection("users").getFullList({
          sort: "name",
        })) as UserRecord[];
      } catch (sdkError) {
        console.error("Error fetching users via SDK:", sdkError);
        throw sdkError;
      }
    }

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
