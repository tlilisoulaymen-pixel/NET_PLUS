"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useLoggedUser } from "@/lib/frappe/hooks";
import { FrappeError, BackendOfflineError } from "@/lib/frappe/client";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const user = useLoggedUser();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const err = user.error;
    if (!err) return;

    if (err instanceof BackendOfflineError) {
      // Backend is starting — don't redirect, just show the offline overlay
      return;
    }

    if (
      err instanceof FrappeError &&
      (err.status === 401 || err.status === 403)
    ) {
      router.replace("/login");
    }
  }, [user.error, router]);

  // Backend offline overlay
  if (user.error instanceof BackendOfflineError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{ backgroundColor: "var(--bg-app)" }}>
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="size-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--line)" }}>
            {/* Animated spinner */}
            <svg className="animate-spin size-8" style={{ color: "var(--accent)" }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--ink-primary)" }}>
              Démarrage de NetPlus…
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-secondary)" }}>
              Le serveur backend est en cours de démarrage.<br />
              Cette page se rechargera automatiquement.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 rounded-lg text-sm font-medium transition"
            style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          >
            Réessayer maintenant
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-app)" }}>
      <Sidebar isCollapsed={isCollapsed} onToggleCollapse={() => setIsCollapsed(!isCollapsed)} />
      <Topbar />
      <main
        className="pt-[var(--topbar-height)] transition-all duration-500"
        style={{
          marginLeft: isCollapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-width)",
          transitionTimingFunction: "cubic-bezier(0.25, 1.1, 0.4, 1)",
        }}
      >
        <div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

