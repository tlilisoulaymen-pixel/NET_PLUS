"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import Link from "next/link";
import { ChevronRight, RefreshCw, MapPin } from "lucide-react";
import { getModule } from "@/config/modules";
import { GlobeCdn } from "@/components/ui/cobe-globe-cdn";

declare global {
  interface Window {
    TrackingCenter?: {
      mount: (selector: string | HTMLElement) => void;
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
      session?: {
        user: string;
      };
    };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-tc-src="${src}"]`)) {
      if (window.TrackingCenter) return resolve();
      const check = setInterval(() => {
        if (window.TrackingCenter) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        if (!window.TrackingCenter) reject(new Error("Timeout waiting for TrackingCenter"));
      }, 5000);
      return;
    }
    const s = document.createElement("script");
    s.setAttribute("data-tc-src", src);
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadCSS(href: string) {
  if (document.querySelector(`link[data-tc-href="${href}"]`)) return;
  const l = document.createElement("link");
  l.setAttribute("data-tc-href", href);
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
          .catch((err) => console.error(`[TrackingCenter] frappe.call ${method} failed:`, err));
      },
      format: (val: unknown) => String(val ?? ""),
      datetime: {
        get_datetime_as_string: () => new Date().toISOString(),
        now_date: () => new Date().toISOString().split("T")[0],
      },
      session: {
        user: "Administrator", // This is usually hydrated by the backend in Frappe
      },
    };
  } else if (!window.frappe.session) {
    window.frappe.session = { user: "Administrator" };
  }
}

export default function TrackingCenterPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [key, setKey] = useState(0);

  const mod = getModule("tracking-center");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setStatus("loading");
        injectShims();
        loadCSS("/tracking-center/tracking-center.css");
        await loadScript("/tracking-center/tracking-center.js");

        if (cancelled) return;

        // Force a minimum 3 seconds loading screen to show the globe animation
        await new Promise(r => setTimeout(r, 3000));
        
        if (cancelled) return;

        if (!window.TrackingCenter) {
          throw new Error("window.TrackingCenter is undefined after script load");
        }
        if (!hostRef.current) {
          throw new Error("host container ref is null");
        }

        hostRef.current.innerHTML = "";
        window.TrackingCenter.mount(hostRef.current);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[TrackingCenter]", msg);
          setError(msg);
          setStatus("error");
        }
      }
    }

    init();
    
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
        <span className="text-ink-primary">{mod?.name || "Tracking Center"}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>{mod?.name || "Tracking Center"}</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {mod?.description}
          </p>
        </div>
        
        <button
          onClick={() => setKey((k) => k + 1)}
          className="flex h-9 items-center gap-2 rounded-[10px] border px-4 text-[13px] font-medium transition-all hover:bg-[var(--bg-muted)] shadow-sm"
          style={{ borderColor: "var(--line)", color: "var(--ink-secondary)" }}
          title="Refresh"
        >
          <RefreshCw className={`size-4 ${status === "loading" ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {status === "loading" && (
        <div className="mt-6 flex items-center justify-center w-full min-h-[600px] bg-white rounded-xl overflow-hidden border border-line shadow-sm">
          <div className="w-full max-w-lg p-8">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  className="w-5 h-5 text-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <h2 className="text-sm font-semibold tracking-tight">Tracking Center</h2>
              </div>
              <p className="text-sm text-gray-500 mb-6">Connexion au réseau satellite et récupération des flux...</p>
              <GlobeCdn className="w-full max-w-[400px] mx-auto mt-4" speed={0.005} />
            </div>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <strong>Failed to load Tracking Center:</strong> {error}
        </div>
      )}

      <div 
        ref={hostRef} 
        className={`mt-6 w-full min-h-[600px] bg-surface rounded-xl shadow-sm border border-line p-0 overflow-hidden ${status === "ready" ? "block" : "hidden"}`}
      ></div>
    </AppShell>
  );
}
