"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { DataTable, columnsFromMeta } from "@/components/DataTable";
import { useDocList, useMeta } from "@/lib/frappe/hooks";
import { getModule } from "@/config/modules";
import { ChevronRight, Plus, RefreshCw, MoreHorizontal, Download, Settings } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { frappe } from "@/lib/frappe/client";
import { DocFlowWrapper } from "@/components/DocFlowWrapper";

const PAGE_SIZE = 20;

const DOCFLOW_MODULES: Record<string, string> = {
  "Quotation": "quotation",
  "Sales Order": "sales_order",
  "Delivery Note": "delivery_note",
  "Sales Invoice": "sales_invoice",
  "Purchase Order": "purchase_order",
  "Purchase Receipt": "purchase_receipt",
  "Purchase Invoice": "purchase_invoice",
  "Journal Entry": "journal_entry",
  "Stock Entry": "stock_entry",
  "Payment Entry": "payment_in", 
};

/**
 * Generic DocType list view.
 * Works for /desk/selling/Sales Order AND /desk/_doctype/Any%20DocType —
 * columns are derived from Frappe metadata (in_list_view fields), so nothing
 * breaks for custom or unlisted DocTypes.
 */
export default function DocTypeListPage({ params }: { params: Promise<{ module: string; doctype: string }> }) {
  const { module: moduleSlug, doctype: rawDoctype } = use(params);
  const doctype = decodeURIComponent(rawDoctype);
  const mod = getModule(moduleSlug);

  const [page, setPage] = useState(0);
  const meta = useMeta(doctype);
  const listFields = useMemo(() => {
    const cols = columnsFromMeta(meta.data?.fields, meta.data?.title_field);
    return [...new Set(["name", "modified", ...cols.map((c) => c.key)])];
  }, [meta.data]);

  const list = useDocList(doctype, {
    fields: listFields,
    limit: PAGE_SIZE,
    start: page * PAGE_SIZE,
    orderBy: "modified desc",
  });
  const total = useQuery({
    queryKey: ["count", doctype],
    queryFn: () => frappe.count(doctype),
  });

  const columns = useMemo(() => columnsFromMeta(meta.data?.fields, meta.data?.title_field), [meta.data]);
  const pageCount = total.data ? Math.ceil(total.data / PAGE_SIZE) : page + (list.data?.length === PAGE_SIZE ? 2 : 1);

  return (
    <AppShell>
      <nav className="flex items-center gap-1.5 text-[13px] text-ink-muted" aria-label="Breadcrumb">
        <Link href="/desk" className="hover:text-ink-primary">Desk</Link>
        <ChevronRight className="size-3.5" />
        {mod && (
          <>
            <Link href={`/desk/${mod.slug}`} className="hover:text-ink-primary">{mod.name}</Link>
            <ChevronRight className="size-3.5" />
          </>
        )}
        <span className="text-ink-primary">{doctype}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>{doctype}</h1>
          {!DOCFLOW_MODULES[doctype] && (
            <p className="mt-0.5 text-sm text-ink-secondary">
              {total.data != null ? `${total.data.toLocaleString()} records` : "Loading…"}
            </p>
          )}
        </div>
        {!DOCFLOW_MODULES[doctype] && (
        <div className="flex items-center gap-2">
          {/* Actions Dropdown (Static for now, matches ERPNext List View actions) */}
          <div className="group relative">
            <button
              className="flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-all hover:bg-[var(--bg-muted)]"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--line)",
                color: "var(--ink-primary)"
              }}
            >
              <span>Actions</span>
              <MoreHorizontal className="size-4" style={{ color: "var(--ink-muted)" }} />
            </button>
            <div className="absolute right-0 mt-1 hidden w-48 flex-col rounded-xl border bg-surface p-1 shadow-card group-hover:flex z-50 border-line">
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-ink-primary hover:bg-bg-muted">
                <Download className="size-4 text-ink-muted" /> Export
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-ink-primary hover:bg-bg-muted">
                <Settings className="size-4 text-ink-muted" /> List Settings
              </button>
            </div>
          </div>

          <button
            onClick={() => list.refetch()}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border transition-all hover:bg-[var(--bg-muted)]"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--line)",
              color: "var(--ink-secondary)"
            }}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={`size-4 ${list.isFetching ? "animate-spin" : ""}`} />
          </button>
          
          <Link
            href={`/desk/${moduleSlug}/${encodeURIComponent(doctype)}/new`}
            className="flex h-9 items-center gap-2 rounded-[10px] px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
            style={{ backgroundColor: "var(--accent)" }}
          >
            <Plus className="size-4" /> Add {doctype}
          </Link>
        </div>
        )}
      </div>

      <div className="mt-6">
        {DOCFLOW_MODULES[doctype] ? (
          <DocFlowWrapper moduleKey={DOCFLOW_MODULES[doctype]} />
        ) : (
          <DataTable
            rows={list.data ?? []}
            columns={columns}
            moduleSlug={moduleSlug}
            doctype={doctype}
            loading={list.isLoading || meta.isLoading}
          />
        )}
      </div>

      {!DOCFLOW_MODULES[doctype] && pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-secondary">
          <span className="num">Page {page + 1} of {pageCount}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="h-9 rounded-control border border-line-strong bg-surface px-3 font-medium disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="h-9 rounded-control border border-line-strong bg-surface px-3 font-medium disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
