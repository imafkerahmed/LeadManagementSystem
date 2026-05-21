import DailyReports from "@/components/admin/DailyReports";
import AppShell from "@/components/layout/AppShell";
import AdminSidebarHeader from "@/components/layout/AdminSidebarHeader";
import { createPocketBaseClient } from "@/lib/pocketbase";

function getAdminLabel() {
  try {
    const pb = createPocketBaseClient();
    const authUser = pb.authStore.model as {
      name?: string;
      email?: string;
    } | null;
    return authUser?.email || authUser?.name || "Admin";
  } catch {
    return "Admin";
  }
}

export default function DailyReportsPage() {
  const adminLabel = getAdminLabel();

  return (
    <AppShell
      title="Lead Management"
      subtitle={adminLabel}
      sidebar={<AdminSidebarHeader />}
    >
      <div className="space-y-6">
        <DailyReports />
      </div>
    </AppShell>
  );
}
