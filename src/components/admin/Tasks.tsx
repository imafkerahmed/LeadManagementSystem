"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Trash2,
  Edit,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  User,
  ListTodo,
} from "lucide-react";
import { Task, TaskStatus, TaskPriority, User as SystemUser } from "@/types";
import { createPocketBaseClient } from "@/lib/pocketbase";
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

export default function AdminTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [status, setStatus] = useState<TaskStatus>("Pending");
  const [notes, setNotes] = useState("");

  // Dialogs state
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewTask, setViewTask] = useState<Task | null>(null);

  // History state
  interface TaskHistoryEntry {
    id: string;
    timeStamp: string;
    taskId: string;
    eventType: string;
    changedBy: string;
    oldValue: string;
    newValue: string;
    comment: string;
    created: string;
  }
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const pb = createPocketBaseClient();
      const token = pb.authStore.token;
      const fetchOptions: RequestInit = { cache: "no-store" };
      if (token) {
        fetchOptions.headers = { Authorization: `Bearer ${token}` };
      }

      const [tasksRes, usersRes] = await Promise.all([
        fetch("/api/admin/tasks", fetchOptions),
        fetch("/api/admin/users", fetchOptions),
      ]);

      if (!tasksRes.ok) throw new Error("Failed to load tasks");
      if (!usersRes.ok) throw new Error("Failed to load users");

      const tasksData = (await tasksRes.json()) as Task[];
      const usersData = (await usersRes.json()) as SystemUser[];

      setTasks(tasksData);
      setUsers(usersData.filter((u) => u.tasksEnabled !== false));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load tasks data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const fetchTaskHistory = async (taskId: string) => {
    setIsLoadingHistory(true);
    setHistory([]);
    try {
      const response = await fetch(`/api/tasks/history?taskId=${taskId}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error("Error fetching task history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (viewTask) {
      void fetchTaskHistory(viewTask.id);
    } else {
      setHistory([]);
    }
  }, [viewTask]);

  const resetForm = () => {
    setEditingTaskId(null);
    setTitle("");
    setDescription("");
    setAssignedTo(users[0]?.id || "");
    setDueDate("");
    setPriority("Medium");
    setStatus("Pending");
    setNotes("");
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (task: Task) => {
    setEditingTaskId(task.id);
    setTitle(task.title);
    setDescription(task.description || "");
    setAssignedTo(task.assignedTo);
    setDueDate(task.dueDate ? task.dueDate.split("T")[0] : "");
    setPriority(task.priority);
    setStatus(task.status);
    setNotes(task.notes || "");
    setShowForm(true);
  };

  const saveTask = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!assignedTo) {
      toast.error("Assignee is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        taskId: editingTaskId || undefined,
        title: title.trim(),
        description: description.trim(),
        assignedTo,
        dueDate: dueDate ? new Date(dueDate).toISOString() : "",
        priority,
        status,
        notes: editingTaskId ? notes : "",
      };

      const pb = createPocketBaseClient();
      const token = pb.authStore.token;

      const response = await fetch("/api/admin/tasks", {
        method: editingTaskId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save task");
      }

      toast.success(editingTaskId ? "Task updated successfully" : "Task created successfully");
      resetForm();
      setShowForm(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteTask = async () => {
    if (!deleteTaskId) return;

    try {
      const pb = createPocketBaseClient();
      const token = pb.authStore.token;

      const options: RequestInit = { method: "DELETE" };
      if (token) {
        options.headers = { Authorization: `Bearer ${token}` };
      }

      const response = await fetch(`/api/admin/tasks?id=${deleteTaskId}`, options);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to delete task");
      }

      toast.success("Task deleted successfully");
      setDeleteDialogOpen(false);
      setDeleteTaskId(null);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete task");
    }
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const total = tasks.length;
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let overdue = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tasks.forEach((t) => {
      if (t.status === "Completed") {
        completed++;
      } else {
        if (t.status === "In-Progress") {
          inProgress++;
        } else {
          pending++;
        }

        if (t.dueDate) {
          const due = new Date(t.dueDate);
          due.setHours(0, 0, 0, 0);
          if (due < today) {
            overdue++;
          }
        }
      }
    });

    return { total, pending, inProgress, completed, overdue };
  }, [tasks]);

  // Filters filtering
  const filteredTasks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return tasks.filter((t) => {
      const matchesSearch =
        !term ||
        t.title.toLowerCase().includes(term) ||
        (t.description || "").toLowerCase().includes(term);

      const matchesAssignee = assigneeFilter === "all" || t.assignedTo === assigneeFilter;
      const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;

      let matchesStatus = true;
      if (statusFilter !== "all") {
        if (statusFilter === "Overdue") {
          const due = t.dueDate ? new Date(t.dueDate) : null;
          matchesStatus = t.status !== "Completed" && due !== null && due < today;
        } else {
          matchesStatus = t.status === statusFilter;
        }
      }

      return matchesSearch && matchesAssignee && matchesPriority && matchesStatus;
    });
  }, [tasks, searchTerm, assigneeFilter, statusFilter, priorityFilter]);

  const getStatusColor = (status: TaskStatus, dueDateStr?: string) => {
    if (status === "Completed") return "bg-emerald-50 text-emerald-700 border-emerald-100";
    
    if (dueDateStr) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDateStr);
      due.setHours(0, 0, 0, 0);
      if (due < today) {
        return "bg-rose-50 text-rose-700 border-rose-100 animate-pulse";
      }
    }

    if (status === "In-Progress") return "bg-blue-50 text-blue-700 border-blue-100";
    return "bg-slate-100 text-slate-600 border-slate-200";
  };

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case "High":
        return "bg-rose-50 text-rose-700 border-rose-100";
      case "Medium":
        return "bg-amber-50 text-amber-700 border-amber-100";
      case "Low":
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  const formatTimelineDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  const getHistoryDescription = (entry: TaskHistoryEntry) => {
    switch (entry.eventType) {
      case "Task Created":
        return "Task was created.";
      case "Status Updated":
        return (
          <span>
            Status changed from <span className="font-semibold text-slate-700">{entry.oldValue}</span> to <span className="font-semibold text-blue-600">{entry.newValue}</span>
          </span>
        );
      case "Assignee Changed":
        return (
          <span>
            Assignee changed from <span className="font-semibold text-slate-700">{entry.oldValue}</span> to <span className="font-semibold text-blue-600">{entry.newValue}</span>
          </span>
        );
      case "Priority Updated":
        return (
          <span>
            Priority updated from <span className="font-semibold text-slate-700">{entry.oldValue}</span> to <span className="font-semibold text-blue-600">{entry.newValue}</span>
          </span>
        );
      case "Due Date Changed":
        return (
          <span>
            Due date changed from <span className="font-semibold text-slate-700">{entry.oldValue}</span> to <span className="font-semibold text-blue-600">{entry.newValue}</span>
          </span>
        );
      case "Notes Added":
        return (
          <div className="space-y-1">
            <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Note:</span>
            <p className="italic bg-slate-50 p-2 rounded border border-slate-100 text-slate-600 text-[11px] whitespace-pre-wrap select-all">{entry.comment}</p>
          </div>
        );
      default:
        return entry.comment || entry.eventType;
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      {/* Action buttons row */}
      <div className="flex justify-end items-center gap-2 pb-4 border-b border-slate-100">
        <button
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" />
          Create Task
        </button>
        <button
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 shadow-sm transition-all"
        >
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Total Tasks</span>
            <span className="text-2xl font-black text-slate-700 mt-1 block">{stats.total}</span>
          </div>
          <div className="p-3 bg-slate-50 text-slate-500 rounded-xl"><ListTodo className="h-5 w-5" /></div>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Pending</span>
            <span className="text-2xl font-black text-slate-500 mt-1 block">{stats.pending}</span>
          </div>
          <div className="p-3 bg-slate-50 text-slate-400 rounded-xl"><Clock className="h-5 w-5" /></div>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">In Progress</span>
            <span className="text-2xl font-black text-blue-600 mt-1 block">{stats.inProgress}</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-500 rounded-xl"><Clock className="h-5 w-5" /></div>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Completed</span>
            <span className="text-2xl font-black text-emerald-600 mt-1 block">{stats.completed}</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-500 rounded-xl"><CheckCircle className="h-5 w-5" /></div>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between col-span-2 lg:col-span-1">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Overdue</span>
            <span className="text-2xl font-black text-rose-600 mt-1 block">{stats.overdue}</span>
          </div>
          <div className="p-3 bg-rose-50 text-rose-500 rounded-xl"><AlertCircle className="h-5 w-5" /></div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="md:col-span-1 space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Search Tasks</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              placeholder="Search title..."
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assignee</label>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          >
            <option value="all">All Staff</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          >
            <option value="all">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="In-Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Overdue">Overdue</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Priority</label>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          >
            <option value="all">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </div>
      </div>

      {/* Add/Edit Task Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { resetForm(); setShowForm(false); }} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <h4 className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <ListTodo className="h-5 w-5 text-blue-600" />
              {editingTaskId ? "Edit Task Details" : "Create New Task"}
            </h4>

            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Task Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="Write a clear task summary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="Detail what needs to be done..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assign To Staff</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option value="">Select Staff Member</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Priority Level</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              {editingTaskId && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  >
                    <option value="Pending">Pending</option>
                    <option value="In-Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 mt-2">
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveTask()}
                disabled={isSubmitting}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-1">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving...
                  </span>
                ) : (
                  editingTaskId ? "Save Changes" : "Create Task"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold rounded-l-2xl">Task</th>
                <th className="px-4 py-3 font-semibold">Assignee</th>
                <th className="px-4 py-3 font-semibold">Due Date</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right rounded-r-2xl">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400 font-medium" colSpan={6}>
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                      Loading tasks database...
                    </div>
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={6}>
                    No tasks found matching current filters.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((t) => {
                  const isOverdue =
                    t.status !== "Completed" &&
                    t.dueDate &&
                    new Date(t.dueDate).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/30 transition-colors duration-200 cursor-pointer"
                      onClick={() => setViewTask(t)}
                    >
                      <td className="px-4 py-3 max-w-[280px]">
                        <div className="text-[10px] font-mono text-slate-400">{t.taskId}</div>
                        <div className="font-semibold text-slate-800 truncate">{t.title}</div>
                        <div className="text-xs text-slate-400 mt-0.5 truncate">{t.description || "No description"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{t.assignedToName}</td>
                      <td className="px-4 py-3 text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span className={isOverdue ? "text-rose-600 font-semibold" : ""}>
                            {formatDate(t.dueDate)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getPriorityColor(t.priority)}`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(t.status, t.dueDate)}`}>
                          {isOverdue ? "Overdue" : t.status === "In-Progress" ? "In Progress" : t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openEditForm(t)}
                          className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 p-1.5 text-slate-600 shadow-sm transition-all"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteTaskId(t.id);
                            setDeleteDialogOpen(true);
                          }}
                          className="ml-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 p-1.5 text-rose-600 shadow-sm transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Task Details Dialog Modal */}
      {viewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setViewTask(null)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityColor(viewTask.priority)}`}>
                  {viewTask.priority} Priority
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusColor(viewTask.status, viewTask.dueDate)}`}>
                  {viewTask.status}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-800">{viewTask.title}</h3>
              <p className="text-xs text-slate-400 mt-1">Created on {formatDate(viewTask.created)} by {viewTask.createdBy}</p>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Description</h4>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl min-h-[60px] whitespace-pre-wrap">
                  {viewTask.description || "No description provided."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Assignee</h4>
                  <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                    <User className="h-4 w-4 text-slate-400" />
                    {viewTask.assignedToName}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Due Date</h4>
                  <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    {formatDate(viewTask.dueDate)}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Staff Notes / Updates</h4>
                <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl min-h-[60px] whitespace-pre-wrap italic">
                  {viewTask.notes || "No notes entered yet."}
                </div>
              </div>

              {/* Task History Timeline */}
              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Activity Timeline
                </h4>
                
                {isLoadingHistory ? (
                  <div className="flex items-center gap-2 py-4 justify-center text-xs text-slate-400">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                    Fetching task updates...
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-400 text-center py-2">
                    No timeline events logged yet.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                    {history.map((entry) => (
                      <div key={entry.id} className="relative pl-5 border-l border-slate-100 ml-2 py-0.5">
                        <span className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full bg-blue-500 ring-4 ring-white" />
                        <div className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-white p-3 shadow-sm text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
                              {entry.eventType}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                              {formatTimelineDate(entry.timeStamp)} • By {entry.changedBy}
                            </span>
                          </div>
                          <div className="text-slate-700 mt-1">
                            {getHistoryDescription(entry)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
              <button
                onClick={() => {
                  const t = viewTask;
                  setViewTask(null);
                  openEditForm(t);
                }}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all"
              >
                Edit Task
              </button>
              <button
                onClick={() => setViewTask(null)}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl border border-slate-100 bg-white shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-800 font-bold">Delete Task</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 text-sm">
              Are you sure you want to permanently delete this task? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void deleteTask()}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all"
            >
              Delete Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
