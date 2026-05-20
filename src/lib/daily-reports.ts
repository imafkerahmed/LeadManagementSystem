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

  // Count leads by status per counselor for today's activity
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

  leads.forEach((lead) => {
    if (lead.assignedTo) {
      activeCounselorIds.add(lead.assignedTo);

      // Count as new lead
      newLeadsByCounselor.set(
        lead.assignedTo,
        (newLeadsByCounselor.get(lead.assignedTo) || 0) + 1,
      );

      // Initialize status counts for this counselor if not exists
      if (!statusCountsByCounselor.has(lead.assignedTo)) {
        statusCountsByCounselor.set(lead.assignedTo, {
          New: 0,
          Contacted: 0,
          "Follow-Up": 0,
          Registered: 0,
          Lost: 0,
        });
      }

      // Increment count for this lead's current status
      const status = (lead.status || "New") as string;
      const counts = statusCountsByCounselor.get(lead.assignedTo)!;
      if (status in counts) {
        counts[status as keyof typeof counts]++;
      }
    }
  });

  // Count all "New" status leads across the full dataset when available
  const globalNewStatusByCounselor = new Map<string, number>();
  const leadsForGlobalStatus = allLeadsForOverdue || leads;

  leadsForGlobalStatus.forEach((lead) => {
    if (lead.assignedTo && (lead.status || "New") === "New") {
      globalNewStatusByCounselor.set(
        lead.assignedTo,
        (globalNewStatusByCounselor.get(lead.assignedTo) || 0) + 1,
      );
    }
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

    const conversionRate =
      newLeads > 0 ? (statusCounts.Registered / newLeads) * 100 : 0;

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
      conversionRate: Math.round(conversionRate * 100) / 100, // Round to 2 decimal places
      hoursTracked: 0, // Placeholder for future enhancement
    });
  });

  // Return sorted by counselor name
  return Array.from(metricsMap.values()).sort((a, b) =>
    a.counselorName.localeCompare(b.counselorName),
  );
}
