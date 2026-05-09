"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, BarChart3, Users, Upload, Settings } from "lucide-react";
import AdminDashboard from "@/components/admin/Dashboard";
import AdminLeads from "@/components/admin/Leads";
import BulkUpload from "@/components/admin/BulkUpload";
import AdminSettings from "@/components/admin/Settings";
import { createPocketBaseClient } from "@/lib/pocketbase";

type AdminTab = "dashboard" | "leads" | "bulk" | "settings";

const tabs: Array<{ id: AdminTab; label: string; icon: typeof BarChart3 }> = [
  { id: "dashboard", label: "📊 Dashboard", icon: BarChart3 },
  { id: "leads", label: "👥 All Leads", icon: Users },
  { id: "bulk", label: "📤 Bulk Upload", icon: Upload },
  { id: "settings", label: "⚙️ Settings", icon: Settings },
];

const isValidTab = (value: string | null): value is AdminTab =>
  tabs.some((tab) => tab.id === value);

export default function AdminPage() {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<AdminTab>("dashboard");

  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [adminLabel, setAdminLabel] = useState("Admin");

  useEffect(() => {
    // read URL on mount to restore active tab
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      // Setting state in effect is intentional for URL-driven initialization
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isValidTab(tab)) setCurrentTab(tab);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const pb = createPocketBaseClient();
    const authUser = pb.authStore.model as {
      id?: string;
      name?: string;
      email?: string;
      role?: string;
    } | null;

    const validAdmin = pb.authStore.isValid && authUser?.role === "admin";
    // setting mount-time auth state is intentional to avoid hydration redirects
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthChecked(true);

    if (!validAdmin) {
      setIsAdmin(false);
      router.replace("/");
      return;
    }

    setIsAdmin(true);
    setAdminId(authUser?.id || "");
    setAdminLabel(authUser?.email || authUser?.name || "Admin");
  }, [router]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-white px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="h-14 rounded-lg bg-slate-100 animate-pulse" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-lg bg-slate-100 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const setTab = (tab: AdminTab) => {
    setCurrentTab(tab);
    if (tab === "dashboard") {
      router.replace("/admin", { scroll: false });
      return;
    }

    router.replace(`/admin?tab=${tab}`, { scroll: false });
  };

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
              onClick={() => setTab(t.id)}
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
