// User roles
export type UserRole = "super-admin" | "admin" | "student-counsellor";

// User model
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created: string;
  updated: string;
}

// Task model
export type TaskStatus = "Pending" | "In-Progress" | "Completed" | "Cancelled";
export type TaskPriority = "Low" | "Medium" | "High";

export interface Task {
  id: string;
  taskId: string; // custom generated task ID e.g. AMZ/TASK/0001
  title: string;
  description?: string;
  assignedTo: string; // user ID
  assignedToName?: string; // user name resolved in frontend
  dueDate?: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdBy?: string;
  created: string;
  updated: string;
  notes?: string;
}

// Lead status types
export type LeadStatus =
  | "New"
  | "Ringing-No-Answer"
  | "Contacted"
  | "Follow-Up"
  | "Follow-up"
  | "Registered"
  | "Lost";

// Lead model
export interface Lead {
  id: string;
  leadId: string; // e.g., AMZ/LEAD/0001
  studentName: string;
  mobile: string;
  email?: string;
  course: string;
  leadSource: string;
  leadSourceDetail?: string;
  status: LeadStatus;
  assignedTo: string; // counselor name or ID
  comments: string;
  created: string;
  updated: string;
  lastModified: string;
}

// Comment entry in comment log
export interface CommentEntry {
  date: string;
  author: string;
  status: LeadStatus;
  text: string;
}

// Lead history (audit trail)
export interface LeadHistory {
  id: string;
  timeStamp?: string;
  leadId: string;
  studentName: string;
  eventType: string; // "Status Change", "Comment", "Reassign", "Created"
  changedBy: string;
  oldValue?: string;
  newValue?: string;
  comment?: string;
  created: string;
}

// Dashboard stats
export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  followUpLeads: number;
  registeredLeads: number;
  lostLeads: number;
  counselorStats: Array<{
    name: string;
    leadCount: number;
    newCount: number;
    contactedCount: number;
  }>;
  recentActivity: LeadHistory[];
}

// Counselor data
export interface Counselor {
  id: string;
  name: string;
  email: string;
  leadCount: number;
}

// Filter params
export interface LeadFilterParams {
  status?: LeadStatus;
  assignedTo?: string;
  courseFilter?: string;
  searchTerm?: string;
  page?: number;
  limit?: number;
}

// Bulk upload lead
export interface BulkUploadLead {
  studentName: string;
  mobile: string;
  email?: string;
  course: string;
  leadSource: string;
  leadSourceDetail?: string;
}

// Bulk upload result
export interface BulkUploadResult {
  success: boolean;
  uploaded: number;
  failed: number;
  message: string;
  errors?: Array<{ row: number; message: string }>;
}

// Daily report metrics per counselor
export interface DailyReportMetrics {
  counselorId: string;
  counselorName: string;
  newLeads: number;
  statusNew: number;
  statusRingingNoAnswer: number;
  statusContacted: number;
  statusFollowUp: number;
  statusRegistered: number;
  statusLost: number;
  overdueFollowups: number;
  hoursTracked: number;
}

// Daily report response
export interface DailyReportResponse {
  date: string;
  reports: DailyReportMetrics[];
}
