"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users as UsersIcon,
  UploadCloud,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import AdminDashboard from "@/components/admin/Dashboard";
import AdminLeads from "@/components/admin/Leads";
import BulkUpload from "@/components/admin/BulkUpload";
import AdminSettings from "@/components/admin/Settings";
import AdminReports from "@/components/admin/Reports";
import { createPocketBaseClient } from "@/lib/pocketbase";
import AppShell from "@/components/layout/AppShell";
import AdminSidebarHeader from "@/components/layout/AdminSidebarHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AdminTab = "dashboard" | "leads" | "bulk" | "reports" | "settings";

const tabs: Array<{
  id: AdminTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "leads", label: "All Leads", icon: UsersIcon },
  { id: "bulk", label: "Bulk Upload", icon: UploadCloud },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
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
  const [adminName, setAdminName] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => {
    // read URL on mount to restore active tab
    try {
      const params = new URLSearchParams(window.location.search);
      let tab = params.get("tab");
      if (tab === "users") {
        tab = "settings";
      }

      // Defer state update to avoid synchronous setState in effect
      if (isValidTab(tab)) {
        const timer = window.setTimeout(() => setCurrentTab(tab), 0);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const pb = createPocketBaseClient();
    const syncAuth = () => {
      const authUser = pb.authStore.model as {
        id?: string;
        name?: string;
        email?: string;
        role?: string;
      } | null;

      const validAdmin = pb.authStore.isValid && authUser?.role === "admin";

      // Defer the initial auth snapshot so PocketBase can finish restoring state.
      setAuthChecked(true);

      if (!validAdmin) {
        setIsAdmin(false);
        router.replace("/");
        return;
      }

      setIsAdmin(true);
      setAdminId(authUser?.id || "");
      setAdminLabel(authUser?.email || authUser?.name || "Admin");
      setAdminName(authUser?.name || authUser?.email || "Admin");
      setAdminRole(authUser?.role || "Admin");
    };

    const timer = window.setTimeout(syncAuth, 0);
    const unsubscribe = pb.authStore.onChange(() => {
      syncAuth();
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
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
    <AppShell
      title="Lead Management"
      subtitle={adminLabel}
      hideHeader
      sidebar={
        <>
          <AdminSidebarHeader />
          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = currentTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/15"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600"}`}
                  />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-slate-100 p-4 bg-slate-50/30 flex flex-col gap-2">
            <button
              onClick={() => setLogoutOpen(true)}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-rose-600"
            >
              <LogOut className="w-4.5 h-4.5 flex-shrink-0 text-slate-400" />
              <div className="text-left flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-700 truncate">
                  {adminName}
                </div>
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  {adminRole}
                </div>
              </div>
            </button>
          </div>
        </>
      }
    >
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-slate-100 bg-white/70 backdrop-blur-md px-8 py-5 flex items-center justify-between shadow-sm relative z-10">
          <div>
            <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">
              {tabs.find((t) => t.id === currentTab)?.label}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              {currentTab === "dashboard" &&
                "Real-time key statistics & active trends"}
              {currentTab === "leads" &&
                "Search, browse, edit, and filter all leads"}
              {currentTab === "bulk" && "Upload CSV file for batch imports"}
              {currentTab === "reports" &&
                "Query performance stats and visual charts"}
              {currentTab === "settings" &&
                "Manage administrators, credentials, and settings"}
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8 bg-[#fafbfc]">
          <div
            className={`mx-auto transition-all duration-300 ${
              currentTab === "leads" ||
              currentTab === "reports" ||
              currentTab === "dashboard"
                ? "max-w-7xl"
                : "max-w-5xl"
            }`}
          >
            {currentTab === "dashboard" && <AdminDashboard />}
            {currentTab === "leads" && <AdminLeads />}
            {currentTab === "bulk" && (
              <BulkUpload operatorId={adminId} operatorLabel={adminLabel} />
            )}
            {currentTab === "reports" && <AdminReports />}
            {currentTab === "settings" && <AdminSettings />}
          </div>
        </main>
      </div>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent className="rounded-2xl border border-slate-100 bg-white shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-800 font-bold">
              Log Out
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 text-sm">
              Are you sure you want to log out? You&apos;ll need to sign in
              again to access the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const pb = createPocketBaseClient();
                pb.authStore.clear();
                router.replace("/");
              }}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all"
            >
              Log Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
