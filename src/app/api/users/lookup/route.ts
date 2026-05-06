import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
};

export async function GET() {
  try {
    const pb = await getPocketBaseAdminClient();
    const users = await pb.collection("users").getFullList({
      fields: "id,name,email",
    });

    return NextResponse.json(
      users.map((user: UserRecord) => ({
        id: user.id,
        name: user.name,
        email: user.email,
      })),
    );
  } catch (error) {
    console.error("Error fetching user lookup:", error);
    return NextResponse.json([]);
  }
}
