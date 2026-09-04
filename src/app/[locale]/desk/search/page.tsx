"use client";

import { use, useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { frappe } from "@/lib/frappe/client";
import { MODULES } from "@/config/modules";
import Link from "next/link";
import { Search, FileText } from "lucide-react";

interface Hit {
  doctype: string;
  name: string;
  module: string;
}

const SEARCHABLE_DOCTYPES = MODULES.flatMap((m) =>
  m.doctypes.map((d) => ({ doctype: d.name, module: m.slug })),
).slice(0, 20); // limit concurrent searches

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = use(searchParams);
  const [q, setQ] = useState(rawQ ?? "");
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rawQ) return;
    setQ(rawQ);
    doSearch(rawQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawQ]);

  async function doSearch(term: string) {
    if (!term.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const hits: Hit[] = [];
      await Promise.all(
        SEARCHABLE_DOCTYPES.map(async ({ doctype, module }) => {
          try {
            const rows = await frappe.list(doctype, {
              fields: ["name"],
              filters: { name: ["like", `%${term}%`] },
              limit: 5,
            });
            rows.forEach((r) =>
              hits.push({ doctype, module, name: String(r.name) }),
            );
          } catch { /* skip restricted doctypes */ }
        }),
      );
      setResults(hits.sort((a, b) => a.doctype.localeCompare(b.doctype)));
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    doSearch(q);
  }

  return (
    <AppShell>
      <h1>Global Search</h1>

      <form onSubmit={handleSearch} className="mt-5 flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
            style={{ color: "var(--ink-muted)" }}
          />
          <input
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search across all modules…"
            className="h-11 w-full rounded-[10px] border pl-9 pr-4 text-sm"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--line-strong)",
              color: "var(--ink-primary)",
            }}
          />
        </div>
        <button
          type="submit"
          className="h-11 rounded-[10px] px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Search
        </button>
      </form>

      <div className="mt-8">
        {loading && (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-[12px]" style={{ backgroundColor: "var(--bg-muted)" }} />
            ))}
          </div>
        )}

        {!loading && results.length === 0 && q && (
          <div className="mt-16 text-center">
            <Search className="mx-auto size-10 opacity-20" style={{ color: "var(--ink-muted)" }} />
            <p className="mt-3 text-sm" style={{ color: "var(--ink-secondary)" }}>
              No results for <strong>&ldquo;{q}&rdquo;</strong>
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              Try a different term or navigate directly via the sidebar.
            </p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div
            className="overflow-hidden rounded-[14px] border"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--line)" }}
          >
            {results.map((hit, i) => (
              <Link
                key={`${hit.doctype}-${hit.name}`}
                href={`/desk/${hit.module}/${encodeURIComponent(hit.doctype)}/${encodeURIComponent(hit.name)}`}
                className="flex items-center gap-3 border-b px-4 py-3 text-sm transition-colors last:border-0 hover:bg-[var(--bg-muted)]"
                style={{ borderColor: "var(--line)" }}
              >
                <FileText className="size-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
                <div>
                  <span className="font-medium" style={{ color: "var(--ink-primary)" }}>
                    {hit.name}
                  </span>
                  <span className="ml-2 text-[12px]" style={{ color: "var(--ink-muted)" }}>
                    {hit.doctype}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
