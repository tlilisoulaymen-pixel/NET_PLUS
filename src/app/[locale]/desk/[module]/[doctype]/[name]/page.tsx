"use client";

import { use, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { FormRenderer } from "@/components/FormRenderer";
import { PrintStudioPanel } from "@/components/PrintStudioPanel";
import { useDoc, useMeta } from "@/lib/frappe/hooks";
import { getModule } from "@/config/modules";
import { StatusBadge } from "@/components/StatusBadge";
import { ChevronRight, Save, Send, XCircle, Copy, Printer, RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { frappe } from "@/lib/frappe/client";

import MissionForm from "@/components/missions/MissionForm";
import ServiceContractForm from "@/components/contracts/ServiceContractForm";

/** Generic document detail / edit view for ANY DocType. */
export default function DocPage({
  params,
}: {
  params: Promise<{ module: string; doctype: string; name: string }>;
}) {
  const router = useRouter();
  const printStudioRef = useRef<HTMLDivElement>(null);

  function openPrintStudio() {
    if (printStudioRef.current) {
      printStudioRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      // Expand the collapsible section by clicking its header if collapsed
      const head = printStudioRef.current.querySelector<HTMLElement>(".ps-section-head");
      const body = printStudioRef.current.querySelector<HTMLElement>(".ps-section-body");
      if (head && body && body.style.display === "none") head.click();
    }
  }
  const { module: moduleSlug, doctype: rawDoctype, name: rawName } = use(params);
  const doctype = decodeURIComponent(rawDoctype);
  const name = decodeURIComponent(rawName);
  const isNew = name === "new";
  const mod = getModule(moduleSlug);

  if (doctype === "Mission") return <MissionForm isNew={isNew} docName={isNew ? undefined : name} />;
  if (doctype === "Service Contract") return <ServiceContractForm isNew={isNew} docName={isNew ? undefined : name} />;

  const meta = useMeta(doctype);
  const doc = useDoc(doctype, isNew ? undefined : name);

  const docstatus = doc.data?.docstatus as number | undefined;
  const statusLabel =
    docstatus === 0 ? "Draft" : docstatus === 1 ? "Submitted" : docstatus === 2 ? "Cancelled" : null;

  const qc = useQueryClient();

  const submitDoc = useMutation({
    mutationFn: () => frappe.setDocstatus(doctype, name, 1),
    onSuccess: () => qc.invalidateQueries(),
  });

  const cancelDoc = useMutation({
    mutationFn: () => frappe.setDocstatus(doctype, name, 2),
    onSuccess: () => qc.invalidateQueries(),
  });

  async function amendDoc() {
    // In a real app this would create a new draft linked via amended_from
    // For now we just route to new
    router.push(`/desk/${moduleSlug}/${encodeURIComponent(doctype)}/new`);
  }



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
        <Link href={`/desk/${moduleSlug}/${encodeURIComponent(doctype)}`} className="hover:text-ink-primary">
          {doctype}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink-primary">{isNew ? `New ${doctype}` : name}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1>{isNew ? `New ${doctype}` : name}</h1>
          {statusLabel && <StatusBadge label={statusLabel} tone={docstatus === 1 ? "success" : docstatus === 2 ? "critical" : "warning"} />}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Reload & Print Icons */}
          {!isNew && (
            <>
              <button
                onClick={() => doc.refetch()}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] border transition-all hover:bg-[var(--bg-muted)]"
                style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--line)", color: "var(--ink-secondary)" }}
                title="Reload"
              >
                <RefreshCw className={`size-4 ${doc.isFetching ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={openPrintStudio}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] border transition-all hover:bg-[var(--bg-muted)]"
                style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--line)", color: "var(--ink-secondary)" }}
                title="Open Print Studio"
              >
                <Printer className="size-4" />
              </button>
            </>
          )}

          {/* Form Actions */}
          {!isNew && docstatus === 2 && (
            <button
              onClick={amendDoc}
              className="flex h-9 items-center gap-2 rounded-[10px] px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <Copy className="size-4" /> Amend
            </button>
          )}

          {!isNew && docstatus === 1 && (
            <button
              onClick={() => cancelDoc.mutate()}
              className="flex h-9 items-center gap-2 rounded-[10px] bg-red-500 px-4 text-[13px] font-medium text-white transition-opacity hover:bg-red-600 shadow-sm"
            >
              <XCircle className="size-4" /> Cancel
            </button>
          )}

          {!isNew && meta.data?.is_submittable === 1 && docstatus === 0 && (
            <button
              onClick={() => submitDoc.mutate()}
              className="flex h-9 items-center gap-2 rounded-[10px] bg-blue-500 px-4 text-[13px] font-medium text-white transition-opacity hover:bg-blue-600 shadow-sm"
            >
              <Send className="size-4" /> Submit
            </button>
          )}

          {(isNew || docstatus === 0) && (
            <button
              type="submit"
              form="frappe-doc-form"
              className="flex h-9 items-center gap-2 rounded-[10px] px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <Save className="size-4" /> {isNew ? "Create" : "Save"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-card border border-line bg-surface p-6 shadow-card lg:p-8">
        {meta.data ? (
          <FormRenderer
            meta={meta.data}
            initial={isNew ? undefined : doc.data}
            onSaved={(saved) => {
              if (isNew) {
                router.push(`/desk/${moduleSlug}/${encodeURIComponent(doctype)}/${encodeURIComponent(String(saved.name))}`);
              }
            }}
          />
        ) : (
          <MetaLoader doctype={doctype} />
        )}
      </div>

      {/* Print Studio — WYSIWYG template designer, always visible */}
      <div ref={printStudioRef}>
        <PrintStudioPanel
          doctype={doctype}
          name={isNew ? "new" : name}
          doc={(doc.data as Record<string, unknown>) ?? { doctype, name: "" }}
        />
      </div>
    </AppShell>
  );
}

function MetaLoader({ doctype }: { doctype: string }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <p className="col-span-full text-sm text-ink-muted">Loading {doctype} form…</p>
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-[66px] animate-pulse rounded-control bg-surface-muted" />
      ))}
    </div>
  );
}
