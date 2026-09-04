"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useLoggedUser } from "@/lib/frappe/hooks";
import { FrappeError } from "@/lib/frappe/client";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const user = useLoggedUser();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (
      user.error instanceof FrappeError &&
      (user.error.status === 401 || user.error.status === 403)
    ) {
      router.replace("/login");
    }
  }, [user.error, router]);

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
