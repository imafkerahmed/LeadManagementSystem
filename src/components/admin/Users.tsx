"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createPocketBaseClient } from "@/lib/pocketbase";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Search, Users, UserPlus, Lock, Loader2, UsersRound, UserMinus, Filter, ShieldAlert } from "lucide-react";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "super-admin" | "admin" | "student-counsellor" | "marketing-manager" | "admissions-head";
  accountStatus: "enabled" | "disabled";
  assignedLeadCount: number;
};

type ApiError = {
  error?: string;
  assignedLeadCount?: number;
  requiresTransfer?: boolean;
};

export default function AdminUsers() {
  const authModel =
    typeof window === "undefined"
      ? null
      : (createPocketBaseClient().authStore.model as {
          id?: string;
          name?: string;
          email?: string;
          role?: string;
        } | null);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "super-admin" | "admin" | "student-counsellor" | "marketing-manager" | "admissions-head"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "enabled" | "disabled"
  >("all");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"super-admin" | "admin" | "student-counsellor" | "marketing-manager" | "admissions-head">(
    "student-counsellor",
  );

  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);

  // Enhanced lead reassignment states
  const [isLoadingStatusCounts, setIsLoadingStatusCounts] = useState(false);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [transferToUserIds, setTransferToUserIds] = useState<string[]>([]);
  const [counsellorSearch, setCounsellorSearch] = useState("");
  const [disableWithoutTransfer, setDisableWithoutTransfer] = useState(false);

  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const [adminId] = useState(authModel?.id || "");
  const [adminName] = useState(authModel?.name || authModel?.email || "Admin");

  const counselorTargets = useMemo(
    () =>
      users.filter(
        (user) =>
          user.id !== selectedUser?.id &&
          user.role === "student-counsellor" &&
          user.accountStatus === "enabled",
      ),
    [users, selectedUser?.id],
  );

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !term ||
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" || user.accountStatus === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const resetForm = () => {
    setEditingUserId(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("student-counsellor");
  };

  const closeResetDialog = () => {
    setResetUser(null);
    setResetPassword("");
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(body.error || "Failed to fetch users");
      }

      const data = (await response.json()) as ManagedUser[];
      setUsers(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load users",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (user: ManagedUser) => {
    setEditingUserId(user.id);
    setName(user.name);
    setEmail(user.email);
    setPassword("");
    setRole(user.role);
    setShowForm(true);
  };

  const saveUser = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!editingUserId && !email.trim()) {
      toast.error("Email is required");
      return;
    }

    if (!editingUserId && password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: editingUserId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingUserId
            ? {
                userId: editingUserId,
                name: name.trim(),
                role,
              }
            : {
                name: name.trim(),
                email: email.trim(),
                password,
                role,
              },
        ),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(body.error || "Failed to save user");
      }

      toast.success(editingUserId ? "User updated" : "User created");
      resetForm();
      setShowForm(false);
      await loadUsers();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save user",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    if (resetPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: resetUser.id,
          newPassword: resetPassword,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to reset password");
      }

      toast.success("Password reset");
      closeResetDialog();
      await loadUsers();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reset password",
      );
    } finally {
      setResetLoading(false);
    }
  };

  const enableUser = async (user: ManagedUser) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          accountStatus: "enabled",
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(body.error || "Failed to enable user");
      }

      toast.success(`${user.name} enabled`);
      await loadUsers();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to enable user",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDisableDialog = async (user: ManagedUser) => {
    setSelectedUser(user);
    setDisableDialogOpen(true);
    setIsLoadingStatusCounts(true);
    setStatusCounts({});
    setSelectedStatuses([]);
    setTransferToUserIds([]);
    setCounsellorSearch("");
    setDisableWithoutTransfer(false);

    try {
      const response = await fetch(`/api/admin/users/disable?userId=${user.id}`);
      if (!response.ok) throw new Error("Failed to fetch lead status counts");
      const data = await response.json();
      if (data.success) {
        setStatusCounts(data.statusCounts || {});
        // Select all statuses with count > 0 by default
        const initialSelected = Object.keys(data.statusCounts || {}).filter(
          (status) => (data.statusCounts[status] || 0) > 0
        );
        setSelectedStatuses(initialSelected);

        // Auto select first target counselor as default
        const firstTarget = users.find(
          (item) =>
            item.id !== user.id &&
            item.role === "student-counsellor" &&
            item.accountStatus === "enabled",
        );
        if (firstTarget) {
          setTransferToUserIds([firstTarget.id]);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load lead status breakdown");
    } finally {
      setIsLoadingStatusCounts(false);
    }
  };

  const totalLeadsToTransfer = useMemo(() => {
    return selectedStatuses.reduce((acc, status) => acc + (statusCounts[status] || 0), 0);
  }, [selectedStatuses, statusCounts]);

  const filteredCounselorTargets = useMemo(() => {
    const search = counsellorSearch.trim().toLowerCase();
    if (!search) return counselorTargets;
    return counselorTargets.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        c.email.toLowerCase().includes(search)
    );
  }, [counsellorSearch, counselorTargets]);

  const selectAllCounsellors = () => {
    setTransferToUserIds(counselorTargets.map((c) => c.id));
  };

  const clearCounsellors = () => {
    setTransferToUserIds([]);
  };

  const disableUser = async () => {
    if (!selectedUser) return;

    if (!disableWithoutTransfer && totalLeadsToTransfer > 0 && transferToUserIds.length === 0) {
      toast.error("Select at least one transfer counselor before disabling this user");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/users/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          transferToUserIds: !disableWithoutTransfer && totalLeadsToTransfer > 0 ? transferToUserIds : undefined,
          selectedStatuses: !disableWithoutTransfer && totalLeadsToTransfer > 0 ? selectedStatuses : undefined,
          disableWithoutTransfer: disableWithoutTransfer,
          adminId,
          adminName,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(body.error || "Failed to disable user");
      }

      toast.success(`${selectedUser.name} disabled successfully`);
      setDisableDialogOpen(false);
      setSelectedUser(null);
      setTransferToUserIds([]);
      setSelectedStatuses([]);
      setStatusCounts({});
      await loadUsers();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to disable user",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusToggle = (user: ManagedUser, checked: boolean) => {
    if (checked) {
      void enableUser(user);
      return;
    }

    openDisableDialog(user);
  };

  const isSelectedUserDisabled = selectedUser?.accountStatus === "disabled";

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800">System Users</h3>
            <p className="text-sm text-slate-400">
              Manage administrator and counselor credentials
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm transition-all"
          >
            <UserPlus className="h-4 w-4" />
            Add User
          </button>
          <button
            onClick={() => void loadUsers()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 shadow-sm transition-all"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:grid-cols-4 items-end">
        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Search Directory
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              placeholder="Search by name, email..."
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Role Filter
          </label>
          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(
                event.target.value as "all" | "super-admin" | "admin" | "student-counsellor" | "marketing-manager" | "admissions-head",
              )
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          >
            <option value="all">All roles</option>
            <option value="super-admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="student-counsellor">Student Counsellor</option>
            <option value="marketing-manager">Marketing Manager</option>
            <option value="admissions-head">Admissions Head</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Account Status
          </label>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "all" | "enabled" | "disabled",
              )
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          >
            <option value="all">All status</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4 relative overflow-hidden transition-all duration-300">
          <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-blue-600" />
          <h4 className="font-bold text-slate-800 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-blue-600" />
            {editingUserId ? "Edit User Account" : "Register New Account"}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Full Name
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                placeholder="Full name"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Email Address
              </label>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={Boolean(editingUserId)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                placeholder="name@example.com"
              />
            </div>

            {!editingUserId && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="At least 8 characters"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Access Level Role
              </label>
              <select
                value={role}
                onChange={(event) => {
                  const val = event.target.value as "super-admin" | "admin" | "student-counsellor" | "marketing-manager" | "admissions-head";
                  setRole(val);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              >
                <option value="student-counsellor">Student Counsellor</option>
                <option value="marketing-manager">Marketing Manager</option>
                <option value="admissions-head">Admissions Head</option>
                <option value="admin">Admin</option>
                {authModel?.role === "super-admin" && (
                  <option value="super-admin">Super Admin</option>
                )}
              </select>
            </div>

            {/* feature permission flags removed - now fully managed via dynamic access policies */}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => void saveUser()}
              disabled={isSubmitting}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50"
            >
              {editingUserId ? "Save Changes" : "Create User"}
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold rounded-l-2xl">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Assigned Leads</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right rounded-r-2xl">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-slate-400 font-medium"
                    colSpan={5}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                      Loading system directory...
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-slate-400"
                    colSpan={5}
                  >
                    No users match the selected filters
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isEnabled = user.accountStatus === "enabled";
                  const isActionDisabled = user.role === "super-admin" && authModel?.role !== "super-admin";

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50/30 transition-colors duration-200"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">
                          {user.name}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {user.email}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-600">
                        {user.role === "super-admin" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            Super Admin
                          </span>
                        ) : user.role === "admin" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                            Admin
                          </span>
                        ) : user.role === "marketing-manager" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                            Marketing Manager
                          </span>
                        ) : user.role === "admissions-head" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                            Admissions Head
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200">
                            Counselor
                          </span>
                        )}
                      </td>
                      {/* Permissions column deleted */}
                      <td className="px-4 py-3 text-slate-600">
                        <span className="font-bold text-slate-700">
                          {user.assignedLeadCount}
                        </span>{" "}
                        leads
                      </td>
                      <td className="px-4 py-3">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={isEnabled}
                            disabled={isActionDisabled}
                            onChange={(event) =>
                              handleStatusToggle(user, event.target.checked)
                            }
                          />
                          <span className="relative h-6 w-11 rounded-full bg-slate-200 transition-all peer-checked:bg-emerald-500 peer-disabled:opacity-60 peer-disabled:cursor-not-allowed after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-all peer-checked:after:translate-x-5" />
                          <span className="text-xs font-semibold text-slate-500 peer-checked:text-emerald-600">
                            {isEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </label>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isActionDisabled ? (
                          <>
                            <button
                              onClick={() => openEditForm(user)}
                              className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-all"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setResetUser(user)}
                              className="ml-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-all"
                            >
                              Reset Password
                            </button>
                            {!isEnabled && user.assignedLeadCount > 0 && (
                              <button
                                onClick={() => openDisableDialog(user)}
                                className="ml-2 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm transition-all cursor-pointer"
                              >
                                Transfer Leads
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-450 font-semibold italic text-slate-400">
                            <Lock className="h-3 w-3" /> System Managed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <AlertDialogContent size="3xl">
          <AlertDialogHeader className="border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              {isSelectedUserDisabled ? (
                <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                  <UsersRound className="h-5 w-5 animate-pulse" />
                </div>
              ) : (
                <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
                  <UserMinus className="h-5 w-5 animate-pulse" />
                </div>
              )}
              <div className="text-left">
                <AlertDialogTitle className="text-base font-bold text-slate-800">
                  {isSelectedUserDisabled ? "Transfer Leads" : "Disable User Account"}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs text-slate-400 mt-0.5">
                  {selectedUser 
                    ? isSelectedUserDisabled 
                      ? `${selectedUser.name} (${selectedUser.email}) is currently disabled.` 
                      : `${selectedUser.name} (${selectedUser.email}) will lose access immediately.`
                    : "This user will lose access immediately."}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="py-2 text-sm text-left">
            {isLoadingStatusCounts ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
                <span className="text-xs font-semibold text-slate-400">Loading lead breakdown...</span>
              </div>
            ) : selectedUser && selectedUser.assignedLeadCount > 0 ? (
              <div className="space-y-4">
                {/* Warning Banner */}
                <div className="flex items-start gap-2.5 bg-amber-50/70 border border-amber-200/60 rounded-xl p-3 text-amber-900 text-xs">
                  <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-amber-950">
                      {isSelectedUserDisabled ? "Residual Leads Transfer" : "Active Leads Transfer Required"}
                    </p>
                    <p className="text-amber-800 leading-relaxed font-medium">
                      This counsellor has <span className="font-bold">{selectedUser.assignedLeadCount}</span> assigned leads. 
                      Configure status filters and choose target counsellors to distribute these leads.
                    </p>
                  </div>
                </div>

                {/* Disable Without Transferring Checkbox Option */}
                {!isSelectedUserDisabled && (
                  <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200/60 rounded-xl p-3 select-none">
                    <input
                      id="disableWithoutTransferCheckbox"
                      type="checkbox"
                      checked={disableWithoutTransfer}
                      onChange={(e) => setDisableWithoutTransfer(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 h-4 w-4 cursor-pointer"
                    />
                    <label htmlFor="disableWithoutTransferCheckbox" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      Disable account without transferring leads (leads will remain assigned to this user)
                    </label>
                  </div>
                )}
 
                {/* Grid columns */}
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 items-start transition-all duration-200 ${
                  disableWithoutTransfer ? "opacity-40 pointer-events-none" : ""
                }`}>
                  {/* Column 1: Status selection checkboxes */}
                  <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <Filter className="h-3.5 w-3.5 text-slate-400" />
                      <span>Select Lead Statuses ({totalLeadsToTransfer} selected)</span>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {["New", "Ringing-No-Answer", "Contacted", "Follow-up", "Registered", "Lost"].map((status) => {
                        const count = statusCounts[status] || 0;
                        const isChecked = selectedStatuses.includes(status);
                        const hasLeads = count > 0;

                        return (
                          <label
                            key={status}
                            className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                              !hasLeads
                                ? "opacity-50 bg-slate-100/40 border-slate-100 cursor-not-allowed"
                                : isChecked
                                  ? "bg-white border-blue-500 shadow-sm"
                                  : "bg-white border-slate-200 hover:border-slate-350"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                disabled={!hasLeads}
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStatuses([...selectedStatuses, status]);
                                  } else {
                                    setSelectedStatuses(selectedStatuses.filter((s) => s !== status));
                                  }
                                }}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                              />
                              <span className={`text-xs font-bold ${isChecked ? "text-slate-800" : "text-slate-600"}`}>
                                {status.replace(/-/g, " ")}
                              </span>
                            </div>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${isChecked ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                              {count} lead{count !== 1 && "s"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Column 2: Counsellors list with checkboxes */}
                  <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <UsersRound className="h-3.5 w-3.5 text-slate-400" />
                        <span>Select Targets ({transferToUserIds.length})</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={selectAllCounsellors}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-[10px] text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={clearCounsellors}
                          className="text-[10px] font-bold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Search Field */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search counsellors..."
                        value={counsellorSearch}
                        onChange={(e) => setCounsellorSearch(e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2.5 focus:border-blue-500 focus:outline-none transition-all placeholder-slate-400"
                      />
                    </div>

                    {/* Target Counsellors List */}
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {filteredCounselorTargets.length === 0 ? (
                        <div className="text-center py-6 text-xs text-slate-450 italic">
                          {counsellorSearch ? "No matching counsellors found" : "No other counsellors available"}
                        </div>
                      ) : (
                        filteredCounselorTargets.map((target) => {
                          const isChecked = transferToUserIds.includes(target.id);
                          return (
                            <label
                              key={target.id}
                              className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer ${
                                isChecked
                                  ? "bg-white border-blue-500 shadow-sm"
                                  : "bg-white border-slate-200 hover:border-slate-350"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setTransferToUserIds([...transferToUserIds, target.id]);
                                    } else {
                                      setTransferToUserIds(transferToUserIds.filter((id) => id !== target.id));
                                    }
                                  }}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 h-3.5 w-3.5 cursor-pointer"
                                />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate">{target.name}</p>
                                  <p className="text-[9px] text-slate-400 truncate">{target.email}</p>
                                </div>
                              </div>
                              <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full shrink-0">
                                {target.assignedLeadCount} leads
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Distribution preview banner */}
                {!disableWithoutTransfer && totalLeadsToTransfer > 0 && (
                  <div className={`rounded-xl p-3 border text-xs transition-all duration-300 ${
                    transferToUserIds.length === 0
                      ? "bg-rose-50 border-rose-200 text-rose-950"
                      : "bg-indigo-50/50 border-indigo-200 text-indigo-950"
                  }`}>
                    {transferToUserIds.length === 0 ? (
                      <p className="font-bold flex items-center gap-1">
                        Select at least one counselor to receive the reassigned leads.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-bold">Redistribution Summary</p>
                        <p className="text-[11px] text-slate-600 leading-relaxed font-semibold">
                          <span className="text-indigo-700 font-extrabold">{totalLeadsToTransfer} leads</span> will be transferred equally. 
                          Each of the <span className="text-indigo-700 font-extrabold">{transferToUserIds.length}</span> selected counsellors will receive{" "}
                          <span className="text-indigo-700 font-extrabold">{Math.floor(totalLeadsToTransfer / transferToUserIds.length)} leads</span>.
                          {totalLeadsToTransfer % transferToUserIds.length > 0 && (
                            <span>
                              {" "}(
                              <span className="font-bold">{totalLeadsToTransfer % transferToUserIds.length}</span> counsellor(s) will receive 1 additional remainder lead).
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-500 py-4 text-center italic bg-slate-50 rounded-xl border border-slate-100">
                No active leads found. You can safely disable this counsellor directly.
              </p>
            )}
          </div>
 
          <AlertDialogFooter className="border-t border-slate-100 pt-3">
            <AlertDialogCancel disabled={isSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              disabled={isSubmitting || (!disableWithoutTransfer && totalLeadsToTransfer > 0 && transferToUserIds.length === 0)}
              onClick={(e) => {
                if (isSubmitting || (!disableWithoutTransfer && totalLeadsToTransfer > 0 && transferToUserIds.length === 0)) {
                  e.preventDefault();
                  return;
                }
                void disableUser();
              }}
            >
              {isSubmitting 
                ? isSelectedUserDisabled 
                  ? "Transferring..." 
                  : "Disabling..." 
                : isSelectedUserDisabled 
                  ? "Confirm Transfer" 
                  : "Confirm Disable"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      {resetUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={closeResetDialog}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                Reset password for {resetUser.name}
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Enter a new password for this user account.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                New password
              </label>
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                placeholder="At least 8 characters"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
              <button
                onClick={closeResetDialog}
                disabled={resetLoading}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetLoading}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50"
              >
                {resetLoading ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
