"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";

declare global {
  interface Window {
    AnalyticsHub?: {
      mount: (selector: string | HTMLElement, opts?: Record<string, unknown>) => void;
    };
    __?: (s: string) => string;
    frappe?: {
      call: (opts: {
        method: string;
        args?: Record<string, unknown>;
        callback?: (r: { message: unknown }) => void;
      }) => void;
      format?: (val: unknown) => string;
      Chart?: unknown;
    };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-ah-src="${src}"]`)) {
      // Script is already in DOM. It might still be downloading.
      // Poll until AnalyticsHub is available.
      const check = setInterval(() => {
        if (window.AnalyticsHub) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        if (!window.AnalyticsHub) reject(new Error("Timeout waiting for AnalyticsHub"));
      }, 5000);
      return;
    }
    const s = document.createElement("script");
    s.setAttribute("data-ah-src", src);
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadCSS(href: string) {
  if (document.querySelector(`link[data-ah-href="${href}"]`)) return;
  const l = document.createElement("link");
  l.setAttribute("data-ah-href", href);
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

/** Injects lightweight shims so analytics-dashboard.js works outside Frappe Desk */
function injectShims() {
  // i18n passthrough
  if (!window.__) window.__ = (s: string) => s;

  // analytics-dashboard.js hardcodes API = "analytics.api."
  // Our module lives at netplus.analytics.api.* — rewrite on the fly
  const fixMethod = (m: string) =>
    m.startsWith("analytics.api.") ? m.replace("analytics.api.", "netplus.analytics.api.") : m;

  // frappe.call → proxied through Next.js /api/method/… rewrite (same session cookie)
  if (!window.frappe) {
    window.frappe = {
      call({ method, args, callback }) {
        const resolved = fixMethod(method);
        fetch(`/api/method/${resolved}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": "fetch" },
          body: JSON.stringify(args ?? {}),
        })
          .then((r) => r.json())
          .then((r) => callback?.({ message: r.message }))
          .catch((err) => console.error(`[AnalyticsHub] frappe.call ${resolved} failed:`, err));
      },
      format: (val: unknown) => String(val ?? ""),
      Chart: undefined, // dashboard falls back to its built-in SVG renderer
    };
  }
}

export default function AnalyticsPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [key, setKey] = useState(0); // bump to force remount

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setStatus("loading");
        injectShims();
        loadCSS("/analytics-hub/analytics-dashboard.css");
        await loadScript("/analytics-hub/analytics-dashboard.js");

        if (cancelled) return;

        if (!window.AnalyticsHub) {
          throw new Error("window.AnalyticsHub is undefined after script load");
        }
        if (!hostRef.current) {
          throw new Error("host container ref is null");
        }

        // Clear previous mount on remount
        hostRef.current.innerHTML = "";
        window.AnalyticsHub.mount(hostRef.current);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[AnalyticsHub]", msg);
          setError(msg);
          setStatus("error");
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [key]);

  return (
    <AppShell>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px] text-ink-muted" aria-label="Breadcrumb">
        <Link href="/desk" className="hover:text-ink-primary">Desk</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink-primary">Analytics Hub</span>
      </nav>

      {/* Header */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1>Analytics Hub</h1>
        <button
          onClick={() => setKey((k) => k + 1)}
          className="flex h-9 items-center gap-2 rounded-[10px] border px-4 text-[13px] font-medium transition-all hover:bg-[var(--bg-muted)]"
          style={{ borderColor: "var(--line)", color: "var(--ink-secondary)" }}
          title="Refresh"
        >
          <RefreshCw className={`size-4 ${status === "loading" ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Status banners */}
      {status === "loading" && (
        <div className="mt-6 flex items-center gap-3 text-sm text-ink-muted animate-pulse">
          <RefreshCw className="size-4 animate-spin" /> Loading Analytics Hub…
        </div>
      )}
      {status === "error" && (
        <div className="mt-6 rounded-card border border-danger/30 bg-danger-soft px-5 py-4 text-sm text-danger">
          <p className="font-semibold">Failed to load Analytics Hub</p>
          <p className="mt-1 font-mono text-xs">{error}</p>
        </div>
      )}

      {/* Dashboard host — AnalyticsHub.mount() renders inside this div */}
      <div ref={hostRef} className="mt-6" />
    </AppShell>
  );
}
