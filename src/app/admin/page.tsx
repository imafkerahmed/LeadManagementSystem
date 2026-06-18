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
  ListTodo,
  Shield,
  Award,
} from "lucide-react";
import AdminDashboard from "@/components/admin/Dashboard";
import AdminLeads from "@/components/admin/Leads";
import AdminTasks from "@/components/admin/Tasks";
import BulkUpload from "@/components/admin/BulkUpload";
import AdminSettings from "@/components/admin/Settings";
import AdminReports from "@/components/admin/Reports";
import AdminKPIManager from "@/components/admin/KPIManager";
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

type AdminTab =
  | "dashboard"
  | "leads"
  | "tasks"
  | "bulk"
  | "reports"
  | "kpi"
  | "settings";

const tabs: Array<{
  id: AdminTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "leads", label: "All Leads", icon: UsersIcon },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "bulk", label: "Bulk Upload", icon: UploadCloud },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "kpi", label: "KPI & Performance", icon: Award },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const isValidTab = (value: string | null): value is AdminTab =>
  tabs.some((tab) => tab.id === value);

const tabKeys: Record<AdminTab, string> = {
  dashboard: "admin_dashboard",
  leads: "admin_leads",
  tasks: "admin_tasks",
  bulk: "admin_bulk",
  reports: "admin_reports",
  kpi: "admin_kpi",
  settings: "admin_settings",
};

export default function AdminPage() {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<AdminTab>("dashboard");
  const [allowedTabs, setAllowedTabs] = useState<AdminTab[]>([]);
  const [isRulesLoading, setIsRulesLoading] = useState(true);

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
      let tabStr = params.get("tab");
      if (tabStr === "users") {
        tabStr = "settings";
      }

      let tab: AdminTab | null = null;
      if (isValidTab(tabStr)) {
        tab = tabStr;
      } else {
        const saved = localStorage.getItem("admin_portal_tab") as AdminTab | null;
        if (isValidTab(saved)) {
          tab = saved;
        }
      }

      // Defer state update to avoid synchronous setState in effect
      if (tab) {
        const timer = window.setTimeout(() => setCurrentTab(tab), 0);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const pb = createPocketBaseClient();
    const syncAuth = async () => {
      const authUser = pb.authStore.model as {
        id?: string;
        name?: string;
        email?: string;
        role?: string;
      } | null;

      const validAdmin =
        pb.authStore.isValid &&
        (authUser?.role === "admin" ||
          authUser?.role === "super-admin" ||
          authUser?.role === "marketing-manager" ||
          authUser?.role === "admissions-head");

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

      // Fetch dynamic access rules
      try {
        const policies = await pb.collection("accessControl").getFullList();
        const userId = authUser?.id || "";
        const userRole = authUser?.role || "";
        const resolved: AdminTab[] = [];

        tabs.forEach((tab) => {
          const sectionKey = tabKeys[tab.id];
          const policy = policies.find((p) => p.sectionKey === sectionKey);
          if (policy) {
            const enabled = policy.enabled;
            const denied = policy.deniedUsers || [];
            const allowed = policy.allowedUsers || [];
            const roles = policy.allowedRoles || [];

            const hasTabAccess =
              enabled !== false &&
              !denied.includes(userId) &&
              (allowed.includes(userId) || roles.includes(userRole));

            if (hasTabAccess) {
              resolved.push(tab.id);
            }
          } else {
            resolved.push(tab.id);
          }
        });

        setAllowedTabs(resolved);
        setIsRulesLoading(false);
      } catch (err) {
        console.error("Failed to load access controls:", err);
        setAllowedTabs(tabs.map((t) => t.id));
        setIsRulesLoading(false);
      }
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

  useEffect(() => {
    if (
      !isRulesLoading &&
      allowedTabs.length > 0 &&
      !allowedTabs.includes(currentTab)
    ) {
      const params = new URLSearchParams(window.location.search);
      let tabParamStr = params.get("tab");
      if (tabParamStr === "users") tabParamStr = "settings";

      const validatedTab = tabParamStr && isValidTab(tabParamStr) ? tabParamStr : null;
      if (validatedTab && allowedTabs.includes(validatedTab)) {
        setCurrentTab(validatedTab);
      } else {
        const saved = localStorage.getItem("admin_portal_tab") as AdminTab | null;
        if (saved && allowedTabs.includes(saved)) {
          setCurrentTab(saved);
        } else {
          setCurrentTab(allowedTabs[0]);
        }
      }
    }
  }, [isRulesLoading, allowedTabs, currentTab]);

  useEffect(() => {
    if (authChecked && !isRulesLoading && allowedTabs.includes(currentTab)) {
      try {
        localStorage.setItem("admin_portal_tab", currentTab);
        const params = new URLSearchParams(window.location.search);
        params.set("tab", currentTab);
        
        // Clear sub if it doesn't belong to reports or settings
        const sub = params.get("sub");
        if (sub && currentTab !== "reports" && currentTab !== "settings") {
          params.delete("sub");
        }
        
        const newSearch = params.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
        window.history.replaceState(null, "", newUrl);
      } catch {
        // ignore
      }
    }
  }, [currentTab, authChecked, isRulesLoading, allowedTabs]);

  if (!authChecked || (isAdmin && isRulesLoading)) {
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

  if (allowedTabs.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#fafbfc] px-4 text-center">
        <Shield className="h-12 w-12 text-rose-500 mb-3 animate-pulse" />
        <h3 className="font-bold text-slate-800 text-lg">
          Administrative Access Restricted
        </h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm">
          Your account does not have access permissions for any sections in the
          admin area. Please contact a super administrator.
        </p>
      </div>
    );
  }

  const setTab = (tab: AdminTab) => {
    setCurrentTab(tab);
    try {
      localStorage.setItem("admin_portal_tab", tab);
    } catch {
      // ignore
    }
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
            {tabs
              .filter((t) => allowedTabs.includes(t.id))
              .map((t) => {
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
              onClick={() => router.push("/staff_portal")}
              className="w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100"
            >
              <ListTodo className="w-4 h-4 text-blue-500" />
              <span>Go to Staff Portal</span>
            </button>
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
              {currentTab === "tasks" &&
                "Monitor, create, and assign staff tasks"}
              {currentTab === "bulk" && "Upload CSV file for batch imports"}
              {currentTab === "reports" &&
                "Query performance stats and visual charts"}
              {currentTab === "kpi" &&
                "Manual adjustment scorecard & counselor leaderboard"}
              {currentTab === "settings" &&
                "Manage administrators, credentials, and settings"}
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8 bg-[#fafbfc]">
          <div className="mx-auto transition-all duration-300 max-w-7xl">
            {currentTab === "dashboard" &&
              allowedTabs.includes("dashboard") && <AdminDashboard />}
            {currentTab === "leads" && allowedTabs.includes("leads") && (
              <AdminLeads />
            )}
            {currentTab === "tasks" && allowedTabs.includes("tasks") && (
              <AdminTasks />
            )}
            {currentTab === "bulk" && allowedTabs.includes("bulk") && (
              <BulkUpload operatorId={adminId} operatorLabel={adminLabel} />
            )}
            {currentTab === "reports" && allowedTabs.includes("reports") && (
              <AdminReports />
            )}
            {currentTab === "kpi" && allowedTabs.includes("kpi") && (
              <AdminKPIManager />
            )}
            {currentTab === "settings" && allowedTabs.includes("settings") && (
              <AdminSettings />
            )}
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
