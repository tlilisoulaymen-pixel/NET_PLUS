/**
 * Full ERPNext module map + NetPlus custom modules.
 * Every module lists its key DocTypes; the [doctype] list/form routes are generic,
 * so ANY DocType reachable in Frappe works even if it is not listed here.
 * Add your custom DocTypes here — or leave them out and navigate via the search bar.
 */
import type { LucideIcon } from "lucide-react";
import {
  TrendingUp, Users, Boxes, ShoppingBag, Landmark, Factory, FolderKanban,
  UserRoundCheck, MonitorCog, Headphones, BadgeCheck, Globe, ChartNoAxesCombined,
  Settings, Wallet, ShoppingCart, FileText, CreditCard, Truck, ClipboardList,
  ShieldCheck, MapPin, Map,
} from "lucide-react";
import { MapIcon } from "@/components/icons/MapIcon";

export interface ModuleDef {
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon tile tint */
  tint: string;
  /** Key DocTypes, grouped as quick links on the module page */
  doctypes: { name: string; label?: string; href?: string }[];
}

export const MODULES: ModuleDef[] = [
  // ─── NetPlus custom modules (pinned at the top) ───────────────────────────
  {
    slug: "netplus",
    name: "NetPlus",
    icon: ShieldCheck,
    tint: "bg-brand-50 text-brand-600",
    description: "Missions, GPS check-in/out, contrats de service, feedback et scores opérateurs",
    doctypes: [
      { name: "Analytics", label: "Analytics Hub", href: "/desk/analytics" },
      { name: "Mission" },
      { name: "Service Contract", label: "Contrats de service" },
      { name: "Operator Score", label: "Scores opérateurs" },
      { name: "Quality Feedback", label: "Feedback qualité" },
      { name: "Location", label: "Sites géofencés" },
      { name: "NetPlus Settings", label: "Paramètres NetPlus" },
    ],
  },
  {
    slug: "tracking-center",
    name: "Tracking Center",
    icon: MapIcon as unknown as LucideIcon,
    tint: "bg-[#E0F2FE] text-[#0284C7]",
    description: "Superviseurs, opérateurs en temps réel, alertes et feedback",
    doctypes: [
      { name: "Vue d'ensemble", href: "/desk/tracking-center#overview" },
      { name: "Carte temps réel", href: "/desk/tracking-center#map" },
      { name: "Superviseurs", href: "/desk/tracking-center#supervisors" },
      { name: "Retours clients", href: "/desk/tracking-center#feedback" }
    ],
  },
  // ─── Standard ERPNext modules ─────────────────────────────────────────────
  {
    slug: "selling", name: "Sales", icon: TrendingUp, tint: "bg-primary-50 text-primary-500",
    description: "Quotations, sales orders, invoices, and POS",
    doctypes: [
      { name: "Quotation" }, { name: "Sales Order" }, { name: "Sales Invoice" },
      { name: "POS Invoice" }, { name: "Delivery Note" }, { name: "Sales Partner" },
      { name: "Territory" }, { name: "Sales Person" },
    ],
  },
  {
    slug: "crm", name: "CRM", icon: Users, tint: "bg-[#F3E8FF] text-[#8B5CF6]",
    description: "Leads, opportunities, customers, and pipeline",
    doctypes: [
      { name: "Lead" }, { name: "Opportunity" }, { name: "Customer" },
      { name: "Customer Group" }, { name: "Contact" }, { name: "Address" },
      { name: "Prospect" }, { name: "Campaign" },
    ],
  },
  {
    slug: "stock", name: "Inventory", icon: Boxes, tint: "bg-[#E0F2FE] text-[#0284C7]",
    description: "Items, warehouses, stock entries, and serial numbers",
    doctypes: [
      { name: "Item" }, { name: "Item Group" }, { name: "Warehouse" },
      { name: "Stock Entry" }, { name: "Stock Reconciliation" }, { name: "Batch" },
      { name: "Serial No" }, { name: "UOM" }, { name: "Item Price" },
    ],
  },
  {
    slug: "buying", name: "Purchasing", icon: ShoppingBag, tint: "bg-warning-soft text-warning",
    description: "Suppliers, purchase orders, and receipts",
    doctypes: [
      { name: "Supplier" }, { name: "Supplier Group" }, { name: "Request for Quotation" },
      { name: "Supplier Quotation" }, { name: "Purchase Order" }, { name: "Purchase Invoice" },
      { name: "Purchase Receipt" }, { name: "Material Request" },
    ],
  },
  {
    slug: "accounts", name: "Accounting", icon: Landmark, tint: "bg-brand-50 text-brand-600",
    description: "General ledger, payments, taxes, and reports",
    doctypes: [
      { name: "Journal Entry" }, { name: "Payment Entry" }, { name: "Payment Request" },
      { name: "Chart of Accounts", label: "Chart of Accounts" }, { name: "Cost Center" },
      { name: "Mode of Payment" }, { name: "Tax Rule" }, { name: "Fiscal Year" },
      { name: "Period Closing Voucher" }, { name: "POS Opening Entry" },
    ],
  },
  {
    slug: "manufacturing", name: "Manufacturing", icon: Factory, tint: "bg-[#FFEDD5] text-[#EA580C]",
    description: "BOMs, work orders, and production plans",
    doctypes: [
      { name: "BOM", label: "Bill of Materials" }, { name: "Work Order" },
      { name: "Job Card" }, { name: "Production Plan" }, { name: "Workstation" },
      { name: "Operation" }, { name: "Routing" },
    ],
  },
  {
    slug: "projects", name: "Projects", icon: FolderKanban, tint: "bg-primary-50 text-primary-600",
    description: "Projects, tasks, and timesheets",
    doctypes: [
      { name: "Project" }, { name: "Task" }, { name: "Timesheet" },
      { name: "Project Template" }, { name: "Project Type" }, { name: "Activity Type" },
    ],
  },
  {
    slug: "hr", name: "HR & Payroll", icon: UserRoundCheck, tint: "bg-[#FCE7F3] text-[#DB2777]",
    description: "Employees, attendance, leave, and payroll",
    doctypes: [
      { name: "Employee" }, { name: "Attendance" }, { name: "Leave Application" },
      { name: "Leave Type" }, { name: "Expense Claim" }, { name: "Salary Slip" },
      { name: "Payroll Entry" }, { name: "Salary Structure" }, { name: "Appraisal" },
      { name: "Job Opening" }, { name: "Job Applicant" }, { name: "Shift Type" },
    ],
  },
  {
    slug: "assets", name: "Assets", icon: MonitorCog, tint: "bg-surface-muted text-ink-primary",
    description: "Fixed assets, depreciation, and maintenance",
    doctypes: [
      { name: "Asset" }, { name: "Asset Category" }, { name: "Asset Movement" },
      { name: "Asset Repair" }, { name: "Asset Maintenance" }, { name: "Location" },
    ],
  },
  {
    slug: "support", name: "Support", icon: Headphones, tint: "bg-[#CCFBF1] text-[#0D9488]",
    description: "Issues, service level agreements, and warranty",
    doctypes: [
      { name: "Issue" }, { name: "Service Level Agreement" }, { name: "Warranty Claim" },
      { name: "Maintenance Schedule" }, { name: "Maintenance Visit" },
    ],
  },
  {
    slug: "quality", name: "Quality", icon: BadgeCheck, tint: "bg-success-soft text-success",
    description: "Inspections, quality goals, and procedures",
    doctypes: [
      { name: "Quality Inspection" }, { name: "Quality Goal" }, { name: "Quality Procedure" },
      { name: "Quality Review" }, { name: "Quality Action" }, { name: "Non Conformance" },
    ],
  },
  {
    slug: "website", name: "Website", icon: Globe, tint: "bg-[#E0F2FE] text-[#0369A1]",
    description: "Portal pages, blog, and web shop settings",
    doctypes: [
      { name: "Web Page" }, { name: "Blog Post" }, { name: "Blog Category" },
      { name: "Web Form" }, { name: "Website Settings" },
    ],
  },
  {
    slug: "analytics",
    name: "Analytics",
    icon: ChartNoAxesCombined,
    tint: "bg-[#EDE9FE] text-[#7C3AED]",
    description: "KPI dashboard, revenue charts, cash flow, stock health, and more",
    doctypes: [
      { name: "Report" }, { name: "Dashboard" }, { name: "Dashboard Chart" },
      { name: "Number Card" }, { name: "Query Report" },
    ],
  },
  {
    slug: "setup", name: "Settings", icon: Settings, tint: "bg-surface-muted text-ink-secondary",
    description: "Company, users, permissions, and system setup",
    doctypes: [
      { name: "Company" }, { name: "User" }, { name: "Role" }, { name: "Role Profile" },
      { name: "Workflow" }, { name: "Workflow State" }, { name: "Print Format" },
      { name: "Letter Head" }, { name: "Email Account" }, { name: "Notification" },
      { name: "Currency" }, { name: "Global Defaults" }, { name: "System Settings" },
    ],
  },
];

/** Sidebar top-level navigation (most used first, NetPlus pinned at top). */
export const SIDEBAR_NAV: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Home", href: "/desk", icon: Wallet },
  { label: "Tracking Center", href: "/desk/tracking-center", icon: MapIcon as unknown as LucideIcon },
  { label: "NetPlus", href: "/desk/netplus", icon: ShieldCheck },
  { label: "Analytics", href: "/desk/analytics", icon: ChartNoAxesCombined },
  { label: "Sales", href: "/desk/selling", icon: ShoppingCart },
  { label: "CRM", href: "/desk/crm", icon: Users },
  { label: "Inventory", href: "/desk/stock", icon: Boxes },
  { label: "Purchasing", href: "/desk/buying", icon: Truck },
  { label: "Accounting", href: "/desk/accounts", icon: CreditCard },
  { label: "HR & Payroll", href: "/desk/hr", icon: UserRoundCheck },
  { label: "Projects", href: "/desk/projects", icon: ClipboardList },
  { label: "Settings", href: "/desk/setup", icon: Settings },
];

export function getModule(slug: string): ModuleDef | undefined {
  return MODULES.find((m) => m.slug === slug);
}

/** Recently used shortcuts on the Desk page — NetPlus items first. */
export const RECENT_SHORTCUTS = [
  { doctype: "Mission", icon: MapPin },
  { doctype: "Service Contract", icon: FileText },
  { doctype: "Sales Order", icon: ShoppingCart },
  { doctype: "Customer", icon: Users },
];
