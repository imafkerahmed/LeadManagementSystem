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
} from "lucide-react";
import { Task, TaskStatus, TaskPriority } from "@/types";
import { createPocketBaseClient } from "@/lib/pocketbase";

export default function StaffTasks({
  searchTerm: externalSearchTerm,
}: {
  searchTerm?: string;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [viewTask, setViewTask] = useState<Task | null>(null);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  
  // Note/comment box for task updates
  const [updateNotes, setUpdateNotes] = useState("");
  
  // View Modes (List on mobile, Kanban on desktop)
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");

  useEffect(() => {
    const checkViewport = () => {
      if (window.innerWidth < 768) {
        setViewMode("list");
      } else {
        setViewMode("kanban");
      }
    };
    
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  // Filters/Tabs
  const [activeTab, setActiveTab] = useState<"pending" | "in-progress" | "completed" | "all">("pending");
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : "";
  const [accessPolicies, setAccessPolicies] = useState<any[]>([]);
  const [isAccessLoading, setIsAccessLoading] = useState(true);

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

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const pb = createPocketBaseClient();
      const token = pb.authStore.token;
      const fetchOptions: RequestInit = { cache: "no-store" };
      if (token) {
        fetchOptions.headers = { Authorization: `Bearer ${token}` };
      }
      
      const response = await fetch("/api/staff/tasks", fetchOptions);

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

    const fetchPolicies = async () => {
      try {
        const pb = createPocketBaseClient();
        const list = await pb.collection("accessControl").getFullList();
        setAccessPolicies(list);
      } catch (err) {
        console.error("Failed to load access policies in staff tasks:", err);
      } finally {
        setIsAccessLoading(false);
      }
    };
    void fetchPolicies();
  }, []);

  const getPolicyAccess = (sectionKey: string, defaultVal: boolean) => {
    if (isAccessLoading) return false;
    const policy = accessPolicies.find((p) => p.sectionKey === sectionKey);
    if (!policy) return defaultVal;
    if (policy.enabled === false) return false;
    const pb = createPocketBaseClient();
    const userId = pb.authStore.model?.id || "";
    const userRole = pb.authStore.model?.role || "";
    const denied = policy.deniedUsers || [];
    const allowed = policy.allowedUsers || [];
    const roles = policy.allowedRoles || [];
    return !denied.includes(userId) && (allowed.includes(userId) || roles.includes(userRole));
  };

  const canCompleteTasks = getPolicyAccess("user_tasks_complete", true);

  const fetchTaskHistory = async (taskId: string) => {
    console.log("[fetchTaskHistory - Staff] Fetching history for taskId:", taskId);
    setIsLoadingHistory(true);
    setHistory([]);
    try {
      const response = await fetch(`/api/tasks/history?taskId=${taskId}`);
      console.log("[fetchTaskHistory - Staff] Response status:", response.status, "ok:", response.ok);
      if (response.ok) {
        const data = await response.json();
        console.log("[fetchTaskHistory - Staff] Fetched history items:", data.length);
        setHistory(data);
      } else {
        console.warn("[fetchTaskHistory - Staff] Response not ok:", response.statusText);
      }
    } catch (error) {
      console.error("[fetchTaskHistory - Staff] Error fetching task history:", error);
    } finally {
      console.log("[fetchTaskHistory - Staff] Setting isLoadingHistory to false");
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (viewTask) {
      void fetchTaskHistory(viewTask.id);
    } else {
      setHistory([]);
    }
    setShowTimelineModal(false);
  }, [viewTask]);

  const handleUpdateStatus = async (taskId: string, newStatus: TaskStatus, notesText?: string) => {
    if (newStatus === "Completed" && !canCompleteTasks) {
      toast.error("You do not have permission to complete tasks.");
      return;
    }
    if (newStatus === "In-Progress" && notesText !== undefined && notesText.trim() === "") {
      toast.error("Cannot save a blank note.");
      return;
    }
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

      toast.success(newStatus === "Completed" ? "Task completed successfully" : "Task updated successfully");
      if (newStatus === "In-Progress") {
        setViewTask((prev) => prev ? { ...prev, status: "In-Progress", notes: notesText || prev.notes || "" } : null);
        setUpdateNotes("");
        void fetchTaskHistory(taskId);
      } else {
        setViewTask(null);
        setUpdateNotes("");
      }
      await loadTasks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update task");
    } finally {
      setIsUpdating(null);
    }
  };

  // Filter and sort tasks for List View
  const filteredTasks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    
    return tasks
      .filter((t) => {
        const matchesSearch =
          !term ||
          t.title.toLowerCase().includes(term) ||
          (t.description || "").toLowerCase().includes(term);

        if (activeTab === "pending") {
          return matchesSearch && t.status === "Pending";
        }
        if (activeTab === "in-progress") {
          return matchesSearch && t.status === "In-Progress";
        }
        if (activeTab === "completed") {
          return matchesSearch && t.status === "Completed";
        }
        return matchesSearch; // "all"
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

  // Filter tasks by search term only for Kanban Board columns
  const searchedTasks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return tasks
      .filter((t) => {
        return (
          !term ||
          t.title.toLowerCase().includes(term) ||
          (t.description || "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        if (a.status === "Completed" && b.status !== "Completed") return 1;
        if (a.status !== "Completed" && b.status === "Completed") return -1;
        
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [tasks, searchTerm]);

  // Count of tasks in each status group for mobile tabs
  const counts = useMemo(() => {
    return {
      pending: tasks.filter((t) => t.status === "Pending").length,
      inProgress: tasks.filter((t) => t.status === "In-Progress").length,
      completed: tasks.filter((t) => t.status === "Completed").length,
      all: tasks.length,
    };
  }, [tasks]);

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
      {/* Controls (only on mobile / list mode) */}
      {viewMode === "list" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex overflow-x-auto max-w-full bg-slate-100/80 p-1 rounded-xl w-fit border border-slate-200/40 shrink-0 scrollbar-none whitespace-nowrap [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                activeTab === "pending"
                  ? "bg-slate-200/90 text-slate-700 border-slate-300/20 shadow-sm"
                  : "text-slate-500 border-transparent hover:text-slate-700"
              }`}
            >
              To Do ({counts.pending})
            </button>
            <button
              onClick={() => setActiveTab("in-progress")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                activeTab === "in-progress"
                  ? "bg-blue-50 text-blue-700 border-blue-200/50 shadow-sm"
                  : "text-slate-500 border-transparent hover:text-slate-700"
              }`}
            >
              In Progress ({counts.inProgress})
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                activeTab === "completed"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/50 shadow-sm"
                  : "text-slate-500 border-transparent hover:text-slate-700"
              }`}
            >
              Completed ({counts.completed})
            </button>
          </div>
        </div>
      )}

      {/* Task List */}
      <div className={`flex-1 min-h-0 ${viewMode === "list" ? "h-[calc(100vh-290px)] overflow-y-auto" : "overflow-y-auto"}`}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            <p className="text-sm font-medium">Loading your checklist...</p>
          </div>
        ) : viewMode === "kanban" ? (
          <div className="flex gap-4 overflow-x-auto pb-4 h-full min-h-0 items-start">
            {/* Kanban Columns */}
            {(["Pending", "In-Progress", "Completed"] as TaskStatus[]).map((colStatus) => {
              const columnTasks = searchedTasks.filter((t) => t.status === colStatus);
              const statusName =
                colStatus === "Pending" ? "To Do" :
                colStatus === "In-Progress" ? "In Progress" : "Completed";

              return (
                <div key={colStatus} className="flex-1 min-w-[280px] sm:min-w-[320px] max-w-[400px] bg-slate-50/50 border border-slate-100 rounded-2xl p-4 flex flex-col h-[calc(100vh-270px)] min-h-[400px]">
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-3.5 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${
                        colStatus === "Pending" ? "bg-slate-400" :
                        colStatus === "In-Progress" ? "bg-blue-500 animate-pulse" :
                        "bg-emerald-500"
                      }`} />
                      <h3 className="font-bold text-slate-700 text-xs tracking-wider uppercase">{statusName}</h3>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200/60 text-slate-600">
                        {columnTasks.length}
                      </span>
                    </div>
                  </div>

                  {/* Scrollable Column Content */}
                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-0">
                    {columnTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-white/40">
                        <p className="text-xs font-semibold">No tasks</p>
                      </div>
                    ) : (
                      columnTasks.map((t) => {
                        const isOverdue =
                          t.status !== "Completed" &&
                          t.dueDate &&
                          new Date(t.dueDate).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);

                        return (
                          <div
                            key={t.id}
                            onClick={() => {
                              setViewTask(t);
                              setUpdateNotes("");
                            }}
                            className={`bg-white border rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
                              isOverdue ? "border-rose-100 hover:border-rose-300 bg-rose-50/5" : "border-slate-100"
                            } ${
                              t.status === "Completed" ? "border-l-4 border-l-emerald-500" :
                              t.status === "In-Progress" ? "border-l-4 border-l-blue-500" :
                              "border-l-4 border-l-slate-300"
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                <span className="text-[9px] font-mono text-slate-400">{t.taskId}</span>
                                <span className={`inline-flex px-1.5 py-0.25 rounded-full text-[9px] font-semibold border ${getPriorityBadge(t.priority)}`}>
                                  {t.priority}
                                </span>
                              </div>
                              <h4 className="font-bold text-slate-800 text-xs mt-1 group-hover:text-blue-600 transition-colors line-clamp-2">
                                {t.title}
                              </h4>
                              {t.description && (
                                <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                                  {t.description}
                                </p>
                              )}
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-slate-400" />
                                <span className={isOverdue ? "text-rose-600 font-semibold" : ""}>
                                  Deadline: {formatDate(t.dueDate)}
                                </span>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
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
          <div className="flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4">
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
                    setUpdateNotes("");
                  }}
                  className={`bg-white border rounded-xl p-3.5 md:p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-300 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between relative overflow-hidden group ${
                    isOverdue ? "border-rose-100 hover:border-rose-300 bg-rose-50/5" : "border-slate-100"
                  } ${
                    t.status === "Completed" ? "border-l-4 border-l-emerald-500" :
                    t.status === "In-Progress" ? "border-l-4 border-l-blue-500" :
                    "border-l-4 border-l-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Compact Checklist Icon / Indicator for List View */}
                    <div className="mt-1 shrink-0">
                      {t.status === "Completed" ? (
                        <div className="h-4 w-4 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </div>
                      ) : t.status === "In-Progress" ? (
                        <div className="h-4 w-4 rounded-full border border-blue-300 bg-blue-50/50" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-slate-200 bg-slate-50" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-mono text-slate-400">{t.taskId}</span>
                        <span className={`inline-flex px-1.5 py-0.25 rounded-full text-[9px] font-semibold border ${getPriorityBadge(t.priority)}`}>
                          {t.priority}
                        </span>
                        {isOverdue && (
                          <span className="inline-flex px-1.5 py-0.25 rounded-full text-[9px] font-semibold bg-rose-50 text-rose-600 border border-rose-100 animate-pulse">
                            Overdue
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm md:text-base group-hover:text-blue-600 transition-colors line-clamp-1 mt-0.5">
                        {t.title}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                        {t.description || "No description provided."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 sm:mt-0 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-slate-100 flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-400 shrink-0">
                    <div className="flex items-center gap-1 shrink-0">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span className={isOverdue ? "text-rose-600 font-semibold" : ""}>
                        Deadline: {formatDate(t.dueDate)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <div 
                        onClick={() => { setViewTask(t); setUpdateNotes(""); }}
                        className="flex items-center gap-0.5 hover:text-slate-600 font-medium cursor-pointer py-1 pl-1"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task Update & Details Modal / Bottom Sheet on Mobile */}
      {viewTask && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center max-sm:animate-fade-in sm:px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300" onClick={() => setViewTask(null)} />
          <div className="relative z-10 w-full max-w-lg bg-white p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 h-[85vh] sm:h-auto sm:max-h-[85vh] sm:rounded-2xl max-sm:rounded-t-3xl max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:pb-8 max-sm:animate-slide-up">
            {/* Mobile Drag Handle */}
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-2 sm:hidden cursor-pointer shrink-0" onClick={() => setViewTask(null)} />
            
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

            <div className="flex flex-col gap-4 min-h-0 max-sm:overflow-y-auto max-sm:flex-1">
              {/* Details & Update Form */}
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
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 enabled:hover:bg-blue-700 py-3 text-sm font-semibold text-white transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
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
                            Progress Notes
                          </label>
                          <textarea
                            value={updateNotes}
                            onChange={(e) => setUpdateNotes(e.target.value)}
                            rows={2}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400"
                            placeholder="What did you accomplish or what updates do you have?"
                          />
                        </div>
                        <button
                          onClick={() => void handleUpdateStatus(viewTask.id, "In-Progress", updateNotes)}
                          disabled={isUpdating !== null || updateNotes.trim() === ""}
                          className="group w-full rounded-xl bg-blue-600 text-white cursor-pointer enabled:hover:bg-blue-700 enabled:hover:shadow-md enabled:hover:shadow-blue-200/50 enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 enabled:active:scale-[0.98] transition-all duration-200 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:transform-none"
                        >
                          {isUpdating === viewTask.id ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                          ) : (
                            <MessageSquare className="h-3.5 w-3.5 transition-colors duration-200 text-current" />
                          )}
                          {isUpdating === viewTask.id ? "Saving..." : "Save Progress Note"}
                        </button>
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

              {/* Activity Timeline */}
              <div className="border-t border-slate-100 pt-4 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Activity Timeline
                  </h4>
                  <button
                    onClick={() => setShowTimelineModal(true)}
                    className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 transition cursor-pointer"
                  >
                    Maximize Timeline
                  </button>
                </div>

                <div className="pr-1 scrollbar-thin max-sm:h-auto max-sm:overflow-visible sm:overflow-y-auto sm:h-[180px] h-[140px] overflow-y-auto">
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
                    <div className="space-y-3">
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
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
              {viewTask.status === "In-Progress" && canCompleteTasks && (
                <button
                  onClick={() => void handleUpdateStatus(viewTask.id, "Completed", updateNotes)}
                  disabled={isUpdating !== null}
                  className="w-full sm:flex-1 rounded-xl bg-emerald-600 enabled:hover:bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all flex items-center justify-center gap-2 animate-bounce-short cursor-pointer disabled:cursor-not-allowed"
                >
                  {isUpdating === viewTask.id ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Complete Task
                </button>
              )}
              <button
                onClick={() => setViewTask(null)}
                className={`w-full sm:w-auto rounded-xl bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all text-center cursor-pointer ${
                  viewTask.status === "In-Progress" && canCompleteTasks ? "sm:max-w-[120px]" : ""
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maximized Activity Timeline Modal (Desktop Only) */}
      {viewTask && showTimelineModal && (
        <div className="fixed inset-0 z-[60] hidden sm:flex items-center justify-center px-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300" onClick={() => setShowTimelineModal(false)} />
          <div className="relative z-10 w-full sm:max-w-3xl bg-white p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 sm:rounded-2xl max-h-[85vh]">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-mono text-slate-400">{viewTask.taskId}</span>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  Activity Timeline: {viewTask.title}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Full audit log of task updates and comments</p>
              </div>
              <button 
                onClick={() => setShowTimelineModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer p-1"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 py-2 min-h-0 max-h-[55vh] scrollbar-thin">
              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                  <p className="text-sm font-medium">Fetching complete task updates...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <p className="text-sm font-semibold">No timeline events logged yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((entry) => (
                    <div key={entry.id} className="relative pl-6 border-l-2 border-blue-100 ml-3 py-1">
                      <span className="absolute -left-[7px] top-3 h-3.5 w-3.5 rounded-full bg-blue-600 ring-4 ring-white shadow-sm" />
                      <div className="flex flex-col gap-1.5 rounded-xl border border-slate-100 bg-white p-4 shadow-sm text-sm hover:border-slate-200 transition-colors">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="font-bold text-blue-600 uppercase tracking-wider text-[11px] bg-blue-50 px-2 py-0.5 rounded">
                            {entry.eventType}
                          </span>
                          <span className="text-xs font-semibold text-slate-400">
                            {formatTimelineDate(entry.timeStamp)} • By {entry.changedBy}
                          </span>
                        </div>
                        <div className="text-slate-700 mt-1 leading-relaxed">
                          {getHistoryDescription(entry)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowTimelineModal(false)}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all text-center cursor-pointer min-w-[100px]"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

