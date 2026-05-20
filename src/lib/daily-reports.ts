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
  allLeadsForOverdue?: LeadRecord[],
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
  const lookupSource = allLeadsForOverdue || leads;
  lookupSource.forEach((l) => {
    if (l.id) leadLookup.set(l.id, l);
  });

  // Active counselors and counts
  const activeCounselorIds = new Set<string>();
  const newLeadsByCounselor = new Map<string, number>();

  // Status sets to ensure unique lead counting per status per counselor
  const statusSetsByCounselor = new Map<string, Map<string, Set<string>>>();

  // New-present and converted-away sets per counselor
  const newPresentByCounselor = new Map<string, Set<string>>();
  const convertedAwayByCounselor = new Map<string, Set<string>>();

  // Count leads created today per counselor (newLeads)
  leads.forEach((lead) => {
    if (!lead.assignedTo) return;
    activeCounselorIds.add(lead.assignedTo);
    newLeadsByCounselor.set(
      lead.assignedTo,
      (newLeadsByCounselor.get(lead.assignedTo) || 0) + 1,
    );

    // If created today and status is New, include in newPresent
    if (lead.id && normalizeStatus(lead.status || "") === "New") {
      if (!newPresentByCounselor.has(lead.assignedTo))
        newPresentByCounselor.set(lead.assignedTo, new Set());
      newPresentByCounselor.get(lead.assignedTo)!.add(lead.id);
    }
  });

  // Process history entries for the day
  history.forEach((h) => {
    if (!h || h.eventType !== "Status Change") return;
    const leadId = h.leadId;
    if (!leadId) return;

    const newStatus = normalizeStatus(h.newValue || "");
    const oldStatus = normalizeStatus(h.oldValue || "");

    // counselor resolution: prefer assignedTo from lead, fallback to changedBy
    let counselorId: string | undefined;
    const lead = leadLookup.get(leadId);
    if (lead && lead.assignedTo) counselorId = lead.assignedTo;
    if (!counselorId && h.changedBy) counselorId = h.changedBy;
    if (!counselorId) return;

    activeCounselorIds.add(counselorId);

    if (!statusSetsByCounselor.has(counselorId))
      statusSetsByCounselor.set(counselorId, new Map());
    const cMap = statusSetsByCounselor.get(counselorId)!;

    const tracked = [
      "New",
      "Ringing-No-Answer",
      "Contacted",
      "Follow-Up",
      "Registered",
      "Lost",
    ];
    if (tracked.includes(newStatus)) {
      if (!cMap.has(newStatus)) cMap.set(newStatus, new Set());
      cMap.get(newStatus)!.add(leadId);
    }

    // Track conversions away from New
    if (oldStatus === "New" && newStatus !== "New") {
      if (!convertedAwayByCounselor.has(counselorId))
        convertedAwayByCounselor.set(counselorId, new Set());
      convertedAwayByCounselor.get(counselorId)!.add(leadId);
    }

    // Track leads moved to New during the day
    if (newStatus === "New") {
      if (!newPresentByCounselor.has(counselorId))
        newPresentByCounselor.set(counselorId, new Set());
      newPresentByCounselor.get(counselorId)!.add(leadId);
    }
  });

  // Overdue follow-ups
  const overdueFollowupsByCounselor = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const leadsForOverdueCalc = allLeadsForOverdue || leads;
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
      if (!allLeadsForOverdue) activeCounselorIds.add(lead.assignedTo!);
      overdueFollowupsByCounselor.set(
        lead.assignedTo,
        (overdueFollowupsByCounselor.get(lead.assignedTo) || 0) + overdueCount,
      );
    }
  });

  // Build list of counselors to report on
  const allRelevantCounselors = new Set<string>(activeCounselorIds);
  statusSetsByCounselor.forEach((_, cid) => allRelevantCounselors.add(cid));
  newPresentByCounselor.forEach((_, cid) => allRelevantCounselors.add(cid));
  convertedAwayByCounselor.forEach((_, cid) => allRelevantCounselors.add(cid));
  overdueFollowupsByCounselor.forEach((_, cid) =>
    allRelevantCounselors.add(cid),
  );

  allRelevantCounselors.forEach((counselorId) => {
    const counselor = counselors.find((c) => c.id === counselorId);
    const newLeads = newLeadsByCounselor.get(counselorId) || 0;

    const newPresentSet =
      newPresentByCounselor.get(counselorId) || new Set<string>();
    const convertedSet =
      convertedAwayByCounselor.get(counselorId) || new Set<string>();
    const statusNew = Math.max(
      0,
      newPresentSet.size -
        Array.from(newPresentSet).filter((id) => convertedSet.has(id)).length,
    );

    const cMap = statusSetsByCounselor.get(counselorId) || new Map();
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
