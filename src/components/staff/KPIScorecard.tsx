"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { 
  Award, 
  Trophy, 
  TrendingUp, 
  Calendar,
  MessageSquare,
  Sparkles,
  Users
} from "lucide-react";
import { createPocketBaseClient } from "@/lib/pocketbase";

interface KPILog {
  id: string;
  points: number;
  category: string;
  comments: string;
  date: string;
  awardedByName: string;
}

interface LeaderboardItem {
  id: string;
  name: string;
  points: number;
}

export default function StaffKPIScorecard() {
  const [history, setHistory] = useState<KPILog[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myTotalPoints, setMyTotalPoints] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchKPIData = async () => {
    setIsLoading(true);
    try {
      const pb = createPocketBaseClient();
      const token = pb.authStore.token;
      
      const res = await fetch("/api/staff/kpi", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error("Failed to load KPI details");
      }

      const data = await res.json();
      setHistory(data.history || []);
      setLeaderboard(data.leaderboard || []);
      setMyRank(data.myRank);
      setMyTotalPoints(data.myTotalPoints || 0);
    } catch (error: any) {
      console.error(error);
      toast.error("Error loading performance scorecard");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKPIData();
  }, []);

  const formatLocalDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        <p className="text-sm text-slate-400 font-semibold">Loading performance scorecard...</p>
      </div>
    );
  }

  // Get current user ID to highlight on leaderboard
  const pb = createPocketBaseClient();
  const currentUserId = pb.authStore.model?.id;

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      
      {/* Visual score display section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Total Points */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100 block">Total Points Earned</span>
              <span className="text-4xl font-black mt-2 block">{myTotalPoints} pts</span>
            </div>
            <div className="p-3 bg-white/10 rounded-xl text-white">
              <Award className="h-6 w-6" />
            </div>
          </div>
          <p className="text-[10px] text-blue-100/80 mt-4 font-medium flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            Keep completing targets to increase your standings!
          </p>
        </div>

        {/* Current Standing Rank */}
        <div className="bg-white border border-slate-100/80 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Leaderboard Standing</span>
            <span className="text-2xl font-extrabold text-slate-800 mt-1 block">
              {myRank ? `Rank #${myRank}` : "Unranked"}
            </span>
          </div>
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
            <Trophy className="h-6 w-6" />
          </div>
        </div>

        {/* Total adjustments log count */}
        <div className="bg-white border border-slate-100/80 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Performance Appraisals</span>
            <span className="text-2xl font-extrabold text-slate-800 mt-1 block">
              {history.length} awards
            </span>
          </div>
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Main split: Ledger evaluations (Left) & Team Leaderboard Standings (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Ledger Evaluations */}
        <div className="bg-white border border-slate-100/80 rounded-2xl p-6 shadow-sm lg:col-span-2 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">My KPI History</h3>
            <p className="text-xs text-slate-400 mt-0.5">Logs of all point adjustments awarded by administrative staff</p>
          </div>

          <div className="space-y-4 pt-2">
            {history.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                No performance points logged yet. Your ratings will appear here when an admin reviews your work.
              </div>
            ) : (
              history.map((log) => (
                <div 
                  key={log.id} 
                  className="flex flex-col sm:flex-row sm:items-start sm:justify-between p-4 border border-slate-100 rounded-xl hover:border-slate-200 hover:bg-slate-50/20 transition-all duration-200 gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-semibold text-[10px] tracking-wide">
                        {log.category}
                      </span>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatLocalDate(log.date)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 flex items-start gap-2 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50">
                      <MessageSquare className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="italic">
                        {log.comments || <span className="text-slate-300 not-italic">No feedback comments provided.</span>}
                      </span>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start shrink-0 min-w-[100px] border-t sm:border-t-0 border-slate-100/60 pt-2 sm:pt-0">
                    <div className={`text-sm font-black flex items-center gap-1 ${log.points >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {log.points > 0 ? `+${log.points}` : log.points} pts
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium sm:mt-1">
                      By {log.awardedByName}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* TEAM STANDINGS COLUMN */}
        <div className="bg-white border border-slate-100/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Team Rankings
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Overall standings this session</p>
          </div>

          <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
            {leaderboard.map((item, index) => {
              const isCurrentUser = item.id === currentUserId;
              
              let rankStyle = "bg-slate-50 text-slate-500 border-slate-200/50";
              if (index === 0) rankStyle = "bg-amber-50 text-amber-600 border-amber-200";
              else if (index === 1) rankStyle = "bg-slate-100 text-slate-600 border-slate-300";
              else if (index === 2) rankStyle = "bg-orange-50 text-orange-700 border-orange-200";

              return (
                <div 
                  key={item.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                    isCurrentUser 
                      ? "border-blue-200 bg-blue-50/50 shadow-sm" 
                      : "border-slate-50 hover:border-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center font-extrabold text-[10px] shrink-0 ${rankStyle}`}>
                      {index + 1}
                    </div>
                    <span className="text-xs font-bold text-slate-700 truncate">
                      {item.name} {isCurrentUser && <span className="text-[9px] text-blue-600 bg-blue-100 px-1 py-0.2 rounded-full font-bold ml-1">You</span>}
                    </span>
                  </div>
                  <span className="text-xs font-extrabold text-slate-600 shrink-0">
                    {item.points} pts
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
