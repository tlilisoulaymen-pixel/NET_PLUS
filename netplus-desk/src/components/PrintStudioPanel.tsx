"use client";

import { useEffect, useRef, useState } from "react";

interface PrintStudioPanelProps {
  doctype: string;
  name: string;
  doc: Record<string, unknown>;
}

declare global {
  interface Window {
    PrintStudio?: {
      mount: (
        el: HTMLElement,
        opts: { doctype: string; sampleDoc: Record<string, unknown>; cssUrl?: string }
      ) => { refreshPreview: () => void; opts?: { sampleDoc: Record<string, unknown> } };
    };
    PS_QR?: unknown;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Already loaded and executed
    if (document.querySelector(`script[data-ps-src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.setAttribute("data-ps-src", src);
    s.src = src;
    s.onload = () => resolve();
    s.onerror = (e) => reject(new Error(`Failed to load ${src}: ${e}`));
    document.head.appendChild(s);
  });
}

function loadCSS(href: string) {
  if (document.querySelector(`link[data-ps-href="${href}"]`)) return;
  const l = document.createElement("link");
  l.setAttribute("data-ps-href", href);
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

export function PrintStudioPanel({ doctype, name, doc }: PrintStudioPanelProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<{
    refreshPreview: () => void;
    opts?: { sampleDoc: Record<string, unknown> };
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        loadCSS("/print-studio/print-studio.css");
        setStatus("loading");

        // Polyfill Frappe's translation function — used by print-studio.js
        if (!window.__) {
          (window as unknown as Record<string, unknown>).__ = (s: string) => s;
        }

        await loadScript("/print-studio/qr-reference.js");
        await loadScript("/print-studio/print-studio.js");

        if (cancelled) return;

        if (!window.PrintStudio) {
          throw new Error("window.PrintStudio is undefined after script load");
        }
        if (!hostRef.current) {
          throw new Error("host container ref is null");
        }

        widgetRef.current = window.PrintStudio.mount(hostRef.current, {
          doctype,
          sampleDoc: { doctype, ...doc },
          cssUrl: "/print-studio/print-studio.css",
        });

        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[PrintStudio]", msg);
          setErrorMsg(msg);
          setStatus("error");
        }
      }
    }

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  // Refresh preview on doc changes
  useEffect(() => {
    if (status !== "ready" || !widgetRef.current) return;
    if (widgetRef.current.opts) {
      widgetRef.current.opts.sampleDoc = { doctype, ...doc };
    }
    try { widgetRef.current.refreshPreview(); } catch { /* ignore */ }
  }, [doc, doctype, status]);

  return (
    <div className="mt-6 rounded-card border border-line bg-surface shadow-card">
      {/* Header — always visible */}
      <div className="flex items-center gap-2 border-b border-line px-6 py-4">
        <span className="text-base font-semibold text-ink-primary">🖨 Document Template Designer</span>
        {status === "loading" && (
          <span className="ml-2 text-xs text-ink-muted animate-pulse">Loading designer…</span>
        )}
        {status === "error" && (
          <span className="ml-2 text-xs text-red-500" title={errorMsg}>⚠ Failed to load — check console</span>
        )}
      </div>

      {/* Designer host — PrintStudio mounts inside here */}
      <div className="px-2 py-2" ref={hostRef} />

      {/* Fallback if error */}
      {status === "error" && (
        <div className="px-6 pb-4 text-xs text-ink-muted">
          <p>Error: <code className="text-red-500">{errorMsg}</code></p>
          <p className="mt-1">Make sure <code>/print-studio/print-studio.js</code> is accessible.</p>
        </div>
      )}
    </div>
  );
}
