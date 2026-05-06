import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateLeadId(lastNum: number): string {
  return `AMZ/LEAD/${String(lastNum + 1).padStart(4, "0")}`;
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "New":
      return "bg-blue-100 text-blue-800";
    case "Contacted":
      return "bg-yellow-100 text-yellow-800";
    case "Follow-up":
      return "bg-orange-100 text-orange-800";
    case "Registered":
      return "bg-green-100 text-green-800";
    case "Lost":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function getStatusBgColor(status: string): string {
  switch (status) {
    case "New":
      return "bg-blue-50";
    case "Contacted":
      return "bg-yellow-50";
    case "Follow-up":
      return "bg-orange-50";
    case "Registered":
      return "bg-green-50";
    case "Lost":
      return "bg-red-50";
    default:
      return "bg-gray-50";
  }
}
