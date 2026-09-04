"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";

declare global {
  interface Window {
    DocFlow?: {
      mount: (selector: string | HTMLElement, opts?: Record<string, unknown>) => void;
    };
    __?: (s: string) => string;
    frappe?: {
      call: (opts: {
        method: string;
        args?: Record<string, unknown>;
        callback?: (r: { message: unknown }) => void;
      }) => void;
      format?: (val: unknown, df: any) => string;
      datetime?: {
        get_datetime_as_string: () => string;
        now_date: () => string;
      };
    };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-df-src="${src}"]`)) {
      const check = setInterval(() => {
        if (window.DocFlow) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        if (!window.DocFlow) reject(new Error("Timeout waiting for DocFlow"));
      }, 5000);
      return;
    }
    const s = document.createElement("script");
    s.setAttribute("data-df-src", src);
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadCSS(href: string) {
  if (document.querySelector(`link[data-df-href="${href}"]`)) return;
  const l = document.createElement("link");
  l.setAttribute("data-df-href", href);
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

function injectShims() {
  if (!window.__) window.__ = (s: string) => s;

  if (!window.frappe) {
    window.frappe = {
      call({ method, args, callback }) {
        fetch(`/api/method/${method}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": "fetch" },
          body: JSON.stringify(args ?? {}),
        })
          .then((r) => r.json())
          .then((r) => callback?.({ message: r.message }))
          .catch((err) => console.error(`[DocFlow] frappe.call ${method} failed:`, err));
      },
      format: (val: unknown) => String(val ?? ""),
      datetime: {
        get_datetime_as_string: () => new Date().toISOString(),
        now_date: () => new Date().toISOString().split("T")[0],
      },
    };
  }
}

export default function DocFlowPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [key, setKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setStatus("loading");
        injectShims();
        loadCSS("/doc-flow/doc-flow.css");
        await loadScript("/doc-flow/doc-flow.js");

        if (cancelled) return;

        if (!window.DocFlow) {
          throw new Error("window.DocFlow is undefined after script load");
        }
        if (!hostRef.current) {
          throw new Error("host container ref is null");
        }

        hostRef.current.innerHTML = "";
        
        // Extract hash if any (e.g. #purchase_invoice)
        const hash = window.location.hash.replace("#", "");
        const opts = hash ? { module: hash } : {};
        
        window.DocFlow.mount(hostRef.current, opts);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[DocFlow]", msg);
          setError(msg);
          setStatus("error");
        }
      }
    }

    init();
    
    // Listen for hash changes to remount if needed
    const handleHashChange = () => setKey(k => k + 1);
    window.addEventListener("hashchange", handleHashChange);
    
    return () => { 
      cancelled = true; 
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [key]);

  return (
    <AppShell>
      <nav className="flex items-center gap-1.5 text-[13px] text-ink-muted" aria-label="Breadcrumb">
        <Link href="/desk" className="hover:text-ink-primary">Desk</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink-primary">Doc Flow</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1>Doc Flow Workspace</h1>
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

      {status === "loading" && (
        <div className="mt-6 flex items-center gap-3 text-sm text-ink-muted animate-pulse">
          <RefreshCw className="size-4 animate-spin" /> Loading Doc Flow…
        </div>
      )}

      {status === "error" && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <strong>Failed to load Doc Flow:</strong> {error}
        </div>
      )}

      <div 
        ref={hostRef} 
        className={`mt-6 ${status === "ready" ? "block" : "hidden"} min-h-[600px] w-full bg-surface rounded-xl shadow-sm border border-line p-4`}
      ></div>
    </AppShell>
  );
}
