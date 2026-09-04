"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// ── Accent colour palette ────────────────────────────────────────────────────
export const ACCENT_COLORS = [
  { label: "Royal Blue",   value: "#4169E1" },
  { label: "Net Green",    value: "#6DB33F" },
  { label: "Teal",         value: "#0D9488" },
  { label: "Violet",       value: "#7C3AED" },
  { label: "Rose",         value: "#E11D48" },
  { label: "Amber",        value: "#D97706" },
  { label: "Cyan",         value: "#0284C7" },
  { label: "Slate",        value: "#475569" },
] as const;

export type Theme = "light" | "dark" | "system";
export type AccentColor = (typeof ACCENT_COLORS)[number]["value"];

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  accent: AccentColor;
  setAccent: (a: AccentColor) => void;
  /** resolved — "light" or "dark" (system evaluated) */
  resolved: "light" | "dark";
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "light",
  setTheme: () => {},
  accent: "#4169E1",
  setAccent: () => {},
  resolved: "light",
});

export function useTheme() { return useContext(ThemeContext); }

function resolveSystem(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, _setTheme] = useState<Theme>(() =>
    (typeof localStorage !== "undefined" ? (localStorage.getItem("np_theme") as Theme | null) : null) ?? "light",
  );
  const [accent, _setAccent] = useState<AccentColor>(() =>
    (typeof localStorage !== "undefined" ? (localStorage.getItem("np_accent") as AccentColor | null) : null) ?? "#4169E1",
  );
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    theme === "system" ? resolveSystem() : (theme as "light" | "dark"),
  );

  // Apply dark class + accent CSS var to <html>
  useEffect(() => {
    const r = theme === "system" ? resolveSystem() : (theme as "light" | "dark");
    setResolved(r);
    const html = document.documentElement;
    html.classList.toggle("dark", r === "dark");
    html.style.setProperty("--accent", accent);
    // Convert hex accent to RGB components for Tailwind opacity utilities
    const hex = accent.replace("#", "");
    const [rr, gg, bb] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    html.style.setProperty("--accent-rgb", `${rr} ${gg} ${bb}`);
  }, [theme, accent]);

  // Listen for system preference change
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r = mq.matches ? "dark" : "light";
      setResolved(r);
      document.documentElement.classList.toggle("dark", r === "dark");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  function setTheme(t: Theme) {
    _setTheme(t);
    localStorage.setItem("np_theme", t);
  }
  function setAccent(a: AccentColor) {
    _setAccent(a);
    localStorage.setItem("np_accent", a);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, accent, setAccent, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}
