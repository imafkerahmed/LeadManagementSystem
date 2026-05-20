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
import { Search, Users, UserPlus } from "lucide-react";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "student-counsellor";
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
        } | null);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "admin" | "student-counsellor"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "enabled" | "disabled"
  >("all");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "student-counsellor">(
    "student-counsellor",
  );

  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [transferToUserId, setTransferToUserId] = useState("");

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

  const openDisableDialog = (user: ManagedUser) => {
    setSelectedUser(user);
    const firstTarget = users.find(
      (item) =>
        item.id !== user.id &&
        item.role === "student-counsellor" &&
        item.accountStatus === "enabled",
    );
    setTransferToUserId(firstTarget?.id || "");
    setDisableDialogOpen(true);
  };

  const disableUser = async () => {
    if (!selectedUser) return;

    if (selectedUser.assignedLeadCount > 0 && !transferToUserId) {
      toast.error("Select a transfer counselor before disabling this user");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/users/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          transferToUserId:
            selectedUser.assignedLeadCount > 0 ? transferToUserId : undefined,
          adminId,
          adminName,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(body.error || "Failed to disable user");
      }

      toast.success(`${selectedUser.name} disabled`);
      setDisableDialogOpen(false);
      setSelectedUser(null);
      setTransferToUserId("");
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

  return (
    <div className="space-y-6">
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
                event.target.value as "all" | "admin" | "student-counsellor",
              )
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="student-counsellor">Student Counsellor</option>
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
                onChange={(event) =>
                  setRole(event.target.value as "admin" | "student-counsellor")
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              >
                <option value="student-counsellor">Student Counsellor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
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

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
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
                      {user.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200">
                          Counselor
                        </span>
                      )}
                    </td>
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
                          onChange={(event) =>
                            handleStatusToggle(user, event.target.checked)
                          }
                        />
                        <span className="relative h-6 w-11 rounded-full bg-slate-200 transition-all peer-checked:bg-emerald-500 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-all peer-checked:after:translate-x-5" />
                        <span className="text-xs font-semibold text-slate-500 peer-checked:text-emerald-600">
                          {isEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </label>
                    </td>
                    <td className="px-4 py-3 text-right">
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
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <AlertDialogContent size="default" className="max-w-lg sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable User</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUser ? `${selectedUser.name}` : "This user"} will lose
              access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 text-sm">
            {selectedUser && selectedUser.assignedLeadCount > 0 ? (
              <>
                <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  This user has {selectedUser.assignedLeadCount} assigned leads.
                  Please choose another enabled student counsellor to transfer
                  all leads before disabling.
                </p>

                <label className="block text-gray-700">
                  Transfer all leads to
                  <select
                    value={transferToUserId}
                    onChange={(event) =>
                      setTransferToUserId(event.target.value)
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  >
                    <option value="">Select a counselor</option>
                    {counselorTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name} ({target.email})
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <p className="text-gray-700">
                No assigned leads found. You can disable this user directly.
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void disableUser()}>
              {isSubmitting ? "Disabling..." : "Confirm Disable"}
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
