import { DailyReportMetrics } from "@/types";

type LeadRecord = {
  id: string;
  studentName?: string;
  status?: string;
  assignedTo?: string;
  created?: string;
  updated?: string;
  followup1Date?: string;
  followup1Completed?: boolean;
  followup2Date?: string;
  followup2Completed?: boolean;
  followup3Date?: string;
  followup3Completed?: boolean;
};

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
};

type HistoryRecord = {
  id?: string;
  eventType?: string;
  leadId?: string;
  changedBy?: string;
  oldValue?: string;
  newValue?: string;
  created?: string;
};

/**
 * Format a date to start of day (matches Reports endpoint pattern)
 */
export function getStartOfDay(date: Date): string {
  const startDay = new Date(date);
  startDay.setHours(0, 0, 0, 0);
  return startDay.toISOString();
}

/**
 * Format a date to end of day (matches Reports endpoint pattern)
 */
export function getEndOfDay(date: Date): string {
  const endDay = new Date(date);
  endDay.setHours(23, 59, 59, 999);
  return endDay.toISOString();
}

/**
 * Aggregate daily report metrics for all counselors
 * @param leads - Leads created on the selected date (for daily metrics)
 * @param history - History records for the selected date
 * @param counselors - All counselors
 * @param allLeadsForOverdue - All leads in system (for global New status and overdue calculations). If provided, those counts reflect all leads, not just today's
 */
export function aggregateDailyMetrics(
  leads: LeadRecord[],
  history: HistoryRecord[],
  counselors: UserRecord[],
  allLeadsForOverdue?: LeadRecord[],
): DailyReportMetrics[] {
  // Map to store metrics by counselor ID
  const metricsMap = new Map<string, DailyReportMetrics>();

  // Initialize metrics for all counselors (only those who have activity today)
  const activeCounselorIds = new Set<string>();

  // Count new leads per counselor
  const newLeadsByCounselor = new Map<string, number>();

  // Count leads by status per counselor across the dataset (for current status distribution)
  const statusCountsByCounselor = new Map<
    string,
    {
      New: number;
      Contacted: number;
      "Follow-Up": number;
      Registered: number;
      Lost: number;
    }
  >();

  // Helper to normalize various status strings into the canonical keys used across the app
  const normalizeStatus = (value?: string) => {
    const v = (value || "").trim().toLowerCase();
    if (v === "followup" || v === "follow-up" || v === "follow\-up")
      return "Follow-Up";
    if (v === "new") return "New";
    if (v === "contacted") return "Contacted";
    if (v === "registered") return "Registered";
    if (v === "lost") return "Lost";
    return (value || "").trim();
  };

  leads.forEach((lead) => {
    if (lead.assignedTo) {
      activeCounselorIds.add(lead.assignedTo);

      // Count as new lead
      newLeadsByCounselor.set(
        lead.assignedTo,
        (newLeadsByCounselor.get(lead.assignedTo) || 0) + 1,
      );

      // (old logic counted statuses only for today's leads) --- keep newLeads count above
    }
  });

  // Find target date's end of day.
  let endOfTargetDay = new Date().toISOString();
  if (leads.length > 0 && leads[0].created) {
    endOfTargetDay = getEndOfDay(new Date(leads[0].created));
  } else if (history.length > 0 && history[0].created) {
    endOfTargetDay = getEndOfDay(new Date(history[0].created));
  }

  // Count current New leads across the full dataset so the New column shows all
  // leads that are still in New status, regardless of when they were created,
  // but only if they were present on (created on or before) the target day.
  // If they were subsequently converted to a different status, they are deducted (not counted in New).
  const globalNewStatusByCounselor = new Map<string, number>();
  const leadLookup = new Map<string, LeadRecord>();
  const leadsToIndex = allLeadsForOverdue || leads;
  leadsToIndex.forEach((l) => {
    if (l.id) leadLookup.set(l.id, l);
    if (
      l.assignedTo &&
      normalizeStatus(l.status || "New") === "New" &&
      l.created &&
      l.created <= endOfTargetDay
    ) {
      globalNewStatusByCounselor.set(
        l.assignedTo,
        (globalNewStatusByCounselor.get(l.assignedTo) || 0) + 1,
      );
      activeCounselorIds.add(l.assignedTo);
    }
  });

  // Initialize counters for any counselor we encounter via history
  history.forEach((h) => {
    if (!h || h.eventType !== "Status Change") return;
    const newStatus = normalizeStatus(h.newValue || "");
    if (
      !["New", "Contacted", "Follow-Up", "Registered", "Lost"].includes(
        newStatus,
      )
    ) {
      return;
    }

    // Determine counselor: prefer the lead's assignedTo, fallback to changedBy
    let counselorId: string | undefined;
    if (h.leadId) {
      const lead = leadLookup.get(h.leadId);
      if (lead && lead.assignedTo) counselorId = lead.assignedTo;
    }
    if (!counselorId && h.changedBy) counselorId = h.changedBy;
    if (!counselorId) return;

    if (!statusCountsByCounselor.has(counselorId)) {
      statusCountsByCounselor.set(counselorId, {
        New: 0,
        Contacted: 0,
        "Follow-Up": 0,
        Registered: 0,
        Lost: 0,
      });
    }

    const counts = statusCountsByCounselor.get(counselorId)!;
    if (newStatus in counts) counts[newStatus as keyof typeof counts]++;

    // Mark counselor as active for report inclusion
    activeCounselorIds.add(counselorId);
  });

  // Count overdue follow-ups (dates in past and not completed)
  // Use allLeadsForOverdue if provided, otherwise use today's leads
  const overdueFollowupsByCounselor = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const leadsForOverdueCalculation = allLeadsForOverdue || leads;

  leadsForOverdueCalculation.forEach((lead) => {
    if (lead.assignedTo) {
      let overdueCount = 0;
      const followups = [
        { date: lead.followup1Date, completed: lead.followup1Completed },
        { date: lead.followup2Date, completed: lead.followup2Completed },
        { date: lead.followup3Date, completed: lead.followup3Completed },
      ];
      followups.forEach((fu) => {
        if (fu.date && !fu.completed) {
          try {
            const fuDate = new Date(fu.date);
            fuDate.setHours(0, 0, 0, 0);
            if (fuDate < today) overdueCount++;
          } catch {
            // ignore invalid dates
          }
        }
      });
      if (overdueCount > 0) {
        // Only add to activeCounselorIds if this is from today's leads
        // (not inflating active counselors with ones who only have overdue follow-ups)
        if (!allLeadsForOverdue) {
          activeCounselorIds.add(lead.assignedTo);
        }
        overdueFollowupsByCounselor.set(
          lead.assignedTo,
          (overdueFollowupsByCounselor.get(lead.assignedTo) || 0) +
            overdueCount,
        );
      }
    }
  });

  // Build metrics for each counselor with activity today or overdue follow-ups
  // Start with active counselors from today's activity
  const allRelevantCounselors = new Set(activeCounselorIds);
  // Add counselors who have a New-status lead anywhere in the dataset
  globalNewStatusByCounselor.forEach((_, counselorId) => {
    allRelevantCounselors.add(counselorId);
  });
  // Add counselors who have overdue follow-ups
  overdueFollowupsByCounselor.forEach((_, counselorId) => {
    allRelevantCounselors.add(counselorId);
  });

  allRelevantCounselors.forEach((counselorId) => {
    const counselor = counselors.find((c) => c.id === counselorId);
    const newLeads = newLeadsByCounselor.get(counselorId) || 0;
    const statusNew = globalNewStatusByCounselor.get(counselorId) || 0;
    const statusCounts = statusCountsByCounselor.get(counselorId) || {
      New: 0,
      Contacted: 0,
      "Follow-Up": 0,
      Registered: 0,
      Lost: 0,
    };
    const followups = overdueFollowupsByCounselor.get(counselorId) || 0;

    metricsMap.set(counselorId, {
      counselorId,
      counselorName: counselor?.name || counselor?.email || "Unknown",
      newLeads,
      statusNew,
      statusContacted: statusCounts.Contacted,
      statusFollowUp: statusCounts["Follow-Up"],
      statusRegistered: statusCounts.Registered,
      statusLost: statusCounts.Lost,
      overdueFollowups: followups,
      hoursTracked: 0, // Placeholder for future enhancement
    });
  });

  // Return sorted by counselor name
  return Array.from(metricsMap.values()).sort((a, b) =>
    a.counselorName.localeCompare(b.counselorName),
  );
}
