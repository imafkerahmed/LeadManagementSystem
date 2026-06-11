"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Users, Shield, ArrowLeft, Check, X, Lock } from "lucide-react";
import AdminUsers from "./Users";

export default function AdminSettings() {
  const [currentView, setCurrentView] = useState<"menu" | "users" | "access_control">("menu");

  if (currentView === "users") {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <button
            onClick={() => setCurrentView("menu")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </button>
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Settings / Users
          </div>
        </div>
        <AdminUsers />
      </div>
    );
  }

  if (currentView === "access_control") {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <button
            onClick={() => setCurrentView("menu")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </button>
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Settings / Access Control
          </div>
        </div>
        <AccessControlPanel />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Menu Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Card */}
        <div
          onClick={() => setCurrentView("users")}
          className="group relative overflow-hidden bg-white border border-blue-100/30 rounded-2xl p-6 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-blue-100 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[160px]"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500" />
          <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-blue-500" />
          
          <div className="flex items-start justify-between relative z-10">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
              <Users className="h-5 w-5" />
            </div>
            <span className="text-[9px] font-bold text-blue-600 bg-blue-50/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Management
            </span>
          </div>
          
          <div className="relative z-10 mt-4">
            <h4 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">User</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Create, edit, reset passwords, and disable system operators. Manage individual leads and tasks credentials.
            </p>
          </div>
        </div>

        {/* Access Control Card */}
        <div
          onClick={() => setCurrentView("access_control")}
          className="group relative overflow-hidden bg-white border border-indigo-100/30 rounded-2xl p-6 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-indigo-100 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[160px]"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500" />
          <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-indigo-500" />
          
          <div className="flex items-start justify-between relative z-10">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
              <Shield className="h-5 w-5" />
            </div>
            <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Security
            </span>
          </div>
          
          <div className="relative z-10 mt-4">
            <h4 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">Access Control</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              View permission mapping matrix and manage active role access levels. Configure global security policies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccessControlPanel() {
  const [policies, setPolicies] = useState({
    enforceMfa: false,
    adminCsvOnly: true,
    restrictReports: true,
    taskAuditing: true,
  });

  const togglePolicy = (key: keyof typeof policies) => {
    setPolicies((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    toast.success("Security policy updated successfully");
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Role Permissions Matrix */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <h4 className="font-bold text-slate-800 flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-600" />
            Role Permission Matrix
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            Visual map of dashboard modules accessible by each staff role.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">Module / Capability</th>
                <th className="px-4 py-3 text-center">Admin</th>
                <th className="px-4 py-3 text-center">Student Counselor</th>
                <th className="px-4 py-3 text-center">Only Task View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              <tr className="hover:bg-slate-50/20 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">Leads Management</td>
                <td className="px-4 py-3 text-center"><Check className="h-4 w-4 text-emerald-500 mx-auto" /></td>
                <td className="px-4 py-3 text-center"><span className="text-slate-400 font-semibold bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 text-[10px]">If Enabled</span></td>
                <td className="px-4 py-3 text-center"><X className="h-4 w-4 text-rose-500 mx-auto" /></td>
              </tr>
              <tr className="hover:bg-slate-50/20 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">Task Management</td>
                <td className="px-4 py-3 text-center"><Check className="h-4 w-4 text-emerald-500 mx-auto" /></td>
                <td className="px-4 py-3 text-center"><span className="text-slate-400 font-semibold bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 text-[10px]">If Enabled</span></td>
                <td className="px-4 py-3 text-center"><Check className="h-4 w-4 text-emerald-500 mx-auto" /></td>
              </tr>
              <tr className="hover:bg-slate-50/20 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">CSV Bulk Upload</td>
                <td className="px-4 py-3 text-center"><Check className="h-4 w-4 text-emerald-500 mx-auto" /></td>
                <td className="px-4 py-3 text-center"><X className="h-4 w-4 text-rose-500 mx-auto" /></td>
                <td className="px-4 py-3 text-center"><X className="h-4 w-4 text-rose-500 mx-auto" /></td>
              </tr>
              <tr className="hover:bg-slate-50/20 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">Reports & Analytics</td>
                <td className="px-4 py-3 text-center"><Check className="h-4 w-4 text-emerald-500 mx-auto" /></td>
                <td className="px-4 py-3 text-center"><X className="h-4 w-4 text-rose-500 mx-auto" /></td>
                <td className="px-4 py-3 text-center"><X className="h-4 w-4 text-rose-500 mx-auto" /></td>
              </tr>
              <tr className="hover:bg-slate-50/20 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">Admin Settings & Logs</td>
                <td className="px-4 py-3 text-center"><Check className="h-4 w-4 text-emerald-500 mx-auto" /></td>
                <td className="px-4 py-3 text-center"><X className="h-4 w-4 text-rose-500 mx-auto" /></td>
                <td className="px-4 py-3 text-center"><X className="h-4 w-4 text-rose-500 mx-auto" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Global Security Policies */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <h4 className="font-bold text-slate-800 flex items-center gap-2">
            <Lock className="h-5 w-5 text-indigo-600" />
            Active Access Policies
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            Toggle global feature policies and security parameters.
          </p>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
          {/* Policy Item 1 */}
          <div className="flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition-colors">
            <div className="max-w-[70%]">
              <span className="text-xs font-bold text-slate-700 block">Restrict CSV Uploads to Admins</span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                When enabled, counselors are blocked from accessing the Bulk CSV upload routes.
              </span>
            </div>
            <button
              onClick={() => togglePolicy("adminCsvOnly")}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                policies.adminCsvOnly ? "bg-indigo-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  policies.adminCsvOnly ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Policy Item 2 */}
          <div className="flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition-colors">
            <div className="max-w-[70%]">
              <span className="text-xs font-bold text-slate-700 block">Enforce Task History Auditing</span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Record all task edits, creation, deletions, and assignee transfers in the database history timeline logs.
              </span>
            </div>
            <button
              onClick={() => togglePolicy("taskAuditing")}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                policies.taskAuditing ? "bg-indigo-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  policies.taskAuditing ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Policy Item 3 */}
          <div className="flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition-colors">
            <div className="max-w-[70%]">
              <span className="text-xs font-bold text-slate-700 block">Restrict Analytics & Reports access</span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Prevent counselors and task-only staff from viewing report metrics and performance charts.
              </span>
            </div>
            <button
              onClick={() => togglePolicy("restrictReports")}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                policies.restrictReports ? "bg-indigo-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  policies.restrictReports ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Policy Item 4 */}
          <div className="flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition-colors">
            <div className="max-w-[70%]">
              <span className="text-xs font-bold text-slate-700 block">Enforce Multi-Factor Authentication (MFA) for Admin Users</span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Require administrators to authenticate with an MFA verification token on login.
              </span>
            </div>
            <button
              onClick={() => togglePolicy("enforceMfa")}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                policies.enforceMfa ? "bg-indigo-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  policies.enforceMfa ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
