"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  LogOut,
  BarChart3,
  Users,
  Upload,
  Settings,
} from "lucide-react";
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
  const [adminName, setAdminName] = useState("Admin");
  const [adminId, setAdminId] = useState("");
  const [adminLabel, setAdminLabel] = useState("Admin");

  useEffect(() => {
    const pb = createPocketBaseClient();
    const authUser = pb.authStore.model as {
      id?: string;
      name?: string;
      email?: string;
      role?: string;
    } | null;

    if (!pb.authStore.isValid || authUser?.role !== "admin") {
      router.replace("/");
      return;
    }

    setAdminId(authUser.id || "");
    setAdminName(authUser.name || "Admin");
    setAdminLabel(authUser.email || authUser.name || "Admin");
  }, [router]);

  const tabs = [
    { id: "dashboard", label: "📊 Dashboard", icon: BarChart3 },
    { id: "leads", label: "👥 All Leads", icon: Users },
    { id: "bulk", label: "📤 Bulk Upload", icon: Upload },
    { id: "settings", label: "⚙️ Settings", icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">
              🎓 Amazon College Admin
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Logged in as <span className="font-medium">{adminName}</span>
              </span>
              <button
                onClick={() => {
                  const pb = createPocketBaseClient();
                  pb.authStore.clear();
                  window.location.href = "/";
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`py-4 px-2 border-b-2 font-medium text-sm transition ${
                  currentTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Page Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === "dashboard" && <AdminDashboard />}
        {currentTab === "leads" && <AdminLeads />}
        {currentTab === "bulk" && (
          <BulkUpload operatorId={adminId} operatorLabel={adminLabel} />
        )}
        {currentTab === "settings" && <AdminSettings />}
      </div>
    </div>
  );
}
