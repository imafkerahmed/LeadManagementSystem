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

export function getStartOfDay(date: Date): string {
  const startDay = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  return startDay.toISOString();
}

export function getEndOfDay(date: Date): string {
  const endDay = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  return endDay.toISOString();
}

export function aggregateDailyMetrics(
  leads: LeadRecord[],
  history: HistoryRecord[],
  counselors: UserRecord[],
  allLeads?: LeadRecord[],
  updatedTodayLeads?: LeadRecord[],
): DailyReportMetrics[] {
  const metricsMap = new Map<string, DailyReportMetrics>();

  // Helpers
  const normalizeStatus = (value?: string) => {
    const v = (value || "").trim().toLowerCase();
    if (
      v === "ringing-no-answer" ||
      v === "ringing no answer" ||
      v === "ringing_no_answer"
    )
      return "Ringing-No-Answer";
    if (v === "followup" || v === "follow-up" || v === "follow\-up")
      return "Follow-Up";
    if (v === "new") return "New";
    if (v === "contacted") return "Contacted";
    if (v === "registered") return "Registered";
    if (v === "lost") return "Lost";
    return (value || "").trim();
  };

  // Build lookup of leads
  const leadLookup = new Map<string, LeadRecord>();
  const lookupSource = allLeads || leads;
  lookupSource.forEach((l) => {
    if (l.id) leadLookup.set(l.id, l);
  });

  // Active counselors and counts
  const activeCounselorIds = new Set<string>();
  const newLeadsByCounselor = new Map<string, number>();
  const currentNewByCounselor = new Map<string, Set<string>>();
  const updatedStatusByCounselor = new Map<string, Map<string, Set<string>>>();

  const trackedStatuses = [
    "Ringing-No-Answer",
    "Contacted",
    "Follow-Up",
    "Registered",
    "Lost",
  ];

  // Count leads created today per counselor (newLeads)
  leads.forEach((lead) => {
    if (!lead.assignedTo) return;
    activeCounselorIds.add(lead.assignedTo);
    newLeadsByCounselor.set(
      lead.assignedTo,
      (newLeadsByCounselor.get(lead.assignedTo) || 0) + 1,
    );
  });

  // Process history entries for the day
  history.forEach((h) => {
    if (!h || h.eventType !== "Status Change") return;
    const leadId = h.leadId;
    if (!leadId) return;

    // Attribute the day activity to the counselor account that made the update.
    let counselorId: string | undefined;
    const lead = leadLookup.get(leadId);
    if (h.changedBy) counselorId = h.changedBy;
    if (!counselorId && lead?.assignedTo) counselorId = lead.assignedTo;
    if (!counselorId) return;

    activeCounselorIds.add(counselorId);
  });

  // Count only leads updated on the selected day for day-only status columns.
  const updatedSource = updatedTodayLeads || leads;
  updatedSource.forEach((lead) => {
    if (!lead.id || !lead.assignedTo) return;

    const currentStatus = normalizeStatus(lead.status || "");
    if (!trackedStatuses.includes(currentStatus)) return;

    activeCounselorIds.add(lead.assignedTo);

    if (!updatedStatusByCounselor.has(lead.assignedTo)) {
      updatedStatusByCounselor.set(lead.assignedTo, new Map());
    }
    const cMap = updatedStatusByCounselor.get(lead.assignedTo)!;
    if (!cMap.has(currentStatus)) cMap.set(currentStatus, new Set());
    cMap.get(currentStatus)!.add(lead.id);
  });

  // Reconcile current New status from the full lead set.
  lookupSource.forEach((lead) => {
    if (!lead.id || !lead.assignedTo) return;

    const currentStatus = normalizeStatus(lead.status || "");
    if (currentStatus !== "New") return;

    activeCounselorIds.add(lead.assignedTo);
    if (!currentNewByCounselor.has(lead.assignedTo)) {
      currentNewByCounselor.set(lead.assignedTo, new Set());
    }
    currentNewByCounselor.get(lead.assignedTo)!.add(lead.id);
  });

  // Overdue follow-ups
  const overdueFollowupsByCounselor = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const leadsForOverdueCalc = allLeads || leads;
  leadsForOverdueCalc.forEach((lead) => {
    if (!lead.assignedTo) return;
    let overdueCount = 0;
    const followups = [
      {
        date: (lead as LeadRecord).followup1Date,
        completed: (lead as LeadRecord).followup1Completed,
      },
      {
        date: (lead as LeadRecord).followup2Date,
        completed: (lead as LeadRecord).followup2Completed,
      },
      {
        date: (lead as LeadRecord).followup3Date,
        completed: (lead as LeadRecord).followup3Completed,
      },
    ];
    followups.forEach((fu) => {
      if (fu.date && !fu.completed) {
        try {
          const fuDate = new Date(fu.date);
          fuDate.setHours(0, 0, 0, 0);
          if (fuDate < today) overdueCount++;
        } catch {
          // ignore
        }
      }
    });
    if (overdueCount > 0) {
      if (!allLeads) activeCounselorIds.add(lead.assignedTo!);
      overdueFollowupsByCounselor.set(
        lead.assignedTo,
        (overdueFollowupsByCounselor.get(lead.assignedTo) || 0) + overdueCount,
      );
    }
  });

  // Build list of counselors to report on
  const allRelevantCounselors = new Set<string>(activeCounselorIds);
  updatedStatusByCounselor.forEach((_, cid) => allRelevantCounselors.add(cid));
  currentNewByCounselor.forEach((_, cid) => allRelevantCounselors.add(cid));
  overdueFollowupsByCounselor.forEach((_, cid) =>
    allRelevantCounselors.add(cid),
  );

  allRelevantCounselors.forEach((counselorId) => {
    const counselor = counselors.find((c) => c.id === counselorId);
    const newLeads = newLeadsByCounselor.get(counselorId) || 0;

    const cMap = updatedStatusByCounselor.get(counselorId) || new Map();
    const statusNew = currentNewByCounselor.get(counselorId)?.size || 0;
    const statusRingingNoAnswer = cMap.get("Ringing-No-Answer")?.size || 0;
    const statusContacted = cMap.get("Contacted")?.size || 0;
    const statusFollowUp = cMap.get("Follow-Up")?.size || 0;
    const statusRegistered = cMap.get("Registered")?.size || 0;
    const statusLost = cMap.get("Lost")?.size || 0;

    const followups = overdueFollowupsByCounselor.get(counselorId) || 0;

    metricsMap.set(counselorId, {
      counselorId,
      counselorName: counselor?.name || counselor?.email || "Unknown",
      newLeads,
      statusNew,
      statusRingingNoAnswer,
      statusContacted,
      statusFollowUp,
      statusRegistered,
      statusLost,
      overdueFollowups: followups,
      hoursTracked: 0,
    });
  });

  return Array.from(metricsMap.values()).sort((a, b) =>
    a.counselorName.localeCompare(b.counselorName),
  );
}
