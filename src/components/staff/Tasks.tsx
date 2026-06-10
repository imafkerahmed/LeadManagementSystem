"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  ListTodo,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  Check,
  ChevronRight,
  MessageSquare,
  Search,
} from "lucide-react";
import { Task, TaskStatus, TaskPriority } from "@/types";
import { createPocketBaseClient } from "@/lib/pocketbase";

export default function StaffTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [viewTask, setViewTask] = useState<Task | null>(null);
  
  // Note/comment box for task updates
  const [updateNotes, setUpdateNotes] = useState("");
  
  // Filters/Tabs
  const [activeTab, setActiveTab] = useState<"active" | "completed" | "all">("active");
  const [searchTerm, setSearchTerm] = useState("");

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const pb = createPocketBaseClient();
      const token = pb.authStore.token;
      
      const response = await fetch("/api/staff/tasks", {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        throw new Error("Failed to load your tasks");
      }

      const data = (await response.json()) as Task[];
      setTasks(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load tasks");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, []);

  const handleUpdateStatus = async (taskId: string, newStatus: TaskStatus, notesText?: string) => {
    setIsUpdating(taskId);
    try {
      const pb = createPocketBaseClient();
      const token = pb.authStore.token;

      const response = await fetch("/api/staff/tasks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          taskId,
          status: newStatus,
          notes: notesText !== undefined ? notesText.trim() : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to update task status");
      }

      toast.success(`Task status updated to ${newStatus}`);
      setViewTask(null);
      setUpdateNotes("");
      await loadTasks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update task");
    } finally {
      setIsUpdating(null);
    }
  };

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    
    return tasks
      .filter((t) => {
        const matchesSearch =
          !term ||
          t.title.toLowerCase().includes(term) ||
          (t.description || "").toLowerCase().includes(term);

        if (activeTab === "active") {
          return matchesSearch && t.status !== "Completed";
        }
        if (activeTab === "completed") {
          return matchesSearch && t.status === "Completed";
        }
        return matchesSearch;
      })
      .sort((a, b) => {
        // Overdue & Pending/In-Progress first, then sorted by due date
        if (a.status === "Completed" && b.status !== "Completed") return 1;
        if (a.status !== "Completed" && b.status === "Completed") return -1;
        
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [tasks, activeTab, searchTerm]);

  const getStatusBadge = (status: TaskStatus, dueDateStr?: string) => {
    if (status === "Completed") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Completed
        </span>
      );
    }

    if (dueDateStr) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDateStr);
      due.setHours(0, 0, 0, 0);
      if (due < today) {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100 animate-pulse">
            <AlertCircle className="h-3.5 w-3.5 animate-bounce" />
            Overdue
          </span>
        );
      }
    }

    if (status === "In-Progress") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
          <Clock className="h-3.5 w-3.5" />
          In Progress
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        <Clock className="h-3.5 w-3.5 text-slate-400" />
        Pending
      </span>
    );
  };

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case "High":
        return "bg-rose-50 text-rose-600 border-rose-100";
      case "Medium":
        return "bg-amber-50 text-amber-600 border-amber-100";
      case "Low":
        return "bg-slate-50 text-slate-500 border-slate-200";
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "No deadline";
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
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Navigation Tabs */}
        <div className="flex bg-slate-100/80 p-1 rounded-xl w-fit border border-slate-200/40">
          <button
            onClick={() => setActiveTab("active")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "active"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Active Tasks
          </button>
          <button
            onClick={() => setActiveTab("completed")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "completed"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Completed
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "all"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            All Tasks
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            placeholder="Search tasks..."
          />
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            <p className="text-sm font-medium">Loading your checklist...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-100 rounded-2xl shadow-sm text-center px-4">
            <div className="p-4 bg-slate-50 rounded-full text-slate-400 mb-3">
              <ListTodo className="h-8 w-8" />
            </div>
            <h4 className="text-base font-bold text-slate-800">Clear Checklist!</h4>
            <p className="text-sm text-slate-400 mt-1 max-w-xs">
              No tasks found in this section. You are all caught up!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.map((t) => {
              const isOverdue =
                t.status !== "Completed" &&
                t.dueDate &&
                new Date(t.dueDate).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);

              return (
                <div
                  key={t.id}
                  onClick={() => {
                    setViewTask(t);
                    setUpdateNotes(t.notes || "");
                  }}
                  className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                    isOverdue ? "border-rose-100 hover:border-rose-300 bg-rose-50/5" : "border-slate-100"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex gap-1.5 flex-wrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityBadge(t.priority)}`}>
                          {t.priority}
                        </span>
                        {getStatusBadge(t.status, t.dueDate)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-mono text-slate-400 mb-0.5">{t.taskId}</div>
                      <h4 className="font-bold text-slate-800 group-hover:text-blue-600 line-clamp-1">
                        {t.title}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2 min-h-[32px]">
                        {t.description || "No description provided."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span className={isOverdue ? "text-rose-600 font-semibold" : ""}>
                        {formatDate(t.dueDate)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 hover:text-slate-600 font-medium">
                      <span>View details</span>
                      <ChevronRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task Update & Details Modal */}
      {viewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setViewTask(null)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityBadge(viewTask.priority)}`}>
                  {viewTask.priority} Priority
                </span>
                {getStatusBadge(viewTask.status, viewTask.dueDate)}
              </div>
              <div className="text-xs font-mono text-slate-400 mt-1">{viewTask.taskId}</div>
              <h3 className="text-lg font-bold text-slate-800">{viewTask.title}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Assigned by {viewTask.createdBy} on {formatDate(viewTask.created)}</p>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Task Description</h4>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl min-h-[60px] whitespace-pre-wrap">
                  {viewTask.description || "No description provided."}
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span>Deadline: <strong className="text-slate-700">{formatDate(viewTask.dueDate)}</strong></span>
              </div>

              {/* Status Update section */}
              {viewTask.status !== "Completed" && (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Update Task Status</h4>
                  
                  {viewTask.status === "Pending" ? (
                    <button
                      onClick={() => void handleUpdateStatus(viewTask.id, "In-Progress")}
                      disabled={isUpdating !== null}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 py-3 text-sm font-semibold text-white transition disabled:opacity-50"
                    >
                      {isUpdating === viewTask.id ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Start Working (Mark In Progress)
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                          Progress/Completion Notes
                        </label>
                        <textarea
                          value={updateNotes}
                          onChange={(e) => setUpdateNotes(e.target.value)}
                          rows={2}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400"
                          placeholder="What did you accomplish or what updates do you have?"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void handleUpdateStatus(viewTask.id, "Completed", updateNotes)}
                          disabled={isUpdating !== null}
                          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
                        >
                          {isUpdating === viewTask.id ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Mark Completed
                        </button>
                        <button
                          onClick={() => void handleUpdateStatus(viewTask.id, "In-Progress", updateNotes)}
                          disabled={isUpdating !== null}
                          className="rounded-xl border border-slate-200 hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 transition"
                        >
                          Save Notes Only
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Show Notes for completed tasks */}
              {viewTask.status === "Completed" && (
                <div className="border-t border-slate-100 pt-4 space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Completion Notes</h4>
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl min-h-[40px] whitespace-pre-wrap italic">
                    {viewTask.notes || "No notes were provided upon completion."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-50">
              <button
                onClick={() => setViewTask(null)}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
