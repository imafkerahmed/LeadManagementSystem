"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createPocketBaseClient } from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Users</h3>
          <p className="text-sm text-gray-600 mt-1">Manage system users</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openCreateForm}>Add User</Button>
          <Button variant="outline" onClick={() => void loadUsers()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-4">
        <label className="text-sm text-gray-700 md:col-span-2">
          Search
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder="Search by name or email"
          />
        </label>

        <label className="text-sm text-gray-700">
          Role
          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(
                event.target.value as "all" | "admin" | "student-counsellor",
              )
            }
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="student-counsellor">Student Counsellor</option>
          </select>
        </label>

        <label className="text-sm text-gray-700">
          Status
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "all" | "enabled" | "disabled",
              )
            }
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
          >
            <option value="all">All status</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>

      {showForm && (
        <div className="rounded-lg border border-gray-200 p-4 space-y-3">
          <h4 className="font-medium text-gray-900">
            {editingUserId ? "Edit User" : "Add User"}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm text-gray-700">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                placeholder="Full name"
              />
            </label>

            <label className="text-sm text-gray-700">
              Email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={Boolean(editingUserId)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                placeholder="name@example.com"
              />
            </label>

            {!editingUserId && (
              <label className="text-sm text-gray-700">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="At least 8 characters"
                />
              </label>
            )}

            <label className="text-sm text-gray-700">
              Role
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as "admin" | "student-counsellor")
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="student-counsellor">Student Counsellor</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => void saveUser()} disabled={isSubmitting}>
              {editingUserId ? "Save Changes" : "Create User"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">User</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Assigned Leads</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-4 text-gray-500" colSpan={5}>
                  Loading users...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-gray-500" colSpan={5}>
                  No users match the selected filters
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const isEnabled = user.accountStatus === "enabled";

                return (
                  <tr key={user.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {user.name}
                      </div>
                      <div className="text-xs text-gray-600">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {user.role === "admin" ? "Admin" : "Student Counsellor"}
                    </td>
                    <td className="px-4 py-3">{user.assignedLeadCount}</td>
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
                        <span className="relative h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-emerald-500 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-5" />
                        <span className="text-xs text-gray-700">
                          {isEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </label>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditForm(user)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setResetUser(user)}
                        className="ml-2"
                      >
                        Reset Password
                      </Button>
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
            className="absolute inset-0 bg-black/30"
            onClick={closeResetDialog}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-lg font-medium">
              Reset password for {resetUser.name}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Enter a new password for this user.
            </p>

            <div className="mt-4">
              <label className="block text-sm">
                New password
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="At least 8 characters"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={closeResetDialog}
                disabled={resetLoading}
              >
                Cancel
              </Button>
              <Button onClick={handleResetPassword} disabled={resetLoading}>
                {resetLoading ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
