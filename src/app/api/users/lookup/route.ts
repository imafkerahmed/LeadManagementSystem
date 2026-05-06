import { NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function GET() {
  try {
    const pb = await getPocketBaseAdminClient();
    const users = await pb.collection("users").getFullList({
      fields: "id,name,email",
    });

    return NextResponse.json(
      users.map((user: any) => ({
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
