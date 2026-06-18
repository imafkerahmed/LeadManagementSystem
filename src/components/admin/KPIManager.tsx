"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { 
  Award, 
  Trash2, 
  Plus, 
  Search, 
  Trophy, 
  Filter, 
  User, 
  TrendingUp, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import { createPocketBaseClient } from "@/lib/pocketbase";

interface Counselor {
  id: string;
  name: string;
  email: string;
}

interface KPILog {
  id: string;
  staffId: string;
  staffName: string;
  points: number;
  category: string;
  comments: string;
  date: string;
  awardedBy: string;
  awardedByName: string;
}

interface LeaderboardItem {
  id: string;
  name: string;
  email: string;
  totalPoints: number;
  entryCount: number;
}

const CATEGORIES = [
  "Target Achievement",
  "Punctuality",
  "Communication Quality",
  "Teamwork",
  "General adjustment"
];

export default function AdminKPIManager() {
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [logs, setLogs] = useState<KPILog[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [pointsInput, setPointsInput] = useState("50");
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [commentText, setCommentText] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter State
  const [filterStaffId, setFilterStaffId] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch initial data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const pb = createPocketBaseClient();
      const token = pb.authStore.token;
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

      // 1. Fetch lookup counselors
      const resUsers = await fetch("/api/users/lookup", { headers });
      if (!resUsers.ok) throw new Error("Failed to load staff list");
      const userList = await resUsers.json();
      
      // Filter only counselors role (they have this in staff portal)
      setCounselors(userList);

      // 2. Fetch KPI logs
      const resKPI = await fetch("/api/admin/kpi", { headers });
      if (!resKPI.ok) throw new Error("Failed to load KPI transactions");
      const kpiData = await resKPI.json();
      setLogs(kpiData);

      // 3. Compute Leaderboard
      const pointsMap: Record<string, LeaderboardItem> = {};
      userList.forEach((u: Counselor) => {
        pointsMap[u.id] = {
          id: u.id,
          name: u.name || u.email,
          email: u.email,
          totalPoints: 0,
          entryCount: 0,
        };
      });

      kpiData.forEach((log: KPILog) => {
        if (pointsMap[log.staffId]) {
          pointsMap[log.staffId].totalPoints += log.points;
          pointsMap[log.staffId].entryCount += 1;
        } else {
          // Fallback if counselor is missing from userList
          pointsMap[log.staffId] = {
            id: log.staffId,
            name: log.staffName,
            email: "",
            totalPoints: log.points,
            entryCount: 1,
          };
        }
      });

      const sortedLeaderboard = Object.values(pointsMap).sort(
        (a, b) => b.totalPoints - a.totalPoints
      );
      setLeaderboard(sortedLeaderboard);

    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to sync KPI manager dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAwardPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId) {
      toast.error("Please select a counselor");
      return;
    }

    const points = parseInt(pointsInput, 10);
    if (isNaN(points) || points < -500 || points > 500) {
      toast.error("Points must be an integer between -500 and +500");
      return;
    }

    setIsSubmitting(true);
    try {
      const pb = createPocketBaseClient();
      const token = pb.authStore.token;

      const res = await fetch("/api/admin/kpi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          staffId: selectedStaffId,
          points,
          category: selectedCategory,
          comments: commentText,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to award points");
      }

      toast.success("Points allocated successfully!");
      setIsModalOpen(false);
      
      // Reset form
      setSelectedStaffId("");
      setPointsInput("50");
      setSelectedCategory(CATEGORIES[0]);
      setCommentText("");

      // Refresh data
      await fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm("Are you sure you want to retract/delete this point allocation entry? This will modify the counselor's total score.")) {
      return;
    }

    try {
      const pb = createPocketBaseClient();
      const token = pb.authStore.token;

      const res = await fetch(`/api/admin/kpi?id=${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete point entry");
      }

      toast.success("Point allocation retracted successfully");
      await fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Filter & Search Logic
  const filteredLogs = logs.filter((log) => {
    const matchesStaff = filterStaffId === "all" || log.staffId === filterStaffId;
    const matchesCategory = filterCategory === "all" || log.category === filterCategory;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      query === "" || 
      log.staffName.toLowerCase().includes(query) || 
      log.comments.toLowerCase().includes(query) ||
      log.awardedByName.toLowerCase().includes(query);
    
    return matchesStaff && matchesCategory && matchesSearch;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstItem, indexOfLastItem);

  const formatLocalDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        <p className="text-sm text-slate-400 font-semibold">Loading KPI analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      {/* Header Cards / Stats summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-100/80 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total Points Awarded</span>
            <span className="text-2xl font-extrabold text-slate-800 mt-1 block">
              {logs.reduce((acc, log) => acc + log.points, 0)} pts
            </span>
          </div>
          <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl">
            <Award className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-100/80 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Top Performing Counselor</span>
            <span className="text-md font-bold text-slate-800 mt-1 block truncate max-w-[200px]">
              {leaderboard[0] ? `${leaderboard[0].name} (${leaderboard[0].totalPoints} pts)` : "None"}
            </span>
          </div>
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
            <Trophy className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-100/80 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total Log Entries</span>
            <span className="text-2xl font-extrabold text-slate-800 mt-1 block">
              {logs.length} entries
            </span>
          </div>
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Main section split: Leaderboard (Left) & Award Points action (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* LEADERBOARD CARD */}
        <div className="bg-white border border-slate-100/80 rounded-2xl p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Counselor Performance Leaderboard</h3>
              <p className="text-xs text-slate-400 mt-0.5">Overall standings based on approved KPI points</p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              Award Points
            </button>
          </div>

          <div className="space-y-3.5">
            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">No active staff members found.</div>
            ) : (
              leaderboard.map((item, index) => {
                let badgeStyle = "bg-slate-50 text-slate-500 border-slate-200/50";
                if (index === 0) badgeStyle = "bg-amber-50 text-amber-600 border-amber-200 shadow-sm";
                else if (index === 1) badgeStyle = "bg-slate-100 text-slate-600 border-slate-300 shadow-sm";
                else if (index === 2) badgeStyle = "bg-orange-50 text-orange-700 border-orange-200 shadow-sm";

                return (
                  <div 
                    key={item.id}
                    className="flex items-center justify-between p-3.5 border border-slate-50 hover:border-slate-100 hover:bg-slate-50/50 rounded-xl transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-extrabold text-xs ${badgeStyle}`}>
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{item.name}</h4>
                        <span className="text-[10px] text-slate-400 block">{item.email}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-right">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">Awards</span>
                        <span className="text-xs font-bold text-slate-600">{item.entryCount} entries</span>
                      </div>
                      <div className="min-w-[70px]">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">Score</span>
                        <span className={`text-sm font-black ${item.totalPoints >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {item.totalPoints > 0 ? `+${item.totalPoints}` : item.totalPoints} pts
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* QUICK ACTION INFO CARD */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50" />
          
          <ShieldCheck className="h-8 w-8 text-blue-400 mb-4" />
          <h3 className="text-sm font-bold tracking-wide">Manual KPI Operations</h3>
          <p className="text-xs text-indigo-200/80 mt-1.5 leading-relaxed">
            Use this panel to adjust points manually. Points awarded are reflected immediately on the counselor scoreboard and their personal dashboards.
          </p>

          <div className="mt-6 space-y-3 text-[11px] text-indigo-100/90 border-t border-indigo-900/60 pt-4">
            <div className="flex gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 shrink-0" />
              <span>Negative entries deduct from total standings (e.g. deductions).</span>
            </div>
            <div className="flex gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 shrink-0" />
              <span>Transactions are fully logged and can be retracted by deletion.</span>
            </div>
            <div className="flex gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 shrink-0" />
              <span>Entries are completely private between Admins and the specific Staff member.</span>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER & LEDGER LOG LIST */}
      <div className="bg-white border border-slate-100/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-4 mb-4 gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Point Allocation Ledger</h3>
            <p className="text-xs text-slate-400 mt-0.5">Historical list of manual adjustments</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-all w-[180px]"
              />
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            </div>

            {/* Filter Counselor */}
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={filterStaffId}
                onChange={(e) => {
                  setFilterStaffId(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Counselors</option>
                {counselors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.email}</option>
                ))}
              </select>
            </div>

            {/* Filter Category */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={filterCategory}
                onChange={(e) => {
                  setFilterCategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Log table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="pb-3 pt-1">Counselor</th>
                <th className="pb-3 pt-1">Category</th>
                <th className="pb-3 pt-1">Points</th>
                <th className="pb-3 pt-1">Comments / Remarks</th>
                <th className="pb-3 pt-1">Date</th>
                <th className="pb-3 pt-1">Awarded By</th>
                <th className="pb-3 pt-1 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60 text-xs">
              {currentLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    No matching KPI log transactions found.
                  </td>
                </tr>
              ) : (
                currentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/40">
                    <td className="py-3.5 font-bold text-slate-800">{log.staffName}</td>
                    <td className="py-3.5">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-medium text-[10px] tracking-wide">
                        {log.category}
                      </span>
                    </td>
                    <td className="py-3.5 font-extrabold">
                      <span className={log.points >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {log.points > 0 ? `+${log.points}` : log.points}
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-500 italic max-w-xs truncate" title={log.comments}>
                      {log.comments || <span className="text-slate-300 not-italic">No feedback comments</span>}
                    </td>
                    <td className="py-3.5 text-slate-400 font-mono text-[10px]">{formatLocalDate(log.date)}</td>
                    <td className="py-3.5 text-slate-500">{log.awardedByName}</td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => handleDeleteEntry(log.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors inline-flex"
                        title="Delete allocation entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4 text-xs text-slate-500">
            <span>
              Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredLogs.length)} of {filteredLogs.length} entries
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="p-1 border border-slate-200 hover:bg-slate-50 rounded-lg disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg font-semibold">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1 border border-slate-200 hover:bg-slate-50 rounded-lg disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AWARD POINTS MODAL DIALOG */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl w-full max-w-md overflow-hidden relative">
            <div className="bg-slate-950 p-6 text-white">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-400" />
                <h3 className="font-bold text-base">Award KPI Points</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">Manual adjustment scorecard for counselors</p>
            </div>

            <form onSubmit={handleAwardPoints} className="p-6 space-y-4">
              {/* Counselor selection */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Select Counselor
                </label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">-- Choose a counselor --</option>
                  {counselors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || c.email}</option>
                  ))}
                </select>
              </div>

              {/* Point Allocation */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Points Allocation
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={pointsInput}
                    onChange={(e) => setPointsInput(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none font-bold"
                    min={-500}
                    max={500}
                    required
                  />
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPointsInput("50")}
                      className="px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-100"
                    >
                      +50
                    </button>
                    <button
                      type="button"
                      onClick={() => setPointsInput("100")}
                      className="px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-100"
                    >
                      +100
                    </button>
                    <button
                      type="button"
                      onClick={() => setPointsInput("-50")}
                      className="px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold rounded-lg border border-rose-100"
                    >
                      -50
                    </button>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">Supports negative values for score penalties. Range: [-500, 500].</span>
              </div>

              {/* Category */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                  required
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Comments / Remarks */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Comments & Feedback (Optional)
                </label>
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="e.g. Excellent responsiveness on this week's follow-ups"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none h-20 resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-2.5 text-xs font-semibold text-slate-600 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-1/2 rounded-xl bg-blue-600 hover:bg-blue-700 py-2.5 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white inline-block"></span>
                  ) : "Award Points"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
