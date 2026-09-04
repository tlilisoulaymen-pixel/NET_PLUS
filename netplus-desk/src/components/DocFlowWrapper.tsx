"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

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
      if (window.DocFlow) return resolve();
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
  if (typeof window === "undefined") return;
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

export function DocFlowWrapper({ moduleKey }: { moduleKey: string }) {
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
        window.DocFlow.mount(hostRef.current, { module: moduleKey });
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
    
    return () => { 
      cancelled = true; 
    };
  }, [key, moduleKey]);

  return (
    <div className="w-full flex flex-col gap-4 mt-6">
      <div className="flex justify-end">
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
        <div className="flex items-center justify-center gap-3 py-12 text-sm text-ink-muted animate-pulse border border-line rounded-xl bg-surface">
          <RefreshCw className="size-4 animate-spin" /> Loading Doc Flow…
        </div>
      )}

      {status === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <strong>Failed to load Doc Flow:</strong> {error}
        </div>
      )}

      <div 
        ref={hostRef} 
        className={`w-full min-h-[600px] bg-surface rounded-xl shadow-sm border border-line p-4 ${status === "ready" ? "block" : "hidden"}`}
      ></div>
    </div>
  );
}
