import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(value: unknown, currency = ""): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();
}

export function formatDate(value: unknown): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(String(value)));
  } catch {
    return String(value);
  }
}

/** Map ERPNext / Frappe status-ish values to a badge tone. */
export function statusTone(status: string | undefined): "success" | "warning" | "danger" | "info" | "neutral" {
  const s = (status || "").toLowerCase();
  if (["paid", "completed", "submitted", "delivered", "closed", "active", "enabled", "success", "approved"].includes(s)) return "success";
  if (["pending", "draft", "on hold", "partially paid", "to bill", "to deliver", "open", "in progress"].includes(s)) return "warning";
  if (["overdue", "cancelled", "failed", "rejected", "disabled", "stopped"].includes(s)) return "danger";
  if (["unpaid", "return", "credit note issued"].includes(s)) return "info";
  return "neutral";
}
