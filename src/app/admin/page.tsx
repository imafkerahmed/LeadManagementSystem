"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LogOut, BarChart3, Users, Upload, Settings } from "lucide-react";
import AdminDashboard from "@/components/admin/Dashboard";
import AdminLeads from "@/components/admin/Leads";
import BulkUpload from "@/components/admin/BulkUpload";
import AdminSettings from "@/components/admin/Settings";
import { createPocketBaseClient } from "@/lib/pocketbase";

export default function AdminPage() {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<
    "dashboard" | "leads" | "bulk" | "settings"
  >("dashboard");

  const adminAuthSnapshot = useSyncExternalStore(
    () => () => {},
    () => {
      const pb = createPocketBaseClient();
      const authUser = pb.authStore.model as {
        id?: string;
        name?: string;
        email?: string;
        role?: string;
      } | null;

      const isValid = pb.authStore.isValid && authUser?.role === "admin";
      const adminId = isValid ? authUser?.id || "" : "";
      const adminLabel = isValid
        ? authUser?.email || authUser?.name || "Admin"
        : "Admin";

      return `${isValid ? "1" : "0"}|${adminId}|${adminLabel}`;
    },
    () => "0||Admin",
  );

  const [authFlag, adminId, adminLabel] = adminAuthSnapshot.split("|");

  useEffect(() => {
    if (authFlag !== "1") {
      router.replace("/");
    }
  }, [authFlag, router]);

  if (authFlag !== "1") {
    return null;
  }

  const tabs = [
    { id: "dashboard", label: "📊 Dashboard", icon: BarChart3 },
    { id: "leads", label: "👥 All Leads", icon: Users },
    { id: "bulk", label: "📤 Bulk Upload", icon: Upload },
    { id: "settings", label: "⚙️ Settings", icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              Amazon College
            </h1>
            <p className="text-sm text-slate-500" suppressHydrationWarning>
              {adminLabel}
            </p>
          </div>
          <button
            onClick={() => {
              const pb = createPocketBaseClient();
              pb.authStore.clear();
              router.replace("/");
            }}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-5xl gap-2 px-4 pb-4 sm:px-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setCurrentTab(t.id)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                currentTab === t.id
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label.replace(/^[^\s]+\s?/, "")}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        {currentTab === "dashboard" && <AdminDashboard />}
        {currentTab === "leads" && <AdminLeads />}
        {currentTab === "bulk" && (
          <BulkUpload operatorId={adminId} operatorLabel={adminLabel} />
        )}
        {currentTab === "settings" && <AdminSettings />}
      </main>
    </div>
  );
}
