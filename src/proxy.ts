import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only run middleware on /api routes
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // 1. Exclude public API endpoints from JWT authentication checking
  if (pathname === "/api/setup/collections") {
    return NextResponse.next();
  }

  // 2. Reject debug endpoints entirely
  if (pathname.startsWith("/api/debug")) {
    return new NextResponse(
      JSON.stringify({ error: "Forbidden: Debug routes are disabled" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Extract authorization token
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new NextResponse(
      JSON.stringify({ error: "Unauthorized: Missing token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.substring(7);

  // 4. Validate token with PocketBase
  const pocketBaseUrl = (
    process.env.NEXT_PUBLIC_POCKETBASE_URL || "https://amazoncrm-db.codix.site"
  ).replace(/\/$/, "");

  try {
    const refreshUrl = `${pocketBaseUrl}/api/collections/users/auth-refresh`;
    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token, // PocketBase expects the raw token or 'Bearer token'
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized: Invalid or expired token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const user = data.record;

    if (!user) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized: User record not found" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check account status
    const status = (user.accountStatus || "").toLowerCase();
    if (status === "disabled") {
      return new NextResponse(
        JSON.stringify({ error: "Forbidden: Account is disabled" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const role = user.role || "";

    // 5. Enforce role-based access control (RBAC)
    // Admin routes
    if (pathname.startsWith("/api/admin") || pathname.startsWith("/api/admins")) {
      const allowedRoles = ["super-admin", "admin", "marketing-manager", "admissions-head"];
      if (!allowedRoles.includes(role)) {
        return new NextResponse(
          JSON.stringify({ error: "Forbidden: Insufficient privileges for admin routes" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Staff/counselor routes
    if (pathname.startsWith("/api/staff_portal") || pathname.startsWith("/api/staff")) {
      const allowedRoles = [
        "super-admin",
        "admin",
        "marketing-manager",
        "admissions-head",
        "student-counsellor",
      ];
      if (!allowedRoles.includes(role)) {
        return new NextResponse(
          JSON.stringify({ error: "Forbidden: Insufficient privileges for staff routes" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 6. Forward verified user context downstream via headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", user.id || "");
    requestHeaders.set("x-user-role", role);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error("Middleware auth validation error:", error);
    return new NextResponse(
      JSON.stringify({ error: "Internal Server Error: Auth check failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Ensure the middleware runs only on /api matches
export const config = {
  matcher: "/api/:path*",
};

export default proxy;
