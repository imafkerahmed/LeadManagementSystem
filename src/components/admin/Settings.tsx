"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Users,
  Shield,
  ArrowLeft,
  X,
  Lock,
  Search,
  Loader2,
  Key,
  UserCheck,
} from "lucide-react";
import AdminUsers from "./Users";
import { createPocketBaseClient } from "@/lib/pocketbase";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface PolicyRecord {
  id: string;
  sectionKey: string;
  displayName: string;
  targetPage: "admin" | "user";
  allowedRoles: string[];
  allowedUsers: string[];
  deniedUsers: string[];
  enabled: boolean;
  expand?: {
    allowedUsers?: UserRecord[];
    deniedUsers?: UserRecord[];
  };
}

const pb = createPocketBaseClient();

export default function AdminSettings() {
  const [currentView, setCurrentView] = useState<
    "menu" | "users" | "access_control" | "role_policy" | "user_policy"
  >("menu");
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState("");

  const currentUserRole = pb.authStore.model?.role || "";
  const isReadOnly = currentUserRole !== "super-admin";

  const hasUserManagementAccess = () => {
    if (currentUserRole === "super-admin") return true;
    const policy = policies.find(
      (p) => p.sectionKey === "admin_user_management",
    );
    if (!policy) return currentUserRole === "admin";
    if (policy.enabled === false) return false;
    const userId = pb.authStore.model?.id || "";
    const denied = policy.deniedUsers || [];
    const allowed = policy.allowedUsers || [];
    const roles = policy.allowedRoles || [];
    return (
      !denied.includes(userId) &&
      (allowed.includes(userId) || roles.includes(currentUserRole))
    );
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const policyList = (await pb.collection("accessControl").getFullList({
        sort: "sectionKey",
        expand: "allowedUsers,deniedUsers",
      })) as unknown as PolicyRecord[];
      setPolicies(policyList);

      const token = pb.authStore.token;
      const fetchOptions: RequestInit = { cache: "no-store" };
      if (token) {
        fetchOptions.headers = { Authorization: `Bearer ${token}` };
      }
      const userRes = await fetch("/api/admin/users", fetchOptions);
      if (!userRes.ok) throw new Error("Failed to load users list");
      const userList = (await userRes.json()) as UserRecord[];
      setUsers(userList);
    } catch (error: any) {
      console.error(error);
      toast.error(
        "Failed to load access control data: " +
          (error.message || String(error)),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    if (currentView !== "user_policy") {
      setSelectedUserId(null);
      setUserSearchTerm("");
    }
  }, [currentView, loadData]);

  const updatePolicyInPb = async (
    policyId: string,
    updates: Partial<PolicyRecord>,
  ) => {
    setIsSaving(policyId);
    try {
      await pb.collection("accessControl").update(policyId, updates);
      toast.success("Policy updated successfully");

      const updated = (await pb.collection("accessControl").getOne(policyId, {
        expand: "allowedUsers,deniedUsers",
      })) as unknown as PolicyRecord;
      setPolicies((prev) => prev.map((p) => (p.id === policyId ? updated : p)));
    } catch (error: any) {
      console.error(error);
      toast.error(
        "Failed to update policy: " + (error.message || String(error)),
      );
      await loadData();
    } finally {
      setIsSaving("");
    }
  };

  const handleToggleEnabled = async (policy: PolicyRecord) => {
    if (isReadOnly) return;
    const newEnabled = !policy.enabled;
    setPolicies(
      policies.map((p) =>
        p.id === policy.id ? { ...p, enabled: newEnabled } : p,
      ),
    );
    await updatePolicyInPb(policy.id, { enabled: newEnabled });
  };

  const handleToggleRole = async (policy: PolicyRecord, role: string) => {
    if (isReadOnly) return;
    const isAllowed = policy.allowedRoles.includes(role);
    const newRoles = isAllowed
      ? policy.allowedRoles.filter((r) => r !== role)
      : [...policy.allowedRoles, role];
    setPolicies(
      policies.map((p) =>
        p.id === policy.id ? { ...p, allowedRoles: newRoles } : p,
      ),
    );
    await updatePolicyInPb(policy.id, { allowedRoles: newRoles });
  };


  const handleUserOverrideChange = async (
    policy: PolicyRecord,
    userId: string,
    state: "inherited" | "allowed" | "denied",
  ) => {
    if (isReadOnly) return;

    let newAllowed = [...(policy.allowedUsers || [])];
    let newDenied = [...(policy.deniedUsers || [])];

    // Clean up existing overrides for this user
    newAllowed = newAllowed.filter((id) => id !== userId);
    newDenied = newDenied.filter((id) => id !== userId);

    if (state === "allowed") {
      newAllowed.push(userId);
    } else if (state === "denied") {
      newDenied.push(userId);
    }

    // Optimistic update
    const updatedPolicies = policies.map((p) => {
      if (p.id === policy.id) {
        const nextAllowedExpand = [...(p.expand?.allowedUsers || [])].filter(
          (u) => u.id !== userId,
        );
        const nextDeniedExpand = [...(p.expand?.deniedUsers || [])].filter(
          (u) => u.id !== userId,
        );

        const targetUser = users.find((u) => u.id === userId);
        if (targetUser) {
          if (state === "allowed") nextAllowedExpand.push(targetUser);
          if (state === "denied") nextDeniedExpand.push(targetUser);
        }

        return {
          ...p,
          allowedUsers: newAllowed,
          deniedUsers: newDenied,
          expand: {
            ...p.expand,
            allowedUsers: nextAllowedExpand,
            deniedUsers: nextDeniedExpand,
          },
        };
      }
      return p;
    });

    setPolicies(updatedPolicies);
    await updatePolicyInPb(policy.id, {
      allowedUsers: newAllowed,
      deniedUsers: newDenied,
    });
  };

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

        {/* Access Control Options Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Role Section Card */}
          <div
            onClick={() => setCurrentView("role_policy")}
            className="group relative overflow-hidden bg-white border border-indigo-100/30 rounded-2xl p-6 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-indigo-100 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[160px]"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500" />
            <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-indigo-500" />

            <div className="flex items-start justify-between relative z-10">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                <Key className="h-5 w-5" />
              </div>
              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                RBAC
              </span>
            </div>

            <div className="relative z-10 mt-4">
              <h4 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                Role Section Access Policy
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Manage global feature toggles and Role-Based Access Control
                (RBAC) rules for each section.
              </p>
            </div>
          </div>

          {/* User Access Card */}
          <div
            onClick={() => setCurrentView("user_policy")}
            className="group relative overflow-hidden bg-white border border-emerald-100/30 rounded-2xl p-6 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-emerald-100 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[160px]"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500" />
            <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-emerald-500" />

            <div className="flex items-start justify-between relative z-10">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                <UserCheck className="h-5 w-5" />
              </div>
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                User-Wise
              </span>
            </div>

            <div className="relative z-10 mt-4">
              <h4 className="text-sm font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                User Access Policy
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Configure user-wise whitelists and blacklists to grant or deny
                access to specific operators.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === "role_policy" || currentView === "user_policy") {
    const isRoleView = currentView === "role_policy";
    const breadcrumbText = isRoleView
      ? "Settings / Access Control / Roles"
      : "Settings / Access Control / Users";

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <button
            onClick={() => setCurrentView("access_control")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Access Control
          </button>
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            {breadcrumbText}
          </div>
        </div>

        {isReadOnly && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900 flex items-start gap-3 shadow-sm">
            <Lock className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-bold text-amber-950">Read-Only View Mode</p>
              <p className="text-amber-800 leading-relaxed font-medium">
                You are signed in as a standard administrator. Only **Super
                Administrators** are permitted to customize dynamic allowed
                roles and user whitelists/blacklists.
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] gap-2">
            <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
            <span className="text-xs text-slate-400 font-semibold">
              Loading policies...
            </span>
          </div>
        ) : (
          <div className="space-y-6">
            {isRoleView
              ? renderRoleTable(
                  policies.filter((p) => p.targetPage === "admin"),
                  policies.filter((p) => p.targetPage === "user"),
                )
              : renderUserTable(
                  policies.filter((p) => p.targetPage === "admin"),
                  policies.filter((p) => p.targetPage === "user"),
                )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Menu Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Card */}
        <div
          onClick={() => {
            if (hasUserManagementAccess()) {
              setCurrentView("users");
            } else {
              toast.error(
                "Access to the User Directory is restricted by system policies.",
              );
            }
          }}
          className={`group relative overflow-hidden bg-white border border-blue-100/30 rounded-2xl p-6 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-blue-100 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[160px] ${
            !hasUserManagementAccess()
              ? "opacity-60 cursor-not-allowed border-slate-100"
              : ""
          }`}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500" />
          <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-blue-500" />

          <div className="flex items-start justify-between relative z-10">
            <div
              className={`p-3 bg-blue-50 rounded-xl transition-all duration-300 ${
                hasUserManagementAccess()
                  ? "text-blue-600 group-hover:bg-blue-600 group-hover:text-white"
                  : "text-slate-400"
              }`}
            >
              {hasUserManagementAccess() ? (
                <Users className="h-5 w-5" />
              ) : (
                <Lock className="h-5 w-5" />
              )}
            </div>
            <span
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                hasUserManagementAccess()
                  ? "text-blue-600 bg-blue-50/50"
                  : "text-slate-400 bg-slate-100"
              }`}
            >
              {hasUserManagementAccess() ? "Management" : "Restricted"}
            </span>
          </div>

          <div className="relative z-10 mt-4">
            <h4 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
              User
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Create, edit, reset passwords, and disable system operators.
              Manage user roles and directory listings.
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
            <div className="flex items-center gap-1.5">
              {currentUserRole !== "super-admin" && (
                <Lock className="h-3 w-3 text-indigo-400" />
              )}
              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                {currentUserRole === "super-admin"
                  ? "Configurable"
                  : "Read-Only"}
              </span>
            </div>
          </div>

          <div className="relative z-10 mt-4">
            <h4 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
              Access Control
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Define Role-Based Access Control (RBAC) and whitelists/blacklists
              for specific sections of pages.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  function renderRoleTable(
    adminItems: PolicyRecord[],
    userItems: PolicyRecord[],
  ) {
    const renderSection = (title: string, items: PolicyRecord[]) => (
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
        <h4 className="font-bold text-slate-800 text-sm border-b border-slate-50 pb-2">
          {title}
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-2">Section / Feature</th>
                <th className="py-3 px-2 text-center">Global Toggle</th>
                <th className="py-3 px-2">Allowed Roles (RBAC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((policy) => {
                const isSavingThis = isSaving === policy.id;
                return (
                  <tr
                    key={policy.id}
                    className={`hover:bg-slate-50/20 transition-colors ${isSavingThis ? "opacity-75 bg-indigo-50/5" : ""}`}
                  >
                    <td className="py-4 px-2">
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        {policy.displayName}
                        {isSavingThis && (
                          <Loader2 className="h-3 w-3 text-indigo-500 animate-spin" />
                        )}
                      </div>
                      <code className="text-[10px] text-slate-400 font-mono">
                        {policy.sectionKey}
                      </code>
                    </td>
                    <td className="py-4 px-2 text-center">
                      <button
                        onClick={() => handleToggleEnabled(policy)}
                        disabled={isReadOnly}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          policy.enabled ? "bg-indigo-600" : "bg-slate-200"
                        } ${isReadOnly ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            policy.enabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="py-4 px-2">
                      <div className="flex gap-4">
                        {[
                          "super-admin",
                          "admin",
                          "student-counsellor",
                          "marketing-manager",
                          "admissions-head",
                        ].map((role) => {
                          const checked = policy.allowedRoles.includes(role);
                          return (
                            <label
                              key={role}
                              className={`inline-flex items-center gap-2 font-semibold text-slate-600 ${isReadOnly ? "cursor-not-allowed" : "cursor-pointer"}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isReadOnly}
                                onChange={() => handleToggleRole(policy, role)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 h-3.5 w-3.5"
                              />
                              <span className="text-[11px] capitalize">
                                {role.replace("-", " ")}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );

    return (
      <div className="space-y-6">
        {renderSection("Admin Dashboard Section Policies", adminItems)}
        {renderSection("Allocated User Section Policies", userItems)}
      </div>
    );
  }

  function renderUserTable(
    adminItems: PolicyRecord[],
    userItems: PolicyRecord[],
  ) {
    const filteredUsersList = users.filter(
      (u) =>
        u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        u.role.toLowerCase().includes(userSearchTerm.toLowerCase()),
    );

    const activeUser = users.find((u) => u.id === selectedUserId);

    const renderOverrideControl = (policy: PolicyRecord) => {
      const isSavingThis = isSaving === policy.id;
      const isAllowed = policy.allowedUsers?.includes(activeUser?.id || "");
      const isDenied = policy.deniedUsers?.includes(activeUser?.id || "");
      const currentOverride = isAllowed
        ? "allowed"
        : isDenied
          ? "denied"
          : "inherited";
      const roleInheritedAccess =
        policy.enabled && policy.allowedRoles.includes(activeUser?.role || "");

      return (
        <tr
          key={policy.id}
          className={`hover:bg-slate-50/20 transition-colors ${isSavingThis ? "opacity-75 bg-indigo-50/5" : ""}`}
        >
          <td className="py-3 px-2">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              {policy.displayName}
              {isSavingThis && (
                <Loader2 className="h-3 w-3 text-indigo-500 animate-spin" />
              )}
            </div>
            <code className="text-[10px] text-slate-400 font-mono">
              {policy.sectionKey}
            </code>
          </td>
          <td className="py-3 px-2 text-center">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                !policy.enabled
                  ? "bg-slate-100 text-slate-500 border border-slate-200"
                  : roleInheritedAccess
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                    : "bg-rose-50 text-rose-700 border border-rose-100"
              }`}
            >
              {!policy.enabled
                ? "Disabled Globally"
                : roleInheritedAccess
                  ? "Allowed"
                  : "Denied"}
            </span>
          </td>
          <td className="py-3 px-2">
            <div className="flex bg-slate-100 p-0.5 rounded-lg w-fit border border-slate-200/40">
              <button
                disabled={isReadOnly || isSavingThis}
                onClick={() =>
                  handleUserOverrideChange(policy, activeUser!.id, "inherited")
                }
                className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                  currentOverride === "inherited"
                    ? "bg-white text-slate-700 shadow-sm border border-slate-200/20"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Inherit
              </button>
              <button
                disabled={isReadOnly || isSavingThis}
                onClick={() =>
                  handleUserOverrideChange(policy, activeUser!.id, "allowed")
                }
                className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                  currentOverride === "allowed"
                    ? "bg-emerald-500 text-white shadow-sm font-extrabold"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Allow
              </button>
              <button
                disabled={isReadOnly || isSavingThis}
                onClick={() =>
                  handleUserOverrideChange(policy, activeUser!.id, "denied")
                }
                className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                  currentOverride === "denied"
                    ? "bg-rose-500 text-white shadow-sm font-extrabold"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Deny
              </button>
            </div>
          </td>
        </tr>
      );
    };

    const renderPolicyGroup = (title: string, items: PolicyRecord[]) => (
      <div className="space-y-2">
        <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          {title}
        </h5>
        <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[9px] bg-slate-50/50">
                <th className="py-2.5 px-2">Section / Feature</th>
                <th className="py-2.5 px-2 text-center w-[120px]">
                  Role Default
                </th>
                <th className="py-2.5 px-2 w-[200px]">Override Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(renderOverrideControl)}
            </tbody>
          </table>
        </div>
      </div>
    );

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left column: Users List */}
        <div className="lg:col-span-1 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search user by name, email..."
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              className="w-full text-[11px] rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 focus:border-indigo-500 focus:outline-none transition-all"
            />
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            {userSearchTerm && (
              <button
                onClick={() => setUserSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-[500px] overflow-y-auto space-y-1.5 scrollbar-thin">
            {filteredUsersList.map((user) => {
              const isActive = user.id === selectedUserId;
              return (
                <div
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "bg-indigo-50/50 border-indigo-200 shadow-sm"
                      : "bg-white border-slate-100 hover:bg-slate-50/50 hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">
                      {user.name}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize ${
                        user.role === "super-admin"
                          ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                          : user.role === "admin"
                            ? "bg-blue-50 text-blue-700 border border-blue-100"
                            : user.role === "marketing-manager"
                              ? "bg-purple-50 text-purple-700 border border-purple-100"
                              : user.role === "admissions-head"
                                ? "bg-amber-50 text-amber-700 border border-amber-100"
                                : "bg-slate-50 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {user.role.replace("-", " ")}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate block mt-0.5">
                    {user.email}
                  </span>
                </div>
              );
            })}
            {filteredUsersList.length === 0 && (
              <div className="text-center py-6 text-slate-400 text-xs font-semibold">
                No users found
              </div>
            )}
          </div>
        </div>

        {/* Right column: Selected User Override Details */}
        <div className="lg:col-span-2">
          {activeUser ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-4">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    Custom Access Overrides:{" "}
                    <span className="text-indigo-600 font-extrabold">
                      {activeUser.name}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Role:{" "}
                    <span className="capitalize font-semibold text-slate-600">
                      {activeUser.role.replace("-", " ")}
                    </span>{" "}
                    &bull; {activeUser.email}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2 text-[10px] font-semibold text-slate-500 border border-slate-100/50 leading-relaxed max-w-xs">
                  Whitelisted policies allow access regardless of role.
                  Blacklisted policies block access even if the role allows it.
                </div>
              </div>

              <div className="space-y-6">
                {renderPolicyGroup(
                  "Admin Dashboard Section Policies",
                  adminItems,
                )}
                {renderPolicyGroup(
                  "Allocated User Section Policies",
                  userItems,
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-100 border-dashed rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[300px] gap-3">
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 text-slate-400">
                <UserCheck className="h-8 w-8 text-indigo-500" />
              </div>
              <h4 className="font-bold text-slate-700 text-sm mt-2">
                No User Selected
              </h4>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                Choose an operator from the left sidebar to customize their
                individual permissions and whitelist or blacklist them for
                specific pages.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }
}
