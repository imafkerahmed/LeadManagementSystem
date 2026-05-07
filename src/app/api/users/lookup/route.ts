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
    let users = [] as UserRecord[];

    try {
      users = (await pb.collection("users").getFullList({
        filter: 'role = "student-counsellor" && accountStatus = "active"',
        fields: "id,name,email",
      })) as UserRecord[];
    } catch {
      users = (await pb.collection("users").getFullList({
        filter: 'role = "student-counsellor"',
        fields: "id,name,email",
      })) as UserRecord[];
    }

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
