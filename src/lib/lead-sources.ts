export const LEAD_SOURCE_OPTIONS = [
  { value: "Direct", label: "Direct" },
  { value: "Referral", label: "Referral" },
  { value: "Facebook", label: "Facebook" },
  { value: "Instagram", label: "Instagram" },
  { value: "TikTok", label: "TikTok" },
  { value: "YouTube", label: "YouTube" },
  { value: "WhatsApp", label: "WhatsApp" },
  { value: "LinkedIn", label: "LinkedIn" },
  { value: "X", label: "X (Twitter)" },
  { value: "Threads", label: "Threads" },
  { value: "Snapchat", label: "Snapchat" },
  { value: "Telegram", label: "Telegram" },
  { value: "Pinterest", label: "Pinterest" },
  { value: "Reddit", label: "Reddit" },
  { value: "Discord", label: "Discord" },
  { value: "Website", label: "Website" },
  { value: "Walk-in", label: "Walk-in" },
  { value: "Email", label: "Email" },
  { value: "Other", label: "Other" },
] as const;

export const LEAD_SOURCE_DETAIL_REQUIRED = new Set(["Referral", "Other"]);

export function shouldShowLeadSourceDetail(source: string) {
  return LEAD_SOURCE_DETAIL_REQUIRED.has(source);
}

export function composeLeadSource(source: string, detail: string) {
  const trimmedSource = source.trim();
  const trimmedDetail = detail.trim();

  if (!trimmedSource) return trimmedDetail;
  if (!trimmedDetail || !shouldShowLeadSourceDetail(trimmedSource)) {
    return trimmedSource;
  }

  return `${trimmedSource} - ${trimmedDetail}`;
}

export function parseLeadSource(value: string) {
  const trimmedValue = value.trim();

  for (const option of LEAD_SOURCE_OPTIONS) {
    const exact = option.value;
    const dashPrefix = `${exact} - `;
    const colonPrefix = `${exact}: `;

    if (trimmedValue === exact) {
      return { source: exact, detail: "" };
    }

    if (trimmedValue.startsWith(dashPrefix)) {
      return { source: exact, detail: trimmedValue.slice(dashPrefix.length) };
    }

    if (trimmedValue.startsWith(colonPrefix)) {
      return { source: exact, detail: trimmedValue.slice(colonPrefix.length) };
    }
  }

  return { source: trimmedValue, detail: "" };
}

export function getLeadSourceDetailLabel(source: string) {
  return source === "Referral"
    ? "Referred by / details"
    : "Lead source details";
}
