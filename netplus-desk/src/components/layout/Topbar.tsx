"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { frappe } from "@/lib/frappe/client";
import { useLoggedUserDoc } from "@/lib/frappe/hooks";
import { useTheme, ACCENT_COLORS, type Theme } from "@/lib/theme";
import {
  Search, Plus, Bell, Sparkles, Sun, Moon, Monitor,
  LogOut, ChevronDown, Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { ActionSearchBar } from "@/components/ui/action-search-bar";

// ── Topbar ───────────────────────────────────────────────────────────────────
export function Topbar() {
  const router = useRouter();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const userDocQuery = useLoggedUserDoc();
  const t = useTranslations("Topbar");

  const userDoc = userDocQuery.data;
  const username = userDoc?.name || "User";
  const fullName = userDoc?.full_name || username;
  const rawImage = userDoc?.user_image as string | undefined;
  // Frappe user_image: "/files/..." or "/private/files/..." — both proxied by Next.js rewrites.
  // Use as-is (they resolve on Vercel). Undefined/empty → show initials fallback.
  const userImage = rawImage && rawImage.trim() !== "" ? rawImage : undefined;
  const initials = (userDoc?.first_name || userDoc?.email || "?").slice(0, 2).toUpperCase();


  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showNotif, setShowNotif] = useState(false);

  const userRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUserMenu(false);
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setShowThemeMenu(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function handleSearch(term: string) {
    if (!term) return;
    // "DocType: value" → jump directly to filtered list
    const colonIdx = term.indexOf(":");
    if (colonIdx > 2) {
      const dt = term.slice(0, colonIdx).trim();
      const val = term.slice(colonIdx + 1).trim();
      router.push(`/desk/all/${encodeURIComponent(dt)}?q=${encodeURIComponent(val)}`);
    } else {
      router.push(`/desk/search?q=${encodeURIComponent(term)}`);
    }
  }

  async function logout() {
    await frappe.logout();
    router.push("/login");
  }

  const THEME_OPTIONS: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: "light",  icon: <Sun className="size-4" />,     label: "Light" },
    { value: "dark",   icon: <Moon className="size-4" />,    label: "Dark" },
    { value: "system", icon: <Monitor className="size-4" />, label: "System" },
  ];

  return (
    <header
      className="fixed left-[var(--sidebar-width)] right-0 top-0 z-30 flex h-[var(--topbar-height)] items-center gap-3 border-b px-4 sm:px-6"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--line)" }}
    >
      {/* Search */}
      <div className="w-full max-w-xl">
        <ActionSearchBar onSearch={handleSearch} />
      </div>

      <div className="ml-auto flex items-center gap-1">

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <IconBtn label="Notifications" onClick={() => setShowNotif((v) => !v)}>
            <Bell className="size-[18px]" />
          </IconBtn>
          {showNotif && (
            <Dropdown className="right-0 w-72">
              <p className="px-4 pb-3 pt-2 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
                No new notifications
              </p>
            </Dropdown>
          )}
        </div>

        {/* Ask AI (Static) */}
        <button
          className="flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-all hover:bg-[var(--bg-muted)]"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--line)",
            color: "var(--ink-primary)"
          }}
          title="Ask AI (Coming Soon)"
        >
          <Sparkles className="size-4" style={{ color: "var(--accent)" }} />
          Ask AI
        </button>

        {/* Theme + Accent */}
        <div ref={themeRef} className="relative">
          <IconBtn label="Appearance" onClick={() => setShowThemeMenu((v) => !v)}>
            <Palette className="size-[18px]" />
          </IconBtn>
          {showThemeMenu && (
            <Dropdown className="right-0 w-64">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>
                Theme
              </p>
              <div className="flex gap-1 px-3 pb-3">
                {THEME_OPTIONS.map(({ value, icon, label }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex flex-1 flex-col items-center gap-1.5 rounded-lg border py-2 text-[11px] font-medium transition-all",
                      theme === value
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--line)] text-[var(--ink-secondary)] hover:border-[var(--line-strong)]",
                    )}
                    style={{ backgroundColor: "var(--bg-muted)" }}
                    title={label}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>
                Accent colour
              </p>
              <div className="flex flex-wrap gap-2 px-3 pb-3">
                {ACCENT_COLORS.map(({ value, label }) => (
                  <button
                    key={value}
                    title={label}
                    onClick={() => setAccent(value)}
                    className={cn(
                      "size-7 rounded-full transition-all",
                      accent === value && "ring-2 ring-offset-2 ring-offset-[var(--bg-surface)]",
                    )}
                    style={{
                      backgroundColor: value,
                      outlineColor: value,
                    }}
                  />
                ))}
              </div>
            </Dropdown>
          )}
        </div>

        {/* User menu */}
        <div ref={userRef} className="relative ml-1">
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            className="flex items-center gap-2 rounded-[10px] px-2 py-1 transition-colors hover:bg-[var(--bg-muted)]"
          >
            {userImage ? (
              <img src={userImage} alt="Profile" className="size-8 rounded-full object-cover border border-[var(--line)]" />
            ) : (
              <span
                className="grid size-8 place-items-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {initials}
              </span>
            )}
            <span className="hidden max-w-[130px] truncate text-[13px] font-medium md:block" style={{ color: "var(--ink-primary)" }}>
              {fullName}
            </span>
            <ChevronDown className="size-3.5" style={{ color: "var(--ink-muted)" }} />
          </button>

          {showUserMenu && (
            <Dropdown className="right-0 w-64">
              {/* Profile links */}
              <div className="p-1">
                <MenuItem
                  icon={userImage ? <img src={userImage} alt="Profile" className="size-4 rounded-full object-cover" /> : <Image src="/logo.png" alt="Profile" width={16} height={16} className="rounded" />}
                  label={fullName}
                  sub="View profile"
                  onClick={() => { router.push(`/desk/profile`); setShowUserMenu(false); }}
                />
                <MenuItem
                  icon={<LogOut className="size-4" />}
                  label={t('logout')}
                  onClick={logout}
                  danger
                />
              </div>
            </Dropdown>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────
function IconBtn({
  children, label, onClick,
}: { children: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-[10px] transition-colors hover:bg-[var(--bg-muted)]"
      style={{ color: "var(--ink-secondary)" }}
    >
      {children}
    </button>
  );
}

function Dropdown({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "absolute top-[calc(100%+6px)] z-50 min-w-[180px] overflow-hidden rounded-[14px] border shadow-xl",
        className,
      )}
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--line)",
        boxShadow: "0 12px 32px rgba(15,23,42,0.15)",
      }}
    >
      {children}
    </div>
  );
}

function MenuItem({
  icon, label, sub, onClick, danger = false,
}: { icon: React.ReactNode; label: string; sub?: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-[var(--bg-muted)]"
      style={{ color: danger ? "#D64545" : "var(--ink-primary)" }}
    >
      <span style={{ color: danger ? "#D64545" : "var(--ink-muted)" }}>{icon}</span>
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        {sub && <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>{sub}</p>}
      </div>
    </button>
  );
}
