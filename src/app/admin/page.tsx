"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MdDashboard,
  MdPeople,
  MdCloudUpload,
  MdSettings,
  MdExitToApp,
  MdAssessment,
} from "react-icons/md";
import AdminDashboard from "@/components/admin/Dashboard";
import AdminLeads from "@/components/admin/Leads";
import BulkUpload from "@/components/admin/BulkUpload";
import AdminSettings from "@/components/admin/Settings";
import AdminReports from "@/components/admin/Reports";
import { createPocketBaseClient } from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
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

const tabs: Array<{ id: AdminTab; label: string; icon: typeof MdDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: MdDashboard },
  { id: "leads", label: "All Leads", icon: MdPeople },
  { id: "bulk", label: "Bulk Upload", icon: MdCloudUpload },
  { id: "reports", label: "Reports", icon: MdAssessment },
  { id: "settings", label: "Settings", icon: MdSettings },
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
    setAdminName(authUser?.name || authUser?.email || "Admin");
    setAdminRole(authUser?.role || "Admin");
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-muted/30 flex flex-col">
          <div className="px-6 py-8 border-b border-border">
            <h1 className="text-xl font-bold tracking-tight">
              Lead Management System
            </h1>
            <p className="text-sm text-muted-foreground mt-2">Amazon College</p>
          </div>

          <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                    currentTab === t.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-border p-4">
            <Button
              onClick={() => setLogoutOpen(true)}
              variant="ghost"
              className="w-full justify-start gap-3 h-auto py-3 px-4"
              size="lg"
            >
              <MdExitToApp className="w-6 h-6 flex-shrink-0" />
              <div className="text-left">
                <div className="text-sm font-medium">{adminName}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {adminRole}
                </div>
              </div>
            </Button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-4 shadow-sm">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {tabs.find((t) => t.id === currentTab)?.label}
              </h2>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto max-w-5xl">
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
      </div>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log Out</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to log out? You&apos;ll need to sign in
              again to access the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const pb = createPocketBaseClient();
                pb.authStore.clear();
                router.replace("/");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Log Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
