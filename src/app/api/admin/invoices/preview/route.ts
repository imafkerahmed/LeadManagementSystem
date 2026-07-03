import { NextRequest, NextResponse } from "next/server";
import { getPocketBaseAdminClient } from "@/lib/pocketbase";

export async function GET(request: NextRequest) {
  try {
    const pb = await getPocketBaseAdminClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const file = searchParams.get("file");

    if (!id || !file) {
      return new NextResponse("Missing id or file parameter", { status: 400 });
    }

    const token = pb.authStore.token;
    const fileUrl = `${pb.baseUrl}/api/files/invoices/${id}/${file}${token ? `?token=${token}` : ""}`;

    const response = await fetch(fileUrl);
    if (!response.ok) {
      return new NextResponse(`Failed to fetch file from database: ${response.statusText}`, { status: response.status });
    }

    const blob = await response.blob();
    const headers = new Headers();
    
    // Copy content-type from original response
    const contentType = response.headers.get("content-type") || "application/pdf";
    headers.set("Content-Type", contentType);
    
    // Set content disposition to inline
    headers.set("Content-Disposition", `inline; filename="${file}"`);
    
    // Do not set X-Frame-Options to allow framing on same origin
    
    return new NextResponse(blob, {
      status: 200,
      headers
    });
  } catch (err: any) {
    console.error("Error in invoice preview proxy:", err);
    return new NextResponse(err.message || "Internal Server Error", { status: 500 });
  }
}
