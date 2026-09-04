"use client";

import Link from "next/link";
import { formatDate, formatMoney, statusTone } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import type { MetaField } from "@/lib/frappe/client";

export interface Column {
  key: string;
  label: string;
  fieldtype?: string;
  renderCell?: (row: any) => React.ReactNode;
}

/** Build sensible list columns from DocType meta (falls back to generic columns). */
export function columnsFromMeta(metaFields: MetaField[] | undefined, titleField?: string): Column[] {
  const base: Column[] = [{ key: "name", label: "ID" }];
  if (!metaFields?.length) {
    return [...base, { key: titleField ?? "modified", label: titleField ?? "Modified", fieldtype: "Date" }];
  }
  const inList = metaFields.filter((f) => f.in_list_view && !f.hidden).slice(0, 5);
  const cols = inList.map((f) => ({ key: f.fieldname, label: f.label, fieldtype: f.fieldtype }));
  if (!cols.some((c) => c.key === "status") && metaFields.some((f) => f.fieldname === "status")) {
    cols.push({ key: "status", label: "Status", fieldtype: "Data" });
  }
  cols.push({ key: "modified", label: "Modified", fieldtype: "Date" });
  return [...base, ...cols.filter((c) => c.key !== "name")];
}

export function DataTable({
  rows,
  columns,
  moduleSlug,
  doctype,
  loading,
  rowClassName,
}: {
  rows: Record<string, unknown>[];
  columns: Column[];
  moduleSlug: string;
  doctype: string;
  loading?: boolean;
  rowClassName?: (row: Record<string, unknown>) => string;
}) {
  if (loading) {
    return (
      <div className="rounded-card border border-line bg-surface p-6 shadow-card">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="mb-3 h-11 animate-pulse rounded-md bg-surface-muted" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="grid place-items-center rounded-card border border-dashed border-line-strong bg-surface py-20 text-center shadow-card">
        <div>
          <p className="text-[15px] font-semibold text-ink-heading">No records yet</p>
          <p className="mt-1 text-[13px] text-ink-secondary">Create your first {doctype} to see it here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-app/60 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            {columns.map((c) => (
              <th key={c.key} className="px-4 py-3 first:pl-5 last:pr-5">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const customClass = rowClassName ? rowClassName(row) : "";
            return (
              <tr key={String(row.name)} className={`border-b border-line/60 transition-colors last:border-0 hover:bg-[#F8FAFC] ${customClass}`}>
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3 first:pl-5 last:pr-5">
                  {c.renderCell ? (
                    c.renderCell(row)
                  ) : c.key === "name" ? (
                    <Link
                      href={`/desk/${moduleSlug}/${encodeURIComponent(doctype)}/${encodeURIComponent(String(row.name))}`}
                      className="font-medium text-primary-500 hover:underline"
                    >
                      {String(row.name)}
                    </Link>
                  ) : c.key === "status" ? (
                    <StatusBadge label={String(row.status ?? row.docstatus_label ?? "—")} tone={statusTone(String(row.status ?? ""))} />
                  ) : c.fieldtype === "Currency" || c.fieldtype === "Float" ? (
                    <span className="num block text-right">{formatMoney(row[c.key])}</span>
                  ) : c.fieldtype === "Date" || c.fieldtype === "Datetime" || c.key === "modified" ? (
                    <span className="num text-ink-secondary">{formatDate(row[c.key])}</span>
                  ) : (
                    <span className="text-ink-primary">{row[c.key] != null ? String(row[c.key]) : "—"}</span>
                  )}
                </td>
              ))}
            </tr>
          );
          })}
        </tbody>
      </table>
    </div>
  );
}
